import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdtemp, readFile, rmdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateDictation } from './voice-dictation-eval.mjs';

const require = createRequire(import.meta.url);
const { readBoundedPcmWav, removeEphemeralTtsFile } = require('../dashboard/electron/tts-wav-transport.cjs');
const corpus = JSON.parse(await readFile(new URL('./fixtures/ru-dictation-v1.json', import.meta.url), 'utf8')).cases;
const samples = ['ru-01', 'ru-07', 'ru-14'].map((id) => corpus.find((sample) => sample.id === id));
const root = fileURLToPath(new URL('../', import.meta.url));
const safeEnv = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'LOCALAPPDATA', 'APPDATA']
  .filter((name) => process.env[name]).map((name) => [name, process.env[name]]));
const cancellation = new AbortController();
process.once('SIGINT', () => cancellation.abort());
process.once('SIGTERM', () => cancellation.abort());

function run(stage, executable, args, cwd, input = '') {
  return new Promise((resolve, reject) => {
    const child = execFile(executable, args, {
      cwd, env: safeEnv, windowsHide: true, shell: false, timeout: 60_000, maxBuffer: 64 * 1024, signal: cancellation.signal,
    }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout);
      const failure = new Error('LOCAL_PROCESS_FAILED_OR_TIMED_OUT');
      failure.diagnostic = { stage, exitCode: Number.isInteger(error.code) ? error.code : null,
        killed: Boolean(error.killed), aborted: cancellation.signal.aborted,
        reason: /failed to (?:open|load)|cannot open|no such file|could not open/i.test(stderr) ? 'runtime-file-unavailable'
          : /unrecognized option|unknown argument|invalid argument/i.test(stderr) ? 'unsupported-arguments' : 'process-failure' };
      reject(failure);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input, 'utf8');
  });
}

async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function main(args) {
  if (args.length === 0) {
    return { status: 'dry-run', sampleIds: samples.map(({ id }) => id), microphone: false, cloud: false,
      next: '--run --runtime-root <existing-local-runtime> --ffmpeg <existing-ffmpeg.exe>' };
  }
  if (args.length !== 5 || args[0] !== '--run' || args[1] !== '--runtime-root' || args[3] !== '--ffmpeg') throw new Error('INVALID_ARGUMENTS');
  if (process.platform !== 'win32' || !path.isAbsolute(args[2]) || !path.isAbsolute(args[4])) throw new Error('ABSOLUTE_WINDOWS_RUNTIME_REQUIRED');
  const runtime = path.resolve(args[2]), ffmpeg = path.resolve(args[4]);
  const piperCwd = path.join(runtime, 'tts', 'piper', 'runtime', 'piper');
  const piper = path.join(piperCwd, 'piper.exe');
  const piperModel = path.join('..', '..', 'voices', 'ru', 'ru_RU', 'denis', 'medium', 'ru_RU-denis-medium.onnx');
  const whisperCwd = path.join(runtime, 'whisper', 'Release');
  const whisper = path.join(whisperCwd, 'whisper-cli.exe');
  const whisperModel = path.join(runtime, 'models', 'whisper', 'ggml-large-v3-turbo-q5_0.bin');
  for (const file of [piper, path.resolve(piperCwd, piperModel), whisper, whisperModel, ffmpeg]) {
    // A WinGet shim may be a link. Only the explicit ffmpeg argument may use it.
    const stat = await lstat(file);
    if (!stat.isFile() && !(file === ffmpeg && stat.isSymbolicLink())) throw new Error('RUNTIME_FILE_REQUIRED');
  }
  const directory = await mkdtemp(path.join(root, '.voice-smoke-'));
  const files = [];
  const results = [];
  const audioEvidence = [];
  let cleanupSucceeded = true;
  let evidence;
  try {
    for (const sample of samples) {
      const source = path.join(directory, `${sample.id}-piper.wav`);
      const converted = path.join(directory, `${sample.id}-16k.wav`);
      files.push(source, converted);
      process.stderr.write(`Синтетический тест ${sample.id}: локальные TTS → STT.\n`);
      await run('piper', piper, ['--model', piperModel, '--espeak_data', './espeak-ng-data', '--output_file', source,
        '--length_scale', '0.94', '--sentence_silence', '0.12', '--quiet'], piperCwd, `${sample.reference}\n`);
      if (!await readBoundedPcmWav(source, 4 * 1024 * 1024)) throw new Error('INVALID_PIPER_PCM');
      await run('ffmpeg', ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-n', '-i', source, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', converted], directory);
      const stat = await lstat(converted);
      if (!stat.isFile() || stat.size > 4 * 1024 * 1024) throw new Error('AUDIO_LIMIT');
      const started = performance.now();
      // Keep the native model argument relative; older Windows builds may not
      // accept non-ASCII absolute paths even though their working directory does.
      const text = await run('whisper', whisper, ['-m', path.relative(whisperCwd, whisperModel), '-f', converted, '-l', 'ru', '-nt', '-np', '-nf'], whisperCwd);
      results.push({ id: sample.id, status: 'ok', text: text.trim(), latencyMs: Math.round(performance.now() - started), costUsd: null });
      audioEvidence.push({ id: sample.id, sha256: await sha256(converted), bytes: stat.size });
    }
    evidence = { whisperExecutableSha256: await sha256(whisper), whisperModelSha256: await sha256(whisperModel),
      piperExecutableSha256: await sha256(piper), piperModelSha256: await sha256(path.resolve(piperCwd, piperModel)),
      samples: audioEvidence };
  } finally {
    // Only this invocation's fixed filenames; no recursive deletion or globbing.
    for (const file of files) {
      if (path.dirname(file) !== directory) throw new Error('CLEANUP_SCOPE');
      if (!await removeEphemeralTtsFile(file)) cleanupSucceeded = false;
    }
    try { await rmdir(directory); } catch { cleanupSucceeded = false; }
    if (!cleanupSucceeded) throw new Error('CLEANUP_INCOMPLETE');
  }
  return { ...evaluateDictation({ schemaVersion: 'eclipse.ru-dictation-results.v1', provider: 'whisper-local', source: 'synthetic', results }),
    smoke: { inputKind: 'piper-synthetic-audio', microphone: false, cloud: false, audioRetained: false, evidence } };
}

try { process.stdout.write(`${JSON.stringify(await main(process.argv.slice(2)), null, 2)}\n`); }
catch (error) {
  const allowed = new Set(['INVALID_ARGUMENTS', 'ABSOLUTE_WINDOWS_RUNTIME_REQUIRED', 'RUNTIME_FILE_REQUIRED', 'LOCAL_PROCESS_FAILED_OR_TIMED_OUT', 'INVALID_PIPER_PCM', 'AUDIO_LIMIT', 'CLEANUP_SCOPE', 'CLEANUP_INCOMPLETE']);
  process.stderr.write(`Локальный smoke не завершён: ${allowed.has(error.message) ? error.message : 'LOCAL_SMOKE_FAILED'}.\n`);
  if (error.diagnostic) process.stderr.write(`${JSON.stringify(error.diagnostic)}\n`);
  process.exitCode = 1;
}
