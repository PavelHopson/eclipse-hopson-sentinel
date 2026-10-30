import { createVoiceSession } from './session.mjs';
import { createUltronDsp } from './dsp.mjs';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

export async function readRuntimeConfig(filename) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 8192) throw new Error('invalid-runtime-config');
  const config = JSON.parse(await readFile(filename, 'utf8'));
  if (config.schema !== 'ultron.offline-runtime.v1' || config.profile !== 'ultron-angry') throw new Error('invalid-runtime-config');
  for (const name of ['python', 'ffmpeg', 'sandboxHost', 'modelRoot']) {
    if (typeof config[name] !== 'string' || !path.isAbsolute(config[name]) || config[name].includes('\0'))
      throw new Error('invalid-runtime-config');
  }
  for (const name of ['python', 'ffmpeg', 'sandboxHost']) {
    const stat = await lstat(config[name]);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 250_000_000
      || !/^[a-f0-9]{64}$/.test(config.hashes?.[name] ?? '')) throw new Error('unapproved-runtime');
    const digest = createHash('sha256').update(await readFile(config[name])).digest('hex');
    if (digest !== config.hashes[name]) throw new Error('runtime-integrity');
  }
  return config;
}

// No server, port, mic, credential, arbitrary model, female voice or shell API.
export function createUltronRuntime({ config, modelLock, onStage = () => {}, supervisorFactory = createVoiceSession, dspFactory = createUltronDsp }) {
  if (!config.sandboxHost) throw new Error('os-sandbox-required');
  const synthesize = supervisorFactory({ ...config, modelLock, onStage });
  const processAudio = dspFactory(config);
  let controller = null, lastStarted = 0;
  let drained = Promise.resolve();
  return {
    async synthesize(text) {
      if (typeof text !== 'string' || !text.trim() || [...text].length > 240 || /\p{C}/u.test(text)
        || text.includes('<|') || text.includes('|>')) throw new Error('invalid-text');
      if (controller) throw new Error('busy');
      if (Date.now() - lastStarted < 200) throw new Error('rate-limited');
      lastStarted = Date.now();
      const current = new AbortController(); controller = current;
      let finishDrain;
      drained = new Promise(resolve => { finishDrain = resolve; });
      try {
        const result = await synthesize({ profile: 'ultron-angry', text }, { signal: current.signal });
        if (current.signal.aborted) throw new Error('cancelled');
        onStage('processing');
        const audio = await processAudio(result.audio, { signal: current.signal });
        if (current.signal.aborted) throw new Error('cancelled');
        return { ok: true, audio: new Uint8Array(audio), mimeType: 'audio/mpeg', engine: 'ultron-angry',
          durationSeconds: result.durationSeconds, synthesisSeconds: result.synthesisSeconds, loadSeconds: result.loadSeconds };
      } finally {
        if (controller === current) controller = null;
        finishDrain();
      }
    },
    async stop() { controller?.abort(); await synthesize.stop?.(); await drained; },
  };
}
