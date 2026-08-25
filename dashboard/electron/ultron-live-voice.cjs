const { spawn } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');
const { StringDecoder } = require('string_decoder');

const MAX_STDOUT_BUFFER_BYTES = 128 * 1024;
const MAX_STDERR_BUFFER_BYTES = 8 * 1024;
const RESUME_ECHO_GUARD_MS = 1_800;
const DUPLICATE_WINDOW_MS = 8_000;

function normalizeTranscript(raw) {
  return String(raw || '')
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
    .replace(/^\s*\[[^\]]+\]\s*/gm, '')
    .replace(/<\|[^|]+\|>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function transcriptKey(text) {
  return text
    .toLocaleLowerCase('ru')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function isTranscriptCandidate(text) {
  if (!text) return false;
  return !/^(?:\[?start speaking\]?|ggml_|load_backend:|init:|whisper_|sdl_main:|main:)/i.test(text);
}

class UltronLiveVoiceManager {
  constructor({ runtimeRoot, sendEvent, onStateChange }) {
    this.runtimeRoot = path.resolve(runtimeRoot);
    this.sendEvent = sendEvent;
    this.onStateChange = onStateChange;
    this.process = null;
    this.paused = false;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    this.ignoreUntil = 0;
    this.lastTranscriptKey = '';
    this.lastTranscriptAt = 0;
    this.generation = 0;
    this.readyTimer = null;
  }

  isActive() {
    return Boolean(this.process && !this.process.killed);
  }

  emitState(state, detail) {
    const payload = { state, detail: String(detail || '').slice(0, 240) };
    this.sendEvent('sentinel:voice:live-state', payload);
    this.onStateChange?.(payload);
  }

  emitTranscript(text) {
    this.sendEvent('sentinel:voice:live-transcript', {
      text,
      capturedAt: Date.now(),
      engine: 'whisper.cpp-live',
    });
  }

  commitTranscript(raw) {
    if (this.paused || Date.now() < this.ignoreUntil) return;
    const text = normalizeTranscript(raw);
    if (!isTranscriptCandidate(text)) return;
    const key = transcriptKey(text);
    if (!key) return;
    const now = Date.now();
    if (key === this.lastTranscriptKey && now - this.lastTranscriptAt < DUPLICATE_WINDOW_MS) return;

    this.lastTranscriptKey = key;
    this.lastTranscriptAt = now;
    this.emitTranscript(text);
  }

  parseAvailableTranscripts() {
    // VAD mode emits explicit START/END blocks. Keep supporting that format,
    // even though the production sliding-window mode below does not use it.
    const pattern = /### Transcription \d+ START[^\r\n]*\r?\n([\s\S]*?)\r?\n### Transcription \d+ END/g;
    let consumedThrough = 0;
    let match;
    while ((match = pattern.exec(this.stdoutBuffer)) !== null) {
      consumedThrough = pattern.lastIndex;
      this.commitTranscript(match[1]);
    }

    if (consumedThrough > 0) this.stdoutBuffer = this.stdoutBuffer.slice(consumedThrough);

    // whisper-stream sliding mode redraws the current hypothesis with
    // `ESC[2K\r` and commits the latest hypothesis with `\n` every n_new_line
    // iterations. Only emit the final redraw of each completed line; emitting
    // carriage-return frames would answer partial phrases multiple times.
    const completedLines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = completedLines.pop() || '';
    for (const line of completedLines) {
      const redraws = line
        .split('\r')
        .map((candidate) => normalizeTranscript(candidate))
        .filter(isTranscriptCandidate);
      if (redraws.length > 0) this.commitTranscript(redraws.at(-1));
    }

    if (Buffer.byteLength(this.stdoutBuffer, 'utf8') > MAX_STDOUT_BUFFER_BYTES) {
      this.stdoutBuffer = this.stdoutBuffer.slice(-MAX_STDOUT_BUFFER_BYTES / 2);
    }
  }

  start() {
    if (this.isActive()) return { ok: true, active: true, state: this.paused ? 'paused' : 'listening' };

    const executable = path.join(this.runtimeRoot, 'whisper', 'Release', 'whisper-stream.exe');
    const model = path.join(this.runtimeRoot, 'models', 'whisper', 'ggml-large-v3-turbo-q5_0.bin');
    if (!existsSync(executable) || !existsSync(model)) {
      return {
        ok: false,
        error: {
          code: 'WHISPER_LIVE_RUNTIME_MISSING',
          message: 'Живой режим недоступен: локальный Whisper runtime не найден на диске E:.',
        },
      };
    }

    this.generation += 1;
    const generation = this.generation;
    this.paused = false;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    this.lastTranscriptKey = '';
    this.lastTranscriptAt = 0;
    this.ignoreUntil = Date.now() + RESUME_ECHO_GUARD_MS;

    const child = spawn(executable, [
      '-m', model,
      '-l', 'ru',
      '--step', '2000',
      '--length', '6000',
      '--keep', '200',
      '-vth', '0.45',
      '-fth', '100',
      '-nf',
    ], {
      cwd: path.dirname(executable),
      env: { ...process.env, SDL_AUDIODRIVER: 'directsound' },
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.process = child;
    this.emitState('starting', 'Загружаю локальное распознавание речи.');

    const decoder = new StringDecoder('utf8');
    child.stdout.on('data', (chunk) => {
      if (generation !== this.generation) return;
      this.stdoutBuffer += decoder.write(chunk);
      this.parseAvailableTranscripts();
    });
    child.stderr.on('data', (chunk) => {
      if (generation !== this.generation) return;
      this.stderrBuffer = (this.stderrBuffer + chunk.toString('utf8')).slice(-MAX_STDERR_BUFFER_BYTES);
    });
    child.once('error', () => {
      if (generation !== this.generation) return;
      this.process = null;
      this.emitState('error', 'Не удалось запустить живой локальный микрофон.');
    });
    child.once('close', () => {
      if (generation !== this.generation) return;
      this.process = null;
      const microphoneFailed = /audio\.init\(\) failed|failed to open[^\r\n]*capture/i.test(this.stderrBuffer);
      this.emitState(
        microphoneFailed ? 'error' : 'idle',
        microphoneFailed ? 'Микрофон недоступен. Проверьте устройство ввода Windows.' : 'Живой режим остановлен.',
      );
    });

    this.readyTimer = setTimeout(() => {
      if (generation === this.generation && this.isActive() && !this.paused) {
        this.emitState('listening', 'Микрофон активен. Говорите обычным голосом.');
      }
    }, 1_800);

    return { ok: true, active: true, state: 'starting' };
  }

  pause() {
    if (!this.isActive()) return { ok: false, active: false, state: 'idle' };
    this.paused = true;
    this.stdoutBuffer = '';
    this.lastTranscriptKey = '';
    this.emitState('paused', 'Микрофон ждёт, пока Альтрон отвечает.');
    return { ok: true, active: true, state: 'paused' };
  }

  resume() {
    if (!this.isActive()) return { ok: false, active: false, state: 'idle' };
    this.paused = false;
    this.stdoutBuffer = '';
    this.lastTranscriptKey = '';
    this.ignoreUntil = Date.now() + RESUME_ECHO_GUARD_MS;
    this.emitState('listening', 'Микрофон активен. Говорите обычным голосом.');
    return { ok: true, active: true, state: 'listening' };
  }

  stop() {
    this.generation += 1;
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = null;
    const child = this.process;
    this.process = null;
    this.paused = false;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    if (child && !child.killed) child.kill();
    this.emitState('idle', 'Живой режим остановлен.');
    return { ok: true, active: false, state: 'idle' };
  }

  dispose() {
    this.stop();
  }
}

module.exports = { UltronLiveVoiceManager, normalizeTranscript };
