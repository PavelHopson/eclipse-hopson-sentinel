import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROFILE_IDS = Object.freeze(['ultron-angry']);
const MAX_OUTPUT = 1_800_000;
const MAX_LOG = 8192;
const WORKER = fileURLToPath(new URL('./worker.py', import.meta.url));

export function validateRequest(value) {
  if (!value || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).sort().join(',') !== 'profile,text'
    || !PROFILE_IDS.includes(value.profile) || typeof value.text !== 'string'
    || !value.text.trim() || [...value.text].length > 240 || /\p{C}/u.test(value.text)
    || value.text.includes('<|') || value.text.includes('|>')) throw new Error('invalid-request');
  const encoded = JSON.stringify({ profile: value.profile, text: value.text.trim() });
  if (Buffer.byteLength(encoded, 'utf8') > 2048) throw new Error('request-size');
  return encoded;
}

export function workerEnvironment(source = process.env) {
  const env = {};
  for (const key of ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']) if (source[key]) env[key] = source[key];
  return Object.assign(env, { CUDA_VISIBLE_DEVICES: '', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1',
    HF_HUB_DISABLE_TELEMETRY: '1', HF_HUB_DISABLE_IMPLICIT_TOKEN: '1', DO_NOT_TRACK: '1',
    TOKENIZERS_PARALLELISM: 'false', OMP_NUM_THREADS: '4', USERNAME: 'ultron-tts' });
}

export function killOwnedProcess(child) {
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0) return;
  if (process.platform === 'win32') {
    const systemRoot = process.env.SYSTEMROOT || 'C:\\Windows';
    const killer = spawn(path.join(systemRoot, 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'],
      { shell: false, windowsHide: true, stdio: 'ignore', env: workerEnvironment() });
    killer.on('error', () => child.kill());
    killer.on('close', code => { if (code !== 0) child.kill(); });
  } else child.kill('SIGKILL');
}

export function decodeWorkerResponse(encoded, profile, sequence) {
  const result = JSON.parse(encoded);
  if (result.ok !== true || result.profile !== profile || typeof result.audio !== 'string'
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.audio)
    || (sequence !== undefined && result.sequence !== sequence)) throw new Error('invalid-response');
  const audio = Buffer.from(result.audio, 'base64');
  if (audio.length < 44 || audio.length > 1_250_000
    || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE'
    || audio.readUInt32LE(4) !== audio.length - 8 || audio.toString('ascii', 12, 16) !== 'fmt '
    || audio.readUInt32LE(16) !== 16 || audio.toString('ascii', 36, 40) !== 'data'
    || audio.readUInt32LE(40) !== audio.length - 44 || audio.readUInt16LE(20) !== 1
    || audio.readUInt16LE(22) !== 1 || audio.readUInt32LE(24) !== 24000 || audio.readUInt16LE(34) !== 16
    || audio.readUInt32LE(28) !== 48000 || audio.readUInt16LE(32) !== 2 || (audio.length - 44) % 2 !== 0)
    throw new Error('invalid-response');
  for (const key of ['loadSeconds', 'synthesisSeconds', 'durationSeconds'])
    if (!Number.isFinite(result[key]) || result[key] < 0 || result[key] > 360) throw new Error('invalid-response');
  const duration = (audio.length - 44) / 48000;
  if (duration < 0.1 || duration >= 23.92 || Math.abs(duration - result.durationSeconds) > 0.001)
    throw new Error('invalid-response');
  return { audio, profile: result.profile, loadSeconds: result.loadSeconds,
    synthesisSeconds: result.synthesisSeconds, durationSeconds: result.durationSeconds };
}

// Runtime/model paths belong to the host, never to a renderer request.
export function createVoiceSupervisor({ python, modelRoot, modelLock, sandboxHost, timeoutMs = 360_000,
  spawnProcess = spawn, killProcess = killOwnedProcess, onStage = () => {} }) {
  for (const value of [python, modelRoot, modelLock, ...(sandboxHost ? [sandboxHost] : [])]) {
    if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) throw new Error('invalid-runtime-path');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 360_000) throw new Error('invalid-timeout');
  let active = false;
  return async function synthesize(request, { signal } = {}) {
    const encoded = validateRequest(request);
    if (signal?.aborted) throw new Error('cancelled');
    if (active) throw new Error('busy');
    active = true;
    try {
      return await new Promise((resolve, reject) => {
        const args = ['-I', WORKER, '--model-root', modelRoot, '--model-lock', modelLock];
        const child = spawnProcess(sandboxHost || python, sandboxHost ? [python, ...args] : args,
          { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: workerEnvironment() });
        let output = Buffer.alloc(0), logBytes = 0, pendingLog = '', failure, settled = false, timer;
        const fail = reason => { if (!failure) { failure = reason; killProcess(child); } };
        const abort = () => fail('cancelled');
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          if (error) reject(new Error(error)); else resolve(value);
        };
        child.on('error', () => finish('runtime-unavailable'));
        child.stdin.on('error', () => fail('input-failed'));
        child.stdout.on('data', data => {
          if (output.length + data.length > MAX_OUTPUT) { fail('output-limit'); return; }
          output = Buffer.concat([output, data]);
        });
        child.stderr.on('data', data => {
          logBytes += data.length;
          if (logBytes > MAX_LOG) { fail('log-limit'); return; }
          pendingLog += data.toString('utf8');
          const lines = pendingLog.split('\n');
          pendingLog = lines.pop();
          for (const line of lines) {
            try {
              const stage = JSON.parse(line).stage;
              if (['loading-offline-cpu', 'synthesizing'].includes(stage)) onStage(stage);
            } catch { /* Do not forward third-party logs or request text. */ }
          }
        });
        child.on('close', code => {
          if (failure) return finish(failure);
          if (code !== 0) return finish('synthesis-failed');
          try {
            finish(null, decodeWorkerResponse(output.toString('utf8'), request.profile));
          } catch { finish('invalid-response'); }
        });
        timer = setTimeout(() => fail('timeout'), timeoutMs);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        else child.stdin.end(encoded, 'utf8');
      });
    } finally { active = false; }
  };
}
