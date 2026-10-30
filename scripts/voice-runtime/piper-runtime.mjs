import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createUltronDsp } from './dsp.mjs';

const SAMPLE_RATE = 22050;
const MAX_PCM_BYTES = 1_200_000;
const PINNED = Object.freeze({
  executable: { relative: 'tts/piper/runtime/piper/piper.exe', bytes: 509952, sha256: '96f3da3811151580073e40bb4dd20eb0fb8115f5f5f76e2fb54282b3edfa5c1f' },
  model: { relative: 'tts/piper/voices/ru/ru_RU/denis/medium/ru_RU-denis-medium.onnx', bytes: 63201294, sha256: '15fab56e11a097858ee115545d0f697fc2a316c41a291a5362349fb870411b0a' },
  config: { relative: 'tts/piper/voices/ru/ru_RU/denis/medium/ru_RU-denis-medium.onnx.json', bytes: 4823, sha256: '831c860dac0b5073eaa81610a0a638ec23d90a6cf8e5f871b4485c2cec3767c8' },
});

function safeEnvironment(source = process.env) {
  return Object.fromEntries(['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']
    .flatMap((key) => source[key] ? [[key, source[key]]] : []));
}

function canonicalWav(pcm) {
  if (!Buffer.isBuffer(pcm) || pcm.length < SAMPLE_RATE / 5 || pcm.length > MAX_PCM_BYTES || pcm.length % 2) throw new Error('piper-invalid-audio');
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24); wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44);
  return wav;
}

async function verifiedPaths(runtimeRoot) {
  const root = path.resolve(runtimeRoot);
  const result = {};
  for (const [key, expected] of Object.entries(PINNED)) {
    const filename = path.join(root, ...expected.relative.split('/'));
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.size !== expected.bytes) throw new Error('piper-integrity');
    const digest = createHash('sha256').update(await readFile(filename)).digest('hex');
    if (digest !== expected.sha256) throw new Error('piper-integrity');
    result[key] = filename;
  }
  const dataRoot = path.join(root, 'tts', 'piper', 'runtime', 'piper', 'espeak-ng-data');
  const dataInfo = await lstat(dataRoot);
  if (!dataInfo.isDirectory() || dataInfo.isSymbolicLink()) throw new Error('piper-integrity');
  return { ...result, dataRoot };
}

function synthesizePcm(paths, text, { signal, spawnProcess, timeoutMs, onChild }) {
  return new Promise((resolve, reject) => {
    const cwd = path.dirname(paths.executable);
    const child = spawnProcess(paths.executable, [
      // This pinned Piper build is not Unicode-path safe. Keep every argument
      // relative to its trusted E-drive cwd; no renderer value reaches paths.
      '--model', path.relative(cwd, paths.model),
      '--config', path.relative(cwd, paths.config),
      '--espeak_data', path.relative(cwd, paths.dataRoot),
      '--output_raw', '--length_scale', '0.92', '--sentence_silence', '0.1', '--quiet',
    ], { cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: safeEnvironment() });
    onChild(child);
    let audio = Buffer.alloc(0), logs = 0, failure = '', settled = false;
    const fail = (reason) => { if (!failure) { failure = reason; child.kill(); } };
    const abort = () => fail('cancelled');
    const timer = setTimeout(() => fail('piper-timeout'), timeoutMs);
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      error ? reject(new Error(error)) : resolve(value);
    };
    child.once('error', () => finish('piper-unavailable'));
    child.stdin.on('error', () => fail('piper-input-failed'));
    child.stdout.on('data', (chunk) => {
      if (audio.length + chunk.length > MAX_PCM_BYTES) return fail('piper-output-limit');
      audio = Buffer.concat([audio, chunk]);
    });
    child.stderr.on('data', (chunk) => { logs += chunk.length; if (logs > 8192) fail('piper-log-limit'); });
    child.once('close', (code) => {
      onChild(null);
      if (failure) return finish(failure);
      if (code !== 0) return finish('piper-failed');
      try { finish(null, canonicalWav(audio)); } catch { finish('piper-invalid-audio'); }
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort(); else child.stdin.end(`${text}\n`, 'utf8');
  });
}

export function createFastUltronTts({ runtimeRoot, ffmpeg, sandboxHost, spawnProcess = spawn,
  verifyPaths = verifiedPaths, timeoutMs = 20_000 }) {
  if (typeof runtimeRoot !== 'string' || !path.isAbsolute(runtimeRoot) || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 1_000 || timeoutMs > 30_000) throw new Error('invalid-piper-runtime');
  const dsp = createUltronDsp({ ffmpeg, sandboxHost, spawnProcess });
  let pathsPromise = null, active = null, controller = null;
  return {
    async synthesize(text) {
      if (typeof text !== 'string' || !text.trim() || [...text].length > 240 || /\p{C}/u.test(text)
        || text.includes('<|') || text.includes('|>')) throw new Error('invalid-text');
      if (controller) throw new Error('busy');
      controller = new AbortController();
      const current = controller;
      const startedAt = performance.now();
      try {
        pathsPromise ??= verifyPaths(runtimeRoot).catch((error) => { pathsPromise = null; throw error; });
        const paths = await pathsPromise;
        const wav = await synthesizePcm(paths, text.trim(), {
          signal: current.signal, spawnProcess, timeoutMs, onChild: (child) => { active = child; },
        });
        const synthesisSeconds = (performance.now() - startedAt) / 1000;
        const audio = await dsp(wav, { signal: current.signal });
        return { ok: true, audio: new Uint8Array(audio), mimeType: 'audio/mpeg', engine: 'ultron-angry',
          durationSeconds: (wav.length - 44) / (SAMPLE_RATE * 2), synthesisSeconds, loadSeconds: 0 };
      } finally {
        active = null;
        if (controller === current) controller = null;
      }
    },
    async stop() { controller?.abort(); if (active && !active.killed) active.kill(); },
  };
}

export { PINNED, SAMPLE_RATE, canonicalWav, safeEnvironment, verifiedPaths };
