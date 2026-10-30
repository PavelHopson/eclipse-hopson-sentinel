import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdtemp, open, readFile, realpath, rmdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { evaluateDictation } from './voice-dictation-eval.mjs';

const require = createRequire(import.meta.url);
const { removeEphemeralTtsFile } = require('../dashboard/electron/tts-wav-transport.cjs');
const corpus = JSON.parse(await readFile(new URL('./fixtures/ru-dictation-v1.json', import.meta.url), 'utf8')).cases;
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_AUDIO_MS = 30_000;
const hash = (data) => createHash('sha256').update(data).digest('hex');
const fail = (code) => { throw new Error(code); };

/** A CLI-selected local file, not a remote URL, device path, ADS or traversal. */
export function localPath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\x00-\x1f\x7f]/.test(value)
      || /^[\\/]{2}/.test(value) || /:\/\//.test(value) || value.split(/[\\/]/).includes('..')
      || value.replace(/^[a-z]:/i, '').includes(':')) fail('LOCAL_PATH_REQUIRED');
  return path.resolve(value);
}

/** Strict CLI grammar: --check never executes a model; --run needs explicit consent. */
export function parseRecordingOptions(args) {
  if (!args.length) return { mode: 'dry-run' };
  const checking = args.length === 5 && args[0] === '--check';
  const running = args.length === 8 && args[0] === '--run'
    && args[5] === '--runtime-root' && args[7] === '--allow-local-transcription';
  if ((!checking && !running) || args[1] !== '--case' || args[3] !== '--input') fail('INVALID_ARGUMENTS');
  if (!corpus.some(({ id }) => id === args[2])) fail('UNKNOWN_CASE');
  return { mode: checking ? 'check' : 'run', caseId: args[2], input: localPath(args[4]),
    ...(running ? { runtimeRoot: localPath(args[6]) } : {}) };
}

async function assertPlainFile(filename) {
  const absolute = localPath(filename);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  const parts = absolute.slice(parsed.root.length).split(path.sep);
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || (index < parts.length - 1 && !stat.isDirectory())) fail('LINK_NOT_ALLOWED');
    if (index === parts.length - 1 && !stat.isFile()) fail('REGULAR_FILE_REQUIRED');
  }
  const resolved = localPath(await realpath(absolute));
  const same = process.platform === 'win32' ? resolved.toLowerCase() === absolute.toLowerCase() : resolved === absolute;
  if (!same) fail('LINK_NOT_ALLOWED');
  return lstat(absolute);
}

/** Parse bounded PCM only; strip all metadata before handing bytes to native STT. */
export function canonicalRecording(wav) {
  if (!Buffer.isBuffer(wav) || wav.length < 44 || wav.length > MAX_FILE_BYTES
      || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE'
      || wav.readUInt32LE(4) + 8 !== wav.length) fail('INVALID_WAV');
  let format = null, pcm = null, chunks = 0;
  for (let offset = 12; offset < wav.length;) {
    if (++chunks > 32 || offset + 8 > wav.length) fail('INVALID_WAV');
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4), end = offset + 8 + size;
    if (end + (size % 2) > wav.length) fail('INVALID_WAV');
    const chunk = wav.subarray(offset + 8, end);
    if (id === 'fmt ') {
      if (format || (size !== 16 && size !== 18)) fail('INVALID_WAV');
      if (chunk.readUInt16LE(0) !== 1 || chunk.readUInt16LE(2) !== 1
          || chunk.readUInt32LE(4) !== 16000 || chunk.readUInt32LE(8) !== 32000
          || chunk.readUInt16LE(12) !== 2 || chunk.readUInt16LE(14) !== 16
          || (size === 18 && chunk.readUInt16LE(16) !== 0)) fail('PCM16_MONO_16K_REQUIRED');
      format = chunk;
    } else if (id === 'data') {
      if (pcm !== null) fail('INVALID_WAV');
      pcm = chunk;
    }
    offset = end + (size % 2);
  }
  if (!format || pcm === null || pcm.length % 2 !== 0) fail('INVALID_WAV');
  const durationMs = pcm.length / 32;
  if (durationMs < 250 || durationMs > MAX_AUDIO_MS) fail('AUDIO_DURATION_LIMIT');
  const canonical = Buffer.alloc(44 + pcm.length);
  canonical.write('RIFF'); canonical.writeUInt32LE(canonical.length - 8, 4); canonical.write('WAVEfmt ', 8);
  canonical.writeUInt32LE(16, 16); format.copy(canonical, 20, 0, 16);
  canonical.write('data', 36); canonical.writeUInt32LE(pcm.length, 40); pcm.copy(canonical, 44);
  return { canonical, evidence: { sourceSha256: hash(wav), canonicalSha256: hash(canonical),
    bytes: wav.length, durationMs, sampleRate: 16000, channels: 1, bitsPerSample: 16 } };
}

async function readRecording(filename) {
  const before = await assertPlainFile(filename);
  if (before.size > MAX_FILE_BYTES) fail('AUDIO_SIZE_LIMIT');
  const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.size > MAX_FILE_BYTES) fail('SOURCE_CHANGED');
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const after = await handle.stat();
    if (length > MAX_FILE_BYTES || length !== stat.size || stat.size !== after.size || stat.mtimeMs !== after.mtimeMs) fail('SOURCE_CHANGED');
    return canonicalRecording(buffer.subarray(0, length));
  } finally { await handle.close(); }
}

/** Reproducibility evidence only: hashes do not certify native binaries or their DLLs. */
async function fingerprintRuntimeFile(filename, maxBytes, signal) {
  const before = await assertPlainFile(filename);
  if (before.size <= 0 || before.size > maxBytes) fail('RUNTIME_SIZE_LIMIT');
  const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino
        || stat.size !== before.size || stat.mtimeMs !== before.mtimeMs) fail('RUNTIME_CHANGED');
    const digest = createHash('sha256'), buffer = Buffer.alloc(1024 * 1024);
    let length = 0;
    while (true) {
      if (signal?.aborted) fail('CANCELLED');
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, maxBytes - length + 1), null);
      if (!bytesRead) break;
      length += bytesRead;
      if (length > maxBytes) fail('RUNTIME_SIZE_LIMIT');
      digest.update(buffer.subarray(0, bytesRead));
    }
    const after = await handle.stat();
    if (length !== stat.size || stat.size !== after.size || stat.mtimeMs !== after.mtimeMs
        || stat.ctimeMs !== after.ctimeMs) fail('RUNTIME_CHANGED');
    return { file: path.basename(filename), sha256: digest.digest('hex'), bytes: length };
  } finally { await handle.close(); }
}

function runWhisper(executable, args, options) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, options, (error, stdout) => {
      if (error) reject(new Error(options.signal?.aborted ? 'CANCELLED' : 'LOCAL_TRANSCRIPTION_FAILED'));
      else resolve(stdout);
    });
  });
}

/** Trusted engineering CLI, not exposed to agents. Dependency seam is test-only. */
export async function evaluateRecording(options, { transcribe = runWhisper, signal } = {}) {
  if (!['check', 'run'].includes(options.mode) || !corpus.some(({ id }) => id === options.caseId)) fail('INVALID_ARGUMENTS');
  const input = localPath(options.input);
  if (signal?.aborted) fail('CANCELLED');
  const recording = await readRecording(input);
  if (options.mode === 'check') return { status: 'audio-validated', caseId: options.caseId,
    microphone: false, cloud: false, modelExecuted: false, evidence: recording.evidence };
  const runtime = localPath(options.runtimeRoot);
  const cwd = path.join(runtime, 'whisper', 'Release');
  const executable = path.join(cwd, 'whisper-cli.exe');
  const model = path.join(runtime, 'models', 'whisper', 'ggml-large-v3-turbo-q5_0.bin');
  const runtimeEvidence = {
    executable: await fingerprintRuntimeFile(executable, 64 * 1024 * 1024, signal),
    model: await fingerprintRuntimeFile(model, 1024 * 1024 * 1024, signal),
    language: 'ru', mode: 'local-file', nativeRuntimeAudited: false,
  };
  if (signal?.aborted) fail('CANCELLED');
  const directory = await mkdtemp(path.join(ROOT, '.voice-recording-'));
  const audio = path.join(directory, 'sample.wav');
  let report;
  try {
    const handle = await open(audio, 'wx', 0o600);
    try { await handle.writeFile(recording.canonical); } finally { await handle.close(); }
    if (signal?.aborted) fail('CANCELLED');
    const started = performance.now();
    const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'LOCALAPPDATA', 'APPDATA']
      .filter((name) => process.env[name]).map((name) => [name, process.env[name]]));
    const text = await transcribe(executable, ['-m', path.relative(cwd, model), '-f', audio, '-l', 'ru', '-nt', '-np', '-nf'],
      { cwd, env, signal, encoding: 'utf8', windowsHide: true, shell: false, timeout: 60_000, maxBuffer: 64 * 1024 });
    if (signal?.aborted) fail('CANCELLED');
    if (typeof text !== 'string' || text.trim().length > 1000) fail('INVALID_TRANSCRIPT');
    report = evaluateDictation({ schemaVersion: 'eclipse.ru-dictation-results.v1', provider: 'whisper-local', source: 'recorded',
      results: [{ id: options.caseId, status: 'ok', text: text.trim(), latencyMs: Math.round(performance.now() - started), costUsd: null }] });
  } finally {
    if (path.dirname(audio) !== directory) fail('CLEANUP_SCOPE');
    const removed = await removeEphemeralTtsFile(audio);
    let empty = false;
    try { await rmdir(directory); empty = true; } catch { /* fail closed below; never remove an unexpected file */ }
    if (!removed || !empty) fail('CLEANUP_INCOMPLETE');
  }
  return { ...report, recording: { inputKind: 'operator-supplied-audio', humanProvenanceVerified: false,
    microphone: false, cloud: false, originalModified: false, temporaryAudioRetained: false,
    evidence: recording.evidence, runtime: runtimeEvidence } };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const abort = new AbortController();
  process.once('SIGINT', () => abort.abort());
  process.once('SIGTERM', () => abort.abort());
  try {
    const options = parseRecordingOptions(process.argv.slice(2));
    const result = options.mode === 'dry-run'
      ? { status: 'dry-run', microphone: false, cloud: false, modelExecuted: false,
        format: 'WAV PCM16, mono, 16000 Hz; 0.25–30 seconds',
        starterCases: corpus.filter(({ id }) => ['ru-01', 'ru-07', 'ru-14'].includes(id)).map(({ id, reference }) => ({ id, reference })) }
      : await evaluateRecording(options, { signal: abort.signal });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const safeCodes = new Set(['LOCAL_PATH_REQUIRED', 'INVALID_ARGUMENTS', 'UNKNOWN_CASE', 'LINK_NOT_ALLOWED', 'REGULAR_FILE_REQUIRED',
      'INVALID_WAV', 'PCM16_MONO_16K_REQUIRED', 'AUDIO_DURATION_LIMIT', 'AUDIO_SIZE_LIMIT', 'SOURCE_CHANGED',
      'RUNTIME_SIZE_LIMIT', 'RUNTIME_CHANGED',
      'CANCELLED', 'LOCAL_TRANSCRIPTION_FAILED', 'INVALID_TRANSCRIPT', 'CLEANUP_SCOPE', 'CLEANUP_INCOMPLETE']);
    process.stderr.write(`Проверка записи не завершена: ${safeCodes.has(error.message) ? error.message : 'RECORDING_CHECK_FAILED'}.\n`);
    process.exitCode = 1;
  }
}
