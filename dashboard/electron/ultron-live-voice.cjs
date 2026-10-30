const { spawn } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');
const { StringDecoder } = require('string_decoder');

const MAX_STDOUT_BUFFER_BYTES = 128 * 1024;
const MAX_STDERR_BUFFER_BYTES = 8 * 1024;
const RESUME_ECHO_GUARD_MS = 1_800;
const DUPLICATE_WINDOW_MS = 8_000;
const INPUT_HINT_DELAY_MS = 12_000;
const TRANSCRIPT_RATE_WINDOW_MS = 60_000;
const MAX_TRANSCRIPTS_PER_WINDOW = 24;
const TRANSCRIPT_BURST_WINDOW_MS = 8_000;
const MAX_TRANSCRIPTS_PER_BURST = 4;
const STOP_CONFIRMATION_MS = 3_000;
const SAFE_CAPTURE_ENV = new Set(['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'PATH']);

function buildCaptureEnvironment(source) {
  return { ...Object.fromEntries(Object.entries(source).filter(([key]) => SAFE_CAPTURE_ENV.has(key.toUpperCase()))),
    SDL_AUDIODRIVER: 'directsound' };
}
const SLIDING_CONFIRMATION_COUNT = 2;
const SLIDING_CANDIDATE_WINDOW_MS = 7_000;
const CAPTURE_DEVICE_ID = '0';
const SILENCE_HALLUCINATIONS = new Set([
  'продолжение следует',
  'спасибо за просмотр',
  'спасибо',
]);

function normalizeTranscript(raw) {
  return String(raw || '')
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
    .replace(/^\s*\[\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}\]\s*/gm, '')
    .replace(/<\|[^|]+\|>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function transcriptKey(text) {
  return text
    .toLocaleLowerCase('ru')
    .replace(/\s+/g, ' ')
    .replace(/[.!?…]+$/g, '')
    .trim();
}

function isTranscriptCandidate(text) {
  // Whisper can emit punctuation/music marks for non-speech. These must not
  // end one-shot capture or initiate a model turn. Keep short real replies ("да", "4").
  if (!text || !/[\p{L}\p{N}]/u.test(text)) return false;
  if (/^(?:\[?start speaking\]?|\[(?:BLANK_AUDIO|silence)\]|### Transcription|ggml_|load_backend:|init:|whisper_|sdl_main:|main:)/i.test(text)) return false;
  return !SILENCE_HALLUCINATIONS.has(transcriptKey(text));
}

function resolveWhisperRuntime(runtimeRoot) {
  const executable = path.join(runtimeRoot, 'whisper', 'Release', 'whisper-stream.exe');
  const model = path.join(runtimeRoot, 'models', 'whisper', 'ggml-large-v3-turbo-q5_0.bin');
  const cwd = path.dirname(executable);
  return { executable, model, cwd, modelArgument: path.relative(cwd, model) };
}

class UltronLiveVoiceManager {
  constructor({ runtimeRoot, sendEvent, onStateChange, now = Date.now, terminateProcessTree, spawnProcess = spawn, fileExists = existsSync }) {
    this.runtimeRoot = path.resolve(runtimeRoot);
    this.sendEvent = sendEvent;
    this.onStateChange = onStateChange;
    this.now = now;
    this.spawnProcess = spawnProcess;
    this.fileExists = fileExists;
    this.state = 'idle';
    this.ready = false;
    this.stopping = false;
    this.whenStopped = Promise.resolve();
    this.stopAttempt = null;
    this.onceCapture = null;
    this.terminateProcessTree = terminateProcessTree || ((child) => {
      if (child) child.kill();
    });
    this.process = null;
    this.paused = false;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    this.ignoreUntil = 0;
    this.lastTranscriptKey = '';
    this.lastTranscriptAt = 0;
    this.transcriptTimes = [];
    this.generation = 0;
    this.readyTimer = null;
    this.inputHintTimer = null;
    this.vadBlock = null;
    this.droppingLine = false;
    this.slidingCandidateKey = '';
    this.slidingCandidateText = '';
    this.slidingCandidateCount = 0;
    this.slidingCandidateAt = 0;
  }

  isActive() {
    // killed only acknowledges a signal, not native process termination.
    return Boolean(this.process);
  }

  emitState(state, detail) {
    this.state = state;
    const payload = { state, detail: String(detail || '').slice(0, 240) };
    if (!this.onceCapture) this.sendEvent('sentinel:voice:live-state', payload);
    this.onStateChange?.(payload);
    if (state === 'error' && this.onceCapture) {
      this.finishOnce({ ok: false, error: { code: 'VOICE_CAPTURE_FAILED', message: payload.detail } });
    }
  }

  emitTranscript(text) {
    if (this.onceCapture) {
      this.finishOnce({ ok: true, text, confidence: null, engine: 'whisper.cpp' });
      return;
    }
    this.sendEvent('sentinel:voice:live-transcript', {
      text,
      capturedAt: this.now(),
      engine: 'whisper.cpp-live',
    });
  }

  listenOnce() {
    if (this.isActive() || this.stopping || this.onceCapture) {
      return Promise.resolve({ ok: false, error: { code: 'VOICE_BUSY', message: 'Микрофон занят или ещё останавливается.' } });
    }
    return new Promise((resolve) => {
      this.onceCapture = { resolve, timer: null };
      const result = this.start();
      if (!result.ok) this.finishOnce(result);
    });
  }

  finishOnce(result) {
    const capture = this.onceCapture;
    if (!capture || capture.finishing) return;
    capture.finishing = true;
    clearTimeout(capture.timer);
    this.stop();
    void this.whenStopped.finally(() => {
      if (this.onceCapture === capture) this.onceCapture = null;
      capture.resolve(this.process ? { ok: false, error: { code: 'VOICE_STOP_FAILED',
        message: 'Не удалось подтвердить остановку микрофона. Повторите «Стоп» или закройте Альтрона.' } } : result);
    });
  }

  markReady() {
    if (this.ready || !this.isActive()) return;
    this.ready = true;
    clearTimeout(this.readyTimer);
    this.readyTimer = null;
    this.ignoreUntil = this.now();
    if (this.onceCapture) {
      this.onceCapture.timer = setTimeout(() => this.finishOnce({ ok: false,
        error: { code: 'NO_SPEECH_RECOGNIZED', message: 'За 15 секунд не получена завершённая фраза. Проверьте уровень микрофона.' },
      }), 15_000);
    }
    if (!this.paused) {
      this.emitState('listening', 'Микрофон готов. Скажите фразу и сделайте короткую паузу.');
      this.armInputHint();
    }
  }

  clearInputHint() {
    if (this.inputHintTimer) clearTimeout(this.inputHintTimer);
    this.inputHintTimer = null;
  }

  armInputHint(generation = this.generation) {
    this.clearInputHint();
    this.inputHintTimer = setTimeout(() => {
      this.inputHintTimer = null;
      if (generation !== this.generation || !this.isActive() || this.paused) return;
      this.emitState(
        'listening',
        'Речь пока не распознана. Поднесите микрофон ближе и увеличьте gain FIFINE или уровень ввода Windows.',
      );
    }, INPUT_HINT_DELAY_MS);
  }

  commitTranscript(raw) {
    if (!this.isActive() || this.stopping || this.paused || this.now() < this.ignoreUntil) return;
    const text = normalizeTranscript(raw);
    if (!isTranscriptCandidate(text)) return;
    const key = transcriptKey(text);
    if (!key) return;
    const now = this.now();
    if (key === this.lastTranscriptKey && now - this.lastTranscriptAt < DUPLICATE_WINDOW_MS) return;
    this.transcriptTimes = this.transcriptTimes.filter((capturedAt) => now - capturedAt < TRANSCRIPT_RATE_WINDOW_MS);
    const burstCount = this.transcriptTimes.filter((at) => now - at < TRANSCRIPT_BURST_WINDOW_MS).length;
    if (this.transcriptTimes.length >= MAX_TRANSCRIPTS_PER_WINDOW || burstCount >= MAX_TRANSCRIPTS_PER_BURST) {
      this.stop({
        state: 'error',
        detail: 'Защита остановила живой режим из-за слишком частых срабатываний. Проверьте шум, эхо и уровень микрофона.',
      });
      return;
    }

    this.lastTranscriptKey = key;
    this.lastTranscriptAt = now;
    this.transcriptTimes.push(now);
    this.clearInputHint();
    this.emitTranscript(text);
  }

  resetSlidingCandidate() {
    this.slidingCandidateKey = '';
    this.slidingCandidateText = '';
    this.slidingCandidateCount = 0;
    this.slidingCandidateAt = 0;
  }

  observeSlidingCandidate(raw) {
    if (!this.isActive() || this.paused || this.now() < this.ignoreUntil) return;
    const text = normalizeTranscript(raw);
    if (!isTranscriptCandidate(text)) return;
    const key = transcriptKey(text);
    if (!key) return;
    const now = this.now();
    if (key === this.slidingCandidateKey && now - this.slidingCandidateAt <= SLIDING_CANDIDATE_WINDOW_MS) {
      this.slidingCandidateCount += 1;
      this.slidingCandidateText = text;
      this.slidingCandidateAt = now;
    } else {
      this.slidingCandidateKey = key;
      this.slidingCandidateText = text;
      this.slidingCandidateCount = 1;
      this.slidingCandidateAt = now;
    }
    if (this.slidingCandidateCount < SLIDING_CONFIRMATION_COUNT) return;
    const confirmed = this.slidingCandidateText;
    this.resetSlidingCandidate();
    this.commitTranscript(confirmed);
  }

  parseAvailableTranscripts() {
    if (!this.isActive()) {
      this.stdoutBuffer = '';
      this.vadBlock = null;
      this.droppingLine = false;
      this.resetSlidingCandidate();
      return;
    }
    // Framing survives process chunk boundaries. A VAD line is not a complete
    // utterance; only its matching END may commit it to the conversation.
    const completedLines = this.stdoutBuffer.split(/\r\n|\r|\n/);
    this.stdoutBuffer = completedLines.pop() || '';
    for (const line of completedLines) {
      if (this.droppingLine || Buffer.byteLength(line, 'utf8') > MAX_STDOUT_BUFFER_BYTES) {
        this.droppingLine = false;
        this.discardVad();
        continue;
      }
      const marker = line.trim();
      if (marker === '[Start speaking]') {
        this.markReady();
        continue;
      }
      const start = /^### Transcription (\d+) START(?:\s.*)?$/.exec(marker);
      if (start) {
        this.vadBlock = { id: start[1], lines: [], bytes: 0, overflow: this.paused || this.now() < this.ignoreUntil };
        continue;
      }
      const end = /^### Transcription (\d+) END$/.exec(marker);
      if (end) {
        const block = this.vadBlock;
        this.vadBlock = null;
        if (block?.id === end[1] && !block.overflow) this.commitTranscript(block.lines.join('\n'));
        continue;
      }
      if (this.vadBlock) {
        if (this.paused || this.now() < this.ignoreUntil) this.discardVad();
        this.vadBlock.bytes += Buffer.byteLength(line, 'utf8') + 1;
        if (this.vadBlock.bytes > MAX_STDOUT_BUFFER_BYTES) {
          this.vadBlock.lines = [];
          this.vadBlock.overflow = true;
        } else if (!this.vadBlock.overflow) {
          this.vadBlock.lines.push(line);
        }
        continue;
      }
      // Compatibility parser only. Production starts in VAD mode (--step 0),
      // so a completed START/END block does not need two identical redraws.
      this.observeSlidingCandidate(line);
    }

    if (Buffer.byteLength(this.stdoutBuffer, 'utf8') > MAX_STDOUT_BUFFER_BYTES) {
      this.stdoutBuffer = '';
      this.discardVad();
      this.droppingLine = true;
    }
  }

  discardVad() {
    if (this.vadBlock) {
      this.vadBlock.lines = [];
      this.vadBlock.overflow = true;
    }
  }

  start() {
    if (this.stopping) return { ok: false, active: false, error: { code: 'VOICE_STOPPING', message: 'Микрофон ещё останавливается. Повторите через секунду.' } };
    if (this.isActive()) return { ok: true, active: true, state: this.state };

    const { executable, model, cwd, modelArgument } = resolveWhisperRuntime(this.runtimeRoot);
    if (!this.fileExists(executable) || !this.fileExists(model)) {
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
    this.ready = false;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    this.vadBlock = null;
    this.droppingLine = false;
    this.lastTranscriptKey = '';
    this.lastTranscriptAt = 0;
    this.transcriptTimes = [];
    this.resetSlidingCandidate();
    this.ignoreUntil = this.now() + RESUME_ECHO_GUARD_MS;

    let child;
    try { child = this.spawnProcess(executable, [
      '-m', modelArgument,
      '-l', 'ru',
      '-c', CAPTURE_DEVICE_ID,
      '--step', '0',
      '--length', '6000',
      '--keep', '200',
      '-fth', '100',
      '-nf',
    ], {
      cwd,
      env: buildCaptureEnvironment(process.env),
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    }); } catch {
      return { ok: false, error: { code: 'WHISPER_START_FAILED', message: 'Не удалось запустить локальное распознавание.' } };
    }
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
      clearTimeout(this.readyTimer);
      this.clearInputHint();
      // A failed spawn has no PID. An error after spawn does not prove exit.
      if (!child.pid) this.process = null;
      this.stop({ state: 'error', detail: 'Не удалось запустить живой локальный микрофон.' });
    });
    child.once('close', (code) => {
      const wasStopping = this.stopping;
      if (this.process === child) {
        this.process = null;
        this.stopping = false;
      }
      if (generation !== this.generation) {
        if (wasStopping && !this.stopAttempt) this.emitState('idle', 'Микрофон остановлен.');
        return;
      }
      clearTimeout(this.readyTimer);
      this.clearInputHint();
      this.process = null;
      const microphoneFailed = /audio\.init\(\) failed|failed to open[^\r\n]*capture/i.test(this.stderrBuffer);
      this.emitState(
        'error',
        microphoneFailed ? 'Микрофон недоступен. Проверьте устройство ввода Windows.'
          : `Whisper завершился до остановки пользователем (код ${Number.isInteger(code) ? code : 'неизвестен'}). Повторите запуск.`,
      );
    });

    this.readyTimer = setTimeout(() => {
      if (generation === this.generation && this.isActive() && !this.ready) {
        this.stop({ state: 'error', detail: 'Whisper не подготовил микрофон за 20 секунд. Запуск остановлен.' });
      }
    }, 20_000);

    return { ok: true, active: true, state: 'starting' };
  }

  pause() {
    if (this.stopping) return { ok: false, active: true, state: 'stopping' };
    if (!this.isActive()) return { ok: false, active: false, state: 'idle' };
    this.paused = true;
    this.droppingLine = this.droppingLine || this.stdoutBuffer.length > 0;
    this.stdoutBuffer = '';
    this.discardVad();
    this.lastTranscriptKey = '';
    this.resetSlidingCandidate();
    this.clearInputHint();
    this.emitState('paused', 'Микрофон ждёт, пока Альтрон отвечает.');
    return { ok: true, active: true, state: 'paused' };
  }

  resume() {
    if (this.stopping) return { ok: false, active: true, state: 'stopping' };
    if (!this.isActive()) return { ok: false, active: false, state: 'idle' };
    this.paused = false;
    this.droppingLine = this.droppingLine || this.stdoutBuffer.length > 0;
    this.stdoutBuffer = '';
    this.discardVad();
    this.lastTranscriptKey = '';
    this.resetSlidingCandidate();
    this.ignoreUntil = this.now() + RESUME_ECHO_GUARD_MS;
    const state = this.ready ? 'listening' : 'starting';
    this.emitState(state, this.ready ? 'Микрофон активен. Говорите обычным голосом.' : 'Микрофон ещё готовится. Дождитесь сигнала готовности.');
    if (this.ready) this.armInputHint();
    return { ok: true, active: true, state };
  }

  stop({ state = 'idle', detail = 'Живой режим остановлен.' } = {}) {
    if (this.stopAttempt) return { ok: true, active: true, state: 'stopping' };
    this.generation += 1;
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = null;
    this.clearInputHint();
    const child = this.process;
    this.paused = false;
    this.ready = false;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    this.vadBlock = null;
    this.droppingLine = false;
    this.transcriptTimes = [];
    this.resetSlidingCandidate();
    if (child) {
      this.stopping = true;
      this.emitState('stopping', 'Останавливаю микрофон. Новый захват заблокирован до завершения процесса.');
      const attempt = new Promise((resolve) => {
        let timer;
        const finish = (exited) => {
          clearTimeout(timer);
          child.removeListener?.('close', closed);
          if (exited && this.process === child) this.process = null;
          this.stopping = Boolean(this.process);
          this.emitState(exited ? state : 'stopping', exited ? detail
            : 'Остановка микрофона не подтверждена. Нажмите «Остановить живой режим» ещё раз или закройте Альтрона.');
          resolve(exited);
        };
        const closed = () => finish(true);
        child.once?.('close', closed);
        timer = setTimeout(() => finish(false), STOP_CONFIRMATION_MS);
        // The termination result is intentionally not used as proof of exit.
        try { Promise.resolve(this.terminateProcessTree(child)).catch(() => {}); }
        catch { /* Keep ownership and the admission lock until close. */ }
      });
      this.stopAttempt = attempt;
      this.whenStopped = attempt.finally(() => { if (this.stopAttempt === attempt) this.stopAttempt = null; });
    } else {
      this.stopping = false;
      this.emitState(state, detail);
    }
    if (this.onceCapture && !this.onceCapture.finishing) this.finishOnce({ ok: false,
      error: { code: 'VOICE_CANCELLED', message: 'Распознавание остановлено.' },
    });
    return { ok: true, active: Boolean(child), state: child ? 'stopping' : state };
  }

  dispose() {
    this.stop();
  }
}

module.exports = { UltronLiveVoiceManager, normalizeTranscript, resolveWhisperRuntime, buildCaptureEnvironment };
