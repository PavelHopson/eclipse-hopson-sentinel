import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { canonicalWav, createFastUltronTts, safeEnvironment } from './piper-runtime.mjs';

test('canonicalWav accepts bounded PCM and writes a strict 22050 Hz header', () => {
  const pcm = Buffer.alloc(22050, 1);
  const wav = canonicalWav(pcm);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 22050);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), pcm.length);
  assert.throws(() => canonicalWav(Buffer.alloc(101)), /piper-invalid-audio/);
});

test('Piper child environment strips credentials, network and Python overrides', () => {
  const env = safeEnvironment({ SYSTEMROOT: 'C:\\Windows', TEMP: 'E:\\temp', PATH: 'bad',
    HTTPS_PROXY: 'http://proxy', HF_TOKEN: 'secret', PYTHONPATH: 'bad' });
  assert.deepEqual(env, { SYSTEMROOT: 'C:\\Windows', TEMP: 'E:\\temp' });
});

function fakeChild(onEnd) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
  child.killed = false;
  child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('close', 1)); return true; };
  child.stdin.end = () => queueMicrotask(() => onEnd(child));
  return child;
}

test('fast runtime accepts only fixed verified paths and produces bounded MP3', async () => {
  const calls = [];
  const spawnProcess = (executable, args, options) => {
    calls.push({ executable, args, options });
    const isPiper = executable.endsWith('piper.exe');
    return fakeChild((child) => {
      child.stdout.emit('data', isPiper ? Buffer.alloc(22050, 2) : Buffer.concat([Buffer.from('ID3'), Buffer.alloc(600)]));
      child.emit('close', 0);
    });
  };
  const runtime = createFastUltronTts({
    runtimeRoot: 'E:\\runtime', ffmpeg: 'E:\\runtime\\ffmpeg.exe', sandboxHost: 'E:\\runtime\\sandbox.exe', spawnProcess,
    verifyPaths: async () => ({ executable: 'E:\\runtime\\piper.exe', model: 'E:\\runtime\\model.onnx',
      config: 'E:\\runtime\\model.onnx.json', dataRoot: 'E:\\runtime\\espeak-ng-data' }),
  });
  const result = await runtime.synthesize('Альтрон готов.');
  assert.equal(result.ok, true);
  assert.equal(result.engine, 'ultron-angry');
  assert.ok(result.audio.byteLength > 512);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.shell, false);
  assert.ok(calls[0].args.includes('--output_raw'));
  assert.equal(calls[1].executable, 'E:\\runtime\\sandbox.exe');
  await runtime.stop();
});
