import { spawn } from 'node:child_process';
import path from 'node:path';

// Approved 06-angry profile. Never accept filters, file paths or URLs from IPC.
export const ULTRON_FILTERS = '[0:a]rubberband=pitch=0.840896:tempo=1.04:formant=preserved,highpass=f=60,lowpass=f=8200,equalizer=f=115:t=q:w=0.85:g=2.8,equalizer=f=280:t=q:w=1:g=-3,equalizer=f=2100:t=q:w=0.9:g=2.5,equalizer=f=3800:t=q:w=0.8:g=1,asplit=3[clean][grit][growl];[grit]highpass=f=140,lowpass=f=3800,volume=9,asoftclip=type=tanh:threshold=0.28:output=0.72:oversample=4,tremolo=f=38:d=0.2[rough];[growl]lowpass=f=1350,rubberband=pitch=0.707107:formant=preserved,highpass=f=65,volume=2,asoftclip=type=tanh:threshold=0.4:output=0.6:oversample=4,adelay=6:all=1[low];[clean][rough][low]amix=inputs=3:weights=\'1 0.33 0.16\':normalize=0,acompressor=threshold=0.1:ratio=4:attack=18:release=55:knee=2:makeup=1.3,loudnorm=I=-18:TP=-2:LRA=9,alimiter=limit=0.794328:level=false[out]';

export function createUltronDsp({ ffmpeg, sandboxHost, spawnProcess = spawn, timeoutMs = 15000 }) {
  if (![ffmpeg, sandboxHost].every(p => typeof p === 'string' && path.isAbsolute(p) && !p.includes('\0')))
    throw new Error('invalid-dsp-path');
  return (pcm, { signal } = {}) => new Promise((resolve, reject) => {
    // Trusted local voice engines supply canonical mono PCM16 WAV. Decode no
    // external/user-selected format; only the two pinned engine rates exist.
    const sampleRate = pcm?.length >= 28 ? pcm.readUInt32LE(24) : 0;
    if (!Buffer.isBuffer(pcm) || pcm.length < 4844 || pcm.length > 1_250_000
      || pcm.toString('ascii', 0, 4) !== 'RIFF' || pcm.toString('ascii', 8, 12) !== 'WAVE'
      || pcm.readUInt32LE(40) !== pcm.length - 44 || ![22050, 24000].includes(sampleRate)
      || pcm.readUInt16LE(22) !== 1 || pcm.readUInt16LE(34) !== 16 || (pcm.length - 44) % 2)
      return reject(new Error('invalid-dsp-input'));
    if (signal?.aborted) return reject(new Error('cancelled'));
    const child = spawnProcess(sandboxHost, [ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error',
      '-protocol_whitelist', 'pipe', '-f', 's16le', '-ar', String(sampleRate), '-ac', '1', '-i', 'pipe:0',
      '-filter_complex', ULTRON_FILTERS, '-map', '[out]', '-map_metadata', '-1', '-vn',
      '-ar', '48000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '192k', '-f', 'mp3', 'pipe:1'],
    { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: { SYSTEMROOT: process.env.SYSTEMROOT || 'C:\\Windows' } });
    let audio = Buffer.alloc(0), logs = 0, failure, settled = false;
    const fail = reason => { if (!failure) { failure = reason; child.kill(); } };
    const abort = () => fail('cancelled');
    const timer = setTimeout(() => fail('dsp-timeout'), timeoutMs);
    const finish = error => {
      if (settled) return; settled = true;
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) reject(new Error(error)); else resolve(audio);
    };
    child.on('error', () => finish('dsp-unavailable'));
    child.stdin.on('error', () => fail('dsp-input-failed'));
    child.stdout.on('data', data => {
      if (audio.length + data.length > 800000) return fail('dsp-output-limit');
      audio = Buffer.concat([audio, data]);
    });
    child.stderr.on('data', data => { logs += data.length; if (logs > 8192) fail('dsp-log-limit'); });
    child.on('close', code => {
      if (failure) return finish(failure);
      if (code !== 0 || audio.length < 512 || (audio.toString('ascii', 0, 3) !== 'ID3' && audio[0] !== 255))
        return finish('dsp-invalid-audio');
      finish();
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort(); else child.stdin.end(pcm.subarray(44));
  });
}
