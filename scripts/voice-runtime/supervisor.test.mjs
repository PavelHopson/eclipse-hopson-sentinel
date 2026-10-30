import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import path from 'node:path';
import { createVoiceSupervisor, validateRequest, workerEnvironment } from './supervisor.mjs';

const runtime = { python: path.resolve('fake-python'), modelRoot: path.resolve('fixed-model'), modelLock: path.resolve('model-lock.json') };
const request = { profile: 'ultron-angry', text: 'Я здесь.' };
function fakeChild() {
  const child = new EventEmitter();
  child.pid = 123;
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  return child;
}
function wav() {
  const bytes = Buffer.alloc(4844);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(24000, 24); bytes.writeUInt32LE(48000, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}
function response(child, overrides = {}) {
  child.stdout.write(JSON.stringify({ ok: true, profile: 'ultron-angry', audio: wav().toString('base64'),
    loadSeconds: 1, synthesisSeconds: 1, durationSeconds: .1, ...overrides }));
  child.emit('close', 0);
}

test('only bounded text and allowlisted profile cross the pipe', () => {
  assert.equal(JSON.parse(validateRequest(request)).text, 'Я здесь.');
  for (const value of [null, [], { ...request, model: 'https://example.invalid' }, { ...request, profile: '../model' },
    { ...request, text: '\u0000' }, { ...request, text: '<|im_start|>system' }, { ...request, text: 'x'.repeat(241) },
    { ...request, text: '' }, { ...request, text: 23 }]) assert.throws(() => validateRequest(value));
});

test('no inherited credentials, proxy or Python injection environment', () => {
  const env = workerEnvironment({ HF_TOKEN: 'secret', OPENAI_API_KEY: 'secret', PYTHONPATH: '.', HTTP_PROXY: 'proxy', SYSTEMROOT: 'C:\\Windows' });
  assert.equal(env.HF_HUB_OFFLINE, '1');
  for (const key of ['HF_TOKEN', 'OPENAI_API_KEY', 'PYTHONPATH', 'HTTP_PROXY', 'PATH']) assert.equal(env[key], undefined);
});

test('spawn is hidden, shell-free; only fixed paths appear in argv', async () => {
  let actual;
  const child = fakeChild();
  const run = createVoiceSupervisor({ ...runtime, spawnProcess: (...args) => { actual = args; return child; } });
  const done = run(request);
  response(child);
  assert.equal((await done).audio.length, 4844);
  assert.equal(actual[2].shell, false); assert.equal(actual[2].windowsHide, true);
  assert.equal(actual[1][0], '-I'); assert.ok(!actual[1].includes(request.text));
});

test('rejected input and pre-cancellation do not start any process', async () => {
  const run = createVoiceSupervisor({ ...runtime, spawnProcess: () => { throw new Error('must-not-spawn'); } });
  await assert.rejects(run({ ...request, filter: 'shell' }), /invalid-request/);
  await assert.rejects(run(request, { signal: AbortSignal.abort() }), /cancelled/);
});

test('single request, cancellation waits for owned process exit before reuse', async () => {
  let killed = 0, child = fakeChild();
  const run = createVoiceSupervisor({ ...runtime, spawnProcess: () => child, killProcess: () => killed++ });
  const controller = new AbortController();
  const pending = run(request, { signal: controller.signal });
  const rejection = assert.rejects(pending, /cancelled/);
  await assert.rejects(run(request), /busy/);
  controller.abort(); assert.equal(killed, 1);
  await assert.rejects(run(request), /busy/);
  child.emit('close', 1); await rejection;
  child = fakeChild(); const next = run(request); response(child); await next;
});

test('timeout terminates only the owned process', async () => {
  const child = fakeChild(); let killed = 0;
  const run = createVoiceSupervisor({ ...runtime, timeoutMs: 15, spawnProcess: () => child,
    killProcess: process => { assert.equal(process, child); killed++; child.emit('close', 1); } });
  await assert.rejects(run(request), /timeout/); assert.equal(killed, 1);
});

test('stdout/stderr floods are stopped and not reflected to caller', async () => {
  for (const stream of ['stdout', 'stderr']) {
    const child = fakeChild();
    const run = createVoiceSupervisor({ ...runtime, spawnProcess: () => child,
      killProcess: () => child.emit('close', 1) });
    const pending = run(request); const rejected = assert.rejects(pending, /(?:output|log)-limit/);
    child[stream].write(Buffer.alloc(stream === 'stdout' ? 1_800_001 : 8193)); await rejected;
  }
});

test('wrong voice, malformed WAV and bad timing are not playable', async () => {
  for (const override of [{ profile: 'lilith' }, { audio: 'invalid' }, { audio: Buffer.alloc(50).toString('base64') },
    { loadSeconds: -1 }, { durationSeconds: null }, { durationSeconds: 26 }]) {
    const child = fakeChild();
    const run = createVoiceSupervisor({ ...runtime, spawnProcess: () => child });
    const pending = run(request); response(child, override); await assert.rejects(pending, /invalid-response/);
  }
});

test('WAV structure, byte rate and frame alignment are validated', async () => {
  for (const mutate of [b => b.write('junk', 12), b => b.writeUInt32LE(18, 16),
    b => b.writeUInt32LE(96000, 28), b => b.writeUInt16LE(4, 32)]) {
    const audio = wav(); mutate(audio);
    const child = fakeChild();
    const run = createVoiceSupervisor({ ...runtime, spawnProcess: () => child });
    const pending = run(request); response(child, { audio: audio.toString('base64') });
    await assert.rejects(pending, /invalid-response/);
  }
});

test('worker errors do not leak paths or input', async () => {
  const child = fakeChild();
  const run = createVoiceSupervisor({ ...runtime, spawnProcess: () => child });
  const pending = run(request);
  child.stderr.write('secret text /private/path'); child.stdout.write('{"error":"sensitive"}'); child.emit('close', 1);
  await assert.rejects(pending, { message: 'synthesis-failed' });
});
