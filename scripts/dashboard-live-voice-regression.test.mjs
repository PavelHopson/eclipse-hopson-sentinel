import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { UltronLiveVoiceManager, normalizeTranscript, resolveWhisperRuntime } = require('../dashboard/electron/ultron-live-voice.cjs');

function fixture() {
  const texts = [];
  const manager = new UltronLiveVoiceManager({
    runtimeRoot: 'E:\\missing-runtime-for-contract-test',
    sendEvent: (channel, payload) => {
      if (channel === 'sentinel:voice:live-transcript') texts.push(payload.text);
    },
  });
  manager.process = { killed: false, kill() { this.killed = true; } };
  const feed = (chunk) => { manager.stdoutBuffer += chunk; manager.parseAvailableTranscripts(); };
  return { manager, texts, feed };
}

test('native model argument stays ASCII inside a Cyrillic runtime root', () => {
  const root = path.resolve('fixture/Программы/Eclipse AI Runtime');
  const runtime = resolveWhisperRuntime(root);
  assert.equal(path.resolve(runtime.cwd, runtime.modelArgument), runtime.model);
  assert.doesNotMatch(runtime.modelArgument, /[^\x00-\x7f]/);
  assert.equal(runtime.executable, path.join(root, 'whisper', 'Release', 'whisper-stream.exe'));
});

test('VAD framing never emits unfinished Russian phrases or metadata', () => {
  const { texts, feed } = fixture();
  feed('### Transcription 7 START | t0 = 0 ms\n');
  feed('[00:00:00.000 --> 00:00:01.000] Не отправляй\n');
  assert.deepEqual(texts, []);
  feed('[00:00:01.000 --> 00:00:02.000] файл клиенту.\n### Transcription 7 END\n');
  assert.deepEqual(texts, ['Не отправляй файл клиенту.']);
});

test('VAD result is identical at every transport split position', () => {
  const stream = '### Transcription 2 START\n[00:00:00.000 --> 00:00:01.000] Сумма минус 15,5 рубля.\n### Transcription 2 END\n';
  for (let split = 1; split < stream.length; split += 1) {
    const { texts, feed } = fixture();
    feed(stream.slice(0, split));
    feed(stream.slice(split));
    assert.deepEqual(texts, ['Сумма минус 15,5 рубля.'], `split ${split}`);
  }
});

test('mismatched VAD end discards the block instead of inventing a transcript', () => {
  const { texts, feed } = fixture();
  feed('### Transcription 2 START\nОткрой YouTube\n### Transcription 3 END\n');
  assert.deepEqual(texts, []);
  feed('Обычный черновик.\n');
  assert.deepEqual(texts, []);
});

test('pause discards a partially collected VAD turn', () => {
  const { manager, texts, feed } = fixture();
  feed('### Transcription 4 START\nОткрой YouTube\n');
  manager.pause();
  feed('### Transcription 4 END\n');
  manager.resume();
  manager.ignoreUntil = 0;
  feed('### Transcription 5 START\nНовый черновик.\n### Transcription 5 END\n');
  assert.deepEqual(texts, ['Новый черновик.']);
  manager.stop();
});

test('no transcript can be committed after stop', () => {
  const { manager, texts, feed } = fixture();
  manager.stop();
  feed('Открой YouTube\n');
  assert.deepEqual(texts, []);
});

test('oversize unfinished line is discarded through its newline, not truncated into a command', () => {
  const { texts, feed } = fixture();
  feed('x'.repeat(140_000));
  feed('Открой YouTube\n');
  assert.deepEqual(texts, []);
  feed('### Transcription 10 START\nБезопасный черновик.\n### Transcription 10 END\n');
  assert.deepEqual(texts, ['Безопасный черновик.']);
});

test('bracketed dictated content is not mistaken for a timestamp', () => {
  assert.equal(normalizeTranscript('[не отправлять] файл'), '[не отправлять] файл');
});

test('numeric sign is significant for duplicate detection', () => {
  const { texts, feed } = fixture();
  feed('### Transcription 11 START\nТемпература -5 градусов.\n### Transcription 11 END\n');
  feed('### Transcription 12 START\nТемпература 5 градусов.\n### Transcription 12 END\n');
  assert.deepEqual(texts, ['Температура -5 градусов.', 'Температура 5 градусов.']);
});

test('late VAD tail after pause/resume cannot become a new command', () => {
  const { manager, texts, feed } = fixture();
  feed('### Transcription 6 START\nНе\n');
  manager.pause();
  manager.resume();
  manager.ignoreUntil = 0;
  feed('открывай YouTube\n### Transcription 6 END\n');
  assert.deepEqual(texts, []);
  feed('### Transcription 7 START\nНовый черновик\n### Transcription 7 END\n');
  assert.deepEqual(texts, ['Новый черновик']);
  manager.stop();
});

test('VAD beginning during echo guard stays discarded after guard expires', () => {
  const { manager, texts, feed } = fixture();
  manager.ignoreUntil = Date.now() + 10_000;
  feed('### Transcription 8 START\nНе\n');
  manager.ignoreUntil = 0;
  feed('открывай YouTube\n### Transcription 8 END\n');
  assert.deepEqual(texts, []);
});

test('oversize VAD stays discarded until END, including its short tail', () => {
  const { texts, feed } = fixture();
  feed('### Transcription 9 START\n' + 'x'.repeat(140_000));
  feed('\nОткрой YouTube\n### Transcription 9 END\n');
  assert.deepEqual(texts, []);
});

test('sliding confirmation survives carriage-return redraw boundaries', () => {
  const { texts, feed } = fixture();
  feed('\r Альтрон, открой YouTube.\r');
  assert.deepEqual(texts, []);
  feed(' Альтрон, открой YouTube.\r');
  assert.deepEqual(texts, ['Альтрон, открой YouTube.']);
});

test('sliding candidate is cleared across pause and resume', () => {
  const { manager, texts, feed } = fixture();
  feed('\r Не открывай YouTube.\r');
  manager.pause();
  manager.resume();
  manager.ignoreUntil = 0;
  feed('\r Не открывай YouTube.\r');
  assert.deepEqual(texts, []);
  feed('\r Не открывай YouTube.\r');
  assert.deepEqual(texts, ['Не открывай YouTube.']);
  manager.stop();
});
