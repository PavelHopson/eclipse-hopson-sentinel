import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import path from 'node:path';
import { createVoiceSession } from './session.mjs';

const request = { profile: 'ultron-angry', text: 'Я здесь.' };
const config = Object.fromEntries(['python', 'modelRoot', 'modelLock', 'sandboxHost'].map(key => [key, path.resolve(key)]));
const tick = () => new Promise(resolve => setImmediate(resolve));
function child() {
  const proc = new EventEmitter(); proc.pid = 123;
  proc.stdin = new PassThrough(); proc.stdout = new PassThrough(); proc.stderr = new PassThrough();
  return proc;
}
function reply(proc, sequence, override = {}) {
  const wav = Buffer.alloc(4844);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  proc.stdout.write(JSON.stringify({ ok: true, sequence, profile: 'ultron-angry', audio: wav.toString('base64'),
    loadSeconds: sequence ? 0 : 10, synthesisSeconds: 1, durationSeconds: .1, ...override }) + '\n');
}
function setup(options = {}) {
  const procs = []; let kills = 0;
  const run = createVoiceSession({ ...config, spawnProcess: (exe, argv, opts) => {
    assert.equal(exe, config.sandboxHost); assert.ok(argv.includes('--session'));
    assert.equal(opts.shell, false); assert.equal(opts.windowsHide, true);
    const proc = child(); procs.push(proc); return proc;
  }, killProcess: proc => { kills++; proc.emit('close', 1); }, ...options });
  return { run, procs, get current() { return procs.at(-1); }, get kills() { return kills; } };
}
test('reuses one model process, newline framing and sequence, then Stop releases it', async () => {
  const env = setup();
  for (let i = 0; i < 3; i++) {
    const task = env.run(request); reply(env.current, i); const result = await task;
    assert.equal(result.loadSeconds, i ? 0 : 10); assert.equal(env.procs.length, 1);
  }
  assert.equal(env.current.stdin.read().toString().split('\n').filter(Boolean).length, 3);
  await env.run.stop(); assert.equal(env.kills, 1);
  const next = env.run(request); reply(env.current, 0); await next;
  assert.equal(env.procs.length, 2); await env.run.stop();
});
test('input validation, pre-abort and missing sandbox never spawn', async () => {
  assert.throws(() => createVoiceSession({ ...config, sandboxHost: undefined }), /os-sandbox-required/);
  const env = setup();
  for (const bad of [{ ...request, text: 'x'.repeat(241) }, { ...request, profile: 'lilith' }, { ...request, path: 'file' }])
    await assert.rejects(env.run(bad), /invalid-request/);
  await assert.rejects(env.run(request, { signal: AbortSignal.abort() }), /cancelled/);
  assert.equal(env.procs.length, 0);
});
test('abort waits for actual close, forbids overlap, never returns late audio', async () => {
  let killed;
  const env = setup({ killProcess: proc => { killed = proc; } });
  const abort = new AbortController(); const pending = env.run(request, { signal: abort.signal });
  const rejected = assert.rejects(pending, /cancelled/);
  abort.abort(); assert.equal(killed, env.current);
  await assert.rejects(env.run(request), /busy/);
  reply(env.current, 0);
  let stopped = false; const stop = env.run.stop().then(() => { stopped = true; });
  await tick(); assert.equal(stopped, false);
  env.current.emit('close', 1); await rejected; await stop;
});
test('idle expiry and timeout close only the owned worker', async () => {
  const idle = setup({ idleMs: 15 });
  const task = idle.run(request); reply(idle.current, 0); await task;
  await new Promise(resolve => setTimeout(resolve, 35)); assert.equal(idle.kills, 1);
  const timeout = setup({ timeoutMs: 15 });
  await assert.rejects(timeout.run(request), /timeout/); assert.equal(timeout.kills, 1);
});
test('old process and eight-request ceiling force a clean model reload', async () => {
  let clock = 0; const env = setup({ now: () => clock });
  const task = env.run(request); reply(env.current, 0); await task;
  clock = 180_000;
  const next = env.run(request); await tick(); reply(env.current, 0); await next;
  assert.equal(env.procs.length, 2);
  for (let i = 1; i < 8; i++) { const job = env.run(request); reply(env.current, i); await job; }
  assert.equal(env.kills, 2);
});
test('unsolicited, stale and malformed responses fail closed', async () => {
  for (const variant of ['stale', 'voice', 'audio', 'flood', 'log', 'double', 'eof']) {
    const env = setup(); const pending = env.run(request);
    const rejected = assert.rejects(pending, /invalid-response|output-limit|log-limit|response-framing|synthesis-failed/);
    if (variant === 'stale') reply(env.current, 2);
    if (variant === 'voice') reply(env.current, 0, { profile: 'lilith' });
    if (variant === 'audio') reply(env.current, 0, { audio: 'a' });
    if (variant === 'flood') env.current.stdout.write(Buffer.alloc(1_800_001));
    if (variant === 'log') env.current.stderr.write('x'.repeat(8193));
    if (variant === 'double') env.current.stdout.write('{}\n{}\n');
    if (variant === 'eof') env.current.emit('close', 0);
    await rejected;
  }
  const env = setup(); const task = env.run(request); reply(env.current, 0); await task;
  reply(env.current, 0); assert.equal(env.kills, 1);
});
test('stop during retiring process prevents a queued restart', async () => {
  let clock = 0; const env = setup({ now: () => clock, killProcess: () => {} });
  const first = env.run(request); reply(env.current, 0); await first;
  clock = 180_000;
  const task = env.run(request); const rejected = assert.rejects(task, /cancelled/);
  const stop = env.run.stop(); env.current.emit('close', 0);
  await rejected; await stop; assert.equal(env.procs.length, 1);
});
