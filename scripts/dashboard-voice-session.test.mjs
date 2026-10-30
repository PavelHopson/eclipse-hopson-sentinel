import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const { UltronLiveVoiceManager, buildCaptureEnvironment } = require('../dashboard/electron/ultron-live-voice.cjs');
const voiceSource = await readFile(new URL('../dashboard/src/lib/voiceModel.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(voiceSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { sendVoiceMessage } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

function captureFixture(terminateProcessTree) {
  const events = [], spawns = [];
  const child = new EventEmitter();
  child.pid = 1234; child.killed = false;
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('close', null)); return true; };
  const manager = new UltronLiveVoiceManager({ runtimeRoot: 'E:\\runtime',
    sendEvent: (channel, data) => events.push({ channel, data }), fileExists: () => true,
    spawnProcess: (...args) => { spawns.push(args); return child; }, terminateProcessTree,
  });
  const feed = text => child.stdout.write(Buffer.from(text));
  return { manager, child, events, spawns, feed };
}

test('capture readiness follows native marker, not a successful spawn or elapsed 1.8s', async () => {
  const { manager, events, feed, spawns } = captureFixture();
  try {
    manager.start();
    assert.equal(manager.state, 'starting');
    assert.equal(manager.ready, false);
    assert.equal(events.some(e => e.data.state === 'listening'), false);
    assert.deepEqual(spawns[0][1].slice(6, 8), ['--step', '0']);
    assert.equal(spawns[0][2].windowsHide, true);
    assert.equal(spawns[0][2].shell, false);
    feed('[Start speaking]\n');
    assert.equal(manager.state, 'listening');
  } finally { manager.stop(); await manager.whenStopped; }
});

test('one-shot accepts one complete VAD phrase and waits for process cleanup', async () => {
  let release;
  const { manager, child, feed, events } = captureFixture(() => new Promise(resolve => { release = resolve; }));
  const result = manager.listenOnce();
  feed('[Start speaking]\n### Transcription 1 START\nПривет, Альтрон!\n');
  let finished = false; result.then(() => { finished = true; });
  await Promise.resolve(); assert.equal(finished, false);
  feed('### Transcription 1 END\n');
  assert.equal(manager.stopping, true);
  assert.equal(manager.start().error.code, 'VOICE_STOPPING');
  await Promise.resolve(); assert.equal(finished, false);
  release();
  child.emit('close', 0);
  assert.deepEqual(await result, { ok: true, text: 'Привет, Альтрон!', confidence: null, engine: 'whisper.cpp' });
  assert.equal(manager.stopping, false);
  assert.equal(events.length, 0, 'one-shot must not enable live UI');
});

test('cancel resolves one-shot once and ignores late transcripts', async () => {
  const { manager, feed } = captureFixture();
  const result = manager.listenOnce();
  feed('[Start speaking]\n'); manager.stop();
  feed('### Transcription 2 START\nПоздняя фраза\n### Transcription 2 END\n');
  assert.equal((await result).error.code, 'VOICE_CANCELLED');
  assert.equal(manager.isActive(), false);
});

test('one-shot ignores punctuation and music artifacts, preserving the next complete phrase', async () => {
  const { manager, feed } = captureFixture();
  const result = manager.listenOnce();
  feed('[Start speaking]\n');
  for (const [id, noise] of ['♪♪', '...', '—', '🎵', '<|nospeech|>'].entries()) {
    feed(`### Transcription ${id} START\n${noise}\n### Transcription ${id} END\n`);
    assert.equal(manager.stopping, false);
    assert.equal(manager.isActive(), true);
  }
  feed('### Transcription 9 START\nАльтрон, два плюс два.\n### Transcription 9 END\n');
  assert.equal((await result).text, 'Альтрон, два плюс два.');
  assert.equal(manager.isActive(), false);
});

test('short genuine answers are not rejected by non-speech filtering', async () => {
  const { manager, events, feed } = captureFixture();
  try {
    manager.start(); feed('[Start speaking]\n');
    feed('### Transcription 1 START\nДа.\n### Transcription 1 END\n');
    feed('### Transcription 2 START\n4\n### Transcription 2 END\n');
    assert.deepEqual(events.filter(e => e.channel.endsWith('live-transcript')).map(e => e.data.text), ['Да.', '4']);
  } finally { manager.stop(); await manager.whenStopped; }
});

test('unexpected native exit is an error, never false ready or an automatic restart', async () => {
  const { manager, child, spawns } = captureFixture();
  const result = manager.listenOnce();
  child.emit('close', 2);
  assert.equal((await result).ok, false);
  assert.equal(spawns.length, 1);
});

test('microphone startup timeout fails closed and settles one-shot', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { manager } = captureFixture();
  const result = manager.listenOnce();
  context.mock.timers.tick(20_001);
  assert.equal((await result).ok, false);
  assert.equal(manager.isActive(), false);
});

test('resume before native readiness cannot advertise a listening microphone', async () => {
  const { manager, feed } = captureFixture();
  try {
    manager.start(); manager.pause();
    assert.equal(manager.resume().state, 'starting');
    assert.equal(manager.ready, false);
    feed('[Start speaking]\n');
    assert.equal(manager.state, 'listening');
  } finally { manager.stop(); await manager.whenStopped; }
});

test('failed termination retains ownership even after killed=true and permits only explicit stop retry', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let attempts = 0;
  const { manager, child, spawns } = captureFixture(() => { attempts++; child.killed = true; return false; });
  manager.start(); manager.stop(); manager.stop();
  assert.equal(attempts, 1, 'concurrent Stop clicks must not launch more terminators');
  context.mock.timers.tick(3001);
  assert.equal(await manager.whenStopped, false);
  assert.equal(manager.process, child);
  assert.equal(manager.stopping, true);
  assert.equal(manager.start().error.code, 'VOICE_STOPPING');
  assert.equal((await manager.listenOnce()).error.code, 'VOICE_BUSY');
  assert.equal(manager.resume().state, 'stopping');
  manager.stop();
  assert.equal(attempts, 2);
  child.emit('close', 0);
  assert.equal(await manager.whenStopped, true);
  assert.equal(manager.isActive(), false);
  assert.equal(manager.stopping, false);
  assert.equal(spawns.length, 1);
});

test('a delayed native exit releases a failed-stop lock without an automatic restart', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { manager, child, spawns } = captureFixture(() => Promise.reject(new Error('denied')));
  manager.start(); manager.stop();
  context.mock.timers.tick(3001); await manager.whenStopped;
  child.emit('close', 0);
  assert.equal(manager.state, 'idle');
  assert.equal(manager.stopping, false);
  assert.equal(spawns.length, 1);
});

test('nine natural turns do not trip the noise breaker; rapid bursts still do', async () => {
  const { manager, events } = captureFixture();
  let now = 100_000;
  manager.now = () => now;
  manager.start(); manager.ignoreUntil = 0;
  for (let turn = 0; turn < 9; turn++) {
    manager.commitTranscript(`Вопрос номер ${turn}`);
    now += 4000;
  }
  assert.equal(events.filter(e => e.channel.endsWith('live-transcript')).length, 9);
  assert.equal(manager.stopping, false);
  manager.stop(); await manager.whenStopped;
});

test('capture environment preserves Windows basics but excludes provider secrets and injection variables', () => {
  assert.deepEqual(buildCaptureEnvironment({ Path: 'windows-path', SystemRoot: 'windows', TEMP: 'E:\\temp',
    OPENAI_API_KEY: 'synthetic-marker', NODE_OPTIONS: '--require bad', HTTP_PROXY: 'remote', SDL_AUDIODRIVER: 'bad' }),
  { Path: 'windows-path', SystemRoot: 'windows', TEMP: 'E:\\temp', SDL_AUDIODRIVER: 'directsound' });
});

function streamResponse(text) {
  const bytes = Buffer.from(text);
  return new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } }));
}

test('voice protocol is local, non-thinking, bounded and survives split UTF-8 and final line without newline', async context => {
  let body, target;
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    target = url; body = JSON.parse(options.body);
    return streamResponse('{"message":{"content":"Привет!"},"done":false}\n{"done":true}');
  });
  let answer = '';
  await sendVoiceMessage([{ role: 'user', content: 'Привет' }], 'Альтрон', chunk => { answer += chunk; }, new AbortController().signal);
  assert.equal(answer, 'Привет!');
  assert.equal(target, 'http://127.0.0.1:11434/api/chat');
  assert.equal(body.think, false); assert.equal(body.model, 'qwen3:8b');
  assert.equal(body.options.num_ctx, 2048); assert.equal(body.keep_alive, '5m');
  assert.equal('tools' in body, false);
});

test('no first answer in 30 seconds aborts model request with recoverable error', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  context.mock.method(globalThis, 'fetch', async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const pending = sendVoiceMessage([], '', () => {}, new AbortController().signal);
  const rejection = assert.rejects(pending, /отвечает слишком долго/);
  context.mock.timers.tick(30_001);
  await rejection;
});

test('explicit stop aborts model fetch, without reporting a timeout', async context => {
  const cancellation = new AbortController();
  context.mock.method(globalThis, 'fetch', async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const pending = sendVoiceMessage([], '', () => {}, cancellation.signal);
  cancellation.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('malformed stream, abrupt EOF and callback failures are not swallowed', async context => {
  for (const response of ['invalid\n', '{"message":{"content":"Часть"}}\n']) {
    const mock = context.mock.method(globalThis, 'fetch', async () => streamResponse(response));
    await assert.rejects(sendVoiceMessage([], '', () => {}, new AbortController().signal)); mock.mock.restore();
  }
  context.mock.method(globalThis, 'fetch', async () => streamResponse('{"message":{"content":"Ответ"},"done":true}\n'));
  await assert.rejects(sendVoiceMessage([], '', () => { throw new Error('consumer-error'); }, new AbortController().signal), /consumer-error/);
});
