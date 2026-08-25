const { app, BrowserWindow, shell, Menu, Tray, globalShortcut, nativeImage } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const { existsSync } = require('fs');
const { ipcMain } = require('electron');
const { pathToFileURL } = require('url');
const { UltronLiveVoiceManager } = require('./ultron-live-voice.cjs');
const {
  prepareEphemeralTtsFile,
  pruneStaleTtsFiles,
  readBoundedPcmWav,
  removeEphemeralTtsFile,
} = require('./tts-wav-transport.cjs');
const {
  approveVoiceAction,
  createVoiceActionPreview,
  createVoiceActionReceipt,
} = require('./voice-action-policy.cjs');

// The desktop product was renamed to Eclipse Ultron, but the existing local
// Chromium profile remains the stable data boundary for sessions and settings.
// Set it before app readiness so an upgrade never creates an empty parallel profile.
app.setPath('userData', path.join(app.getPath('appData'), 'Eclipse Sentinel'));

const isDev = !app.isPackaged;
let win = null;
let tray = null;
let safeOperatorExecutor = null;
let labOllamaProcess = null;
let liveVoiceManager = null;
let pendingVoiceActionPreview = null;
let voiceActionLastExecutedAt = 0;
const EXECUTE_CHANNEL = 'sentinel:operator:execute';
const VOICE_LISTEN_CHANNEL = 'sentinel:voice:listen-once';
const VOICE_LIVE_START_CHANNEL = 'sentinel:voice:live-start';
const VOICE_LIVE_STOP_CHANNEL = 'sentinel:voice:live-stop';
const VOICE_LIVE_PAUSE_CHANNEL = 'sentinel:voice:live-pause';
const VOICE_LIVE_RESUME_CHANNEL = 'sentinel:voice:live-resume';
const VOICE_TTS_SYNTHESIZE_CHANNEL = 'sentinel:voice:tts-synthesize';
const VOICE_TTS_STOP_CHANNEL = 'sentinel:voice:tts-stop';
const VOICE_ACTION_PREVIEW_CHANNEL = 'sentinel:voice:action-preview';
const VOICE_ACTION_EXECUTE_CHANNEL = 'sentinel:voice:action-execute';
const VOICE_ACTION_CANCEL_CHANNEL = 'sentinel:voice:action-cancel';
const VOICE_OUTPUT_LIMIT_BYTES = 8 * 1024;
const VOICE_PROCESS_TIMEOUT_MS = 25_000;
const VOICE_RATE_LIMIT_MS = 1_500;
const VOICE_MODEL_WARMUP_URL = 'http://127.0.0.1:11434/api/generate';
const VOICE_MODEL_WARMUP_TIMEOUT_MS = 120_000;
const VOICE_ACTION_RATE_LIMIT_MS = 1_000;
let voiceListenInFlight = false;
let voiceLastStartedAt = 0;
let piperTtsProcess = null;
let piperTtsLastStartedAt = 0;
const PIPER_TTS_TEXT_LIMIT = 400;
const PIPER_TTS_OUTPUT_LIMIT_BYTES = 12 * 1024 * 1024;
const PIPER_TTS_TIMEOUT_MS = 8_000;
const PIPER_TTS_RATE_LIMIT_MS = 200;
const operatorModuleUrl = pathToFileURL(
  path.resolve(__dirname, 'sentinel-safe-operator.mjs'),
).href;
const operatorModulePromise = import(operatorModuleUrl);

const officeRuntimeModulePath = isDev
  ? path.resolve(__dirname, '../../office/sentinel-office-runtime.mjs')
  : path.join(process.resourcesPath, 'office', 'sentinel-office-runtime.mjs');
const officeRuntimeModuleUrl = pathToFileURL(officeRuntimeModulePath).href;
const windowIconPath = isDev
  ? path.resolve(__dirname, '../build/eclipse-sentinel.ico')
  : path.join(process.resourcesPath, 'brand', 'eclipse-sentinel.ico');
const officeRuntimePromise = import(officeRuntimeModuleUrl)
  .then(({ createSentinelOfficeRuntime }) => createSentinelOfficeRuntime())
  .catch(() => null);

const voiceScriptPath = isDev
  ? path.resolve(__dirname, '../../scripts/sentinel-stt.ps1')
  : path.join(process.resourcesPath, 'voice', 'sentinel-stt.ps1');
const eclipseProgramsRoot = isDev
  ? path.join(path.parse(__dirname).root, 'ADMIN_HOPSON_PC', 'Программы')
  : path.dirname(path.dirname(process.execPath));
const eclipseAiRuntimeRoot = process.env.ECLIPSE_AI_RUNTIME_DIR
  ? path.resolve(process.env.ECLIPSE_AI_RUNTIME_DIR)
  : path.join(eclipseProgramsRoot, 'Eclipse AI Runtime');
const labOllamaExecutable = path.join(eclipseAiRuntimeRoot, 'ollama', 'ollama.exe');
const labOllamaModels = path.join(eclipseAiRuntimeRoot, 'models', 'ollama');
const piperTtsDirectory = path.join(eclipseAiRuntimeRoot, 'tts', 'piper', 'runtime', 'piper');
const piperTtsExecutable = path.join(piperTtsDirectory, 'piper.exe');
const piperTtsModelRelative = path.join('..', '..', 'voices', 'ru', 'ru_RU', 'denis', 'medium', 'ru_RU-denis-medium.onnx');
const piperTtsTempDirectory = path.join(eclipseAiRuntimeRoot, 'temp', 'tts');

function sendVoiceEvent(channel, payload) {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

function ensureLiveVoiceManager() {
  if (!liveVoiceManager) {
    liveVoiceManager = new UltronLiveVoiceManager({
      runtimeRoot: eclipseAiRuntimeRoot,
      sendEvent: sendVoiceEvent,
      onStateChange: () => refreshTrayMenu(),
    });
  }
  return liveVoiceManager;
}

function isLabOllamaListening() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 11435 });
    const finish = (listening) => {
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function ensureLabOllamaServer() {
  if (!existsSync(labOllamaExecutable) || await isLabOllamaListening()) return;

  const child = spawn(labOllamaExecutable, ['serve'], {
    env: {
      ...process.env,
      OLLAMA_HOST: '127.0.0.1:11435',
      OLLAMA_MODELS: labOllamaModels,
      OLLAMA_KEEP_ALIVE: '5m',
      OLLAMA_LOAD_TIMEOUT: '15m',
    },
    windowsHide: true,
    shell: false,
    stdio: 'ignore',
  });
  labOllamaProcess = child;
  child.once('error', () => {
    if (labOllamaProcess === child) labOllamaProcess = null;
  });
  child.once('exit', () => {
    if (labOllamaProcess === child) labOllamaProcess = null;
  });
}

async function warmPrimaryVoiceModel() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VOICE_MODEL_WARMUP_TIMEOUT_MS);
  try {
    const response = await fetch(VOICE_MODEL_WARMUP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3:8b',
        prompt: '',
        stream: false,
        keep_alive: '2h',
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      return;
    }
    await response.arrayBuffer();
  } catch {
    // Voice UI remains usable and reports provider failures explicitly.
  } finally {
    clearTimeout(timeoutId);
  }
}


function isTrustedOperatorSender(event) {
  if (!win || event.sender !== win.webContents || !event.senderFrame) return false;
  try {
    const senderUrl = new URL(event.senderFrame.url);
    return isDev
      ? senderUrl.origin === 'http://localhost:3939'
      : senderUrl.protocol === 'file:';
  } catch {
    return false;
  }
}

function projectOfficeSuccess(request, receipt) {
  void officeRuntimePromise.then((runtime) => {
    if (runtime) runtime.recordSuccess(request, receipt);
  }).catch(() => {});
}

function projectOfficeBlocked(request, error) {
  void officeRuntimePromise.then((runtime) => {
    if (runtime) runtime.recordBlocked(request, error);
  }).catch(() => {});
}

ipcMain.handle(EXECUTE_CHANNEL, async (event, request) => {
  if (!isTrustedOperatorSender(event)) {
    return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'IPC sender is not trusted' } };
  }

  try {
    const { createSafeOperatorExecutor } = await operatorModulePromise;
    if (!safeOperatorExecutor) {
      safeOperatorExecutor = createSafeOperatorExecutor({
        transport: 'electron-ipc',
        runtimeProvider: () => ({
          platform: process.platform,
          arch: process.arch,
          node: process.versions.node,
          electron: process.versions.electron,
          packaged: app.isPackaged,
        }),
      });
    }
    const receipt = safeOperatorExecutor.execute(request);
    projectOfficeSuccess(request, receipt);
    return { ok: true, receipt };
  } catch (error) {
    const { SafeOperatorError } = await operatorModulePromise;
    projectOfficeBlocked(request, error);
    return {
      ok: false,
      error: {
        code: error instanceof SafeOperatorError ? error.code : 'OPERATOR_FAILED',
        message: error instanceof SafeOperatorError ? error.message : 'Safe operator failed',
      },
    };
  }
});

ipcMain.handle(VOICE_ACTION_PREVIEW_CHANNEL, (event, ...args) => {
  if (!isTrustedOperatorSender(event)) {
    return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'IPC sender is not trusted' } };
  }
  if (args.length !== 1 || typeof args[0] !== 'string') {
    return { ok: false, error: { code: 'ACTION_INPUT_REJECTED', message: 'Действие не прошло проверку.' } };
  }
  const preview = createVoiceActionPreview(args[0]);
  if (!preview) {
    return { ok: false, error: { code: 'ACTION_NOT_ALLOWED', message: 'Это действие не входит в allowlist Альтрона.' } };
  }
  pendingVoiceActionPreview = preview;
  return { ok: true, preview };
});

ipcMain.handle(VOICE_ACTION_CANCEL_CHANNEL, (event, ...args) => {
  if (!isTrustedOperatorSender(event) || args.length !== 1 || typeof args[0] !== 'string') return false;
  if (pendingVoiceActionPreview?.requestId !== args[0]) return false;
  pendingVoiceActionPreview = null;
  return true;
});

ipcMain.handle(VOICE_ACTION_EXECUTE_CHANNEL, async (event, ...args) => {
  if (!isTrustedOperatorSender(event)) {
    return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'IPC sender is not trusted' } };
  }
  if (args.length !== 1) {
    return { ok: false, error: { code: 'ACTION_INPUT_REJECTED', message: 'Подтверждение не прошло проверку.' } };
  }

  const preview = pendingVoiceActionPreview;
  pendingVoiceActionPreview = null;
  const action = approveVoiceAction(preview, args[0]);
  if (!action) {
    return { ok: false, error: { code: 'ACTION_APPROVAL_INVALID', message: 'Preview устарел или не был подтверждён.' } };
  }
  const now = Date.now();
  if (now - voiceActionLastExecutedAt < VOICE_ACTION_RATE_LIMIT_MS) {
    return { ok: false, error: { code: 'ACTION_RATE_LIMITED', message: 'Подождите секунду перед следующим действием.' } };
  }
  voiceActionLastExecutedAt = now;

  try {
    await shell.openExternal(action.target);
    return { ok: true, receipt: createVoiceActionReceipt(preview) };
  } catch {
    return { ok: false, error: { code: 'BROWSER_OPEN_FAILED', message: 'Браузер не смог открыть подтверждённый адрес.' } };
  }
});

function parseVoicePayload(output) {
  try {
    const payload = JSON.parse(output.trim());
    if (payload?.ok === false && typeof payload.code === 'string') {
      const safeErrors = {
        WHISPER_RUNTIME_MISSING: 'Локальный голосовой runtime не найден. Переустановите Eclipse AI Runtime на диске E:.',
        WHISPER_RUNTIME_INVALID: 'Путь к локальному голосовому runtime некорректен.',
        WHISPER_MODEL_MISSING: 'Локальная модель распознавания речи не найдена.',
        WHISPER_MODEL_INVALID: 'Локальная модель распознавания речи повреждена или несовместима.',
        WHISPER_START_FAILED: 'Не удалось запустить локальный Whisper runtime.',
        RUSSIAN_SPEECH_PACK_MISSING: 'Локальный Whisper недоступен, а русский Windows Speech не установлен.',
        MICROPHONE_UNAVAILABLE: 'Микрофон недоступен. Проверьте разрешения Windows и устройство ввода по умолчанию.',
        NO_SPEECH_RECOGNIZED: 'Речь не распознана. Нажмите ещё раз и говорите обычным голосом рядом с микрофоном.',
      };
      const message = safeErrors[payload.code];
      if (message) return { ok: false, error: { code: payload.code, message } };
    }
    if (!payload || payload.ok !== true || typeof payload.text !== 'string') {
      return { ok: false, error: { code: 'VOICE_NOT_RECOGNIZED', message: 'Речь не распознана. Попробуйте ещё раз.' } };
    }

    const text = payload.text.trim().slice(0, 500);
    if (!text) {
      return { ok: false, error: { code: 'VOICE_NOT_RECOGNIZED', message: 'Речь не распознана. Попробуйте ещё раз.' } };
    }

    const parsedConfidence = Number(payload.confidence);
    const confidence = Number.isFinite(parsedConfidence)
      ? Math.max(0, Math.min(1, parsedConfidence))
      : null;
    return { ok: true, text, confidence };
  } catch {
    return { ok: false, error: { code: 'VOICE_INVALID_OUTPUT', message: 'Локальный модуль речи вернул некорректный ответ.' } };
  }
}

function runLocalVoiceRecognition() {
  return new Promise((resolve) => {
    let stdout = '';
    let outputBytes = 0;
    let settled = false;

    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      voiceScriptPath,
      '-TimeoutSeconds',
      '12',
      '-RuntimeRoot',
      eclipseAiRuntimeRoot,
    ], {
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const timeout = setTimeout(() => {
      child.kill();
      finish({ ok: false, error: { code: 'VOICE_TIMEOUT', message: 'Время ожидания речи истекло.' } });
    }, VOICE_PROCESS_TIMEOUT_MS);

    const consume = (chunk, capture) => {
      outputBytes += chunk.length;
      if (outputBytes > VOICE_OUTPUT_LIMIT_BYTES) {
        child.kill();
        finish({ ok: false, error: { code: 'VOICE_OUTPUT_LIMIT', message: 'Локальный модуль речи превысил допустимый объём ответа.' } });
        return;
      }
      if (capture) stdout += chunk.toString('utf8');
    };

    child.stdout.on('data', (chunk) => consume(chunk, true));
    child.stderr.on('data', (chunk) => consume(chunk, false));
    child.on('error', () => {
      finish({ ok: false, error: { code: 'VOICE_UNAVAILABLE', message: 'Локальное распознавание речи недоступно.' } });
    });
    child.on('close', () => finish(parseVoicePayload(stdout)));
  });
}

ipcMain.handle(VOICE_LISTEN_CHANNEL, async (event, ...args) => {
  if (!isTrustedOperatorSender(event)) {
    return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'IPC sender is not trusted' } };
  }
  if (args.length !== 0) {
    return { ok: false, error: { code: 'VOICE_INPUT_REJECTED', message: 'Голосовой канал не принимает параметры.' } };
  }
  if (voiceListenInFlight) {
    return { ok: false, error: { code: 'VOICE_BUSY', message: 'Распознавание уже выполняется.' } };
  }
  if (liveVoiceManager?.isActive()) {
    return { ok: false, error: { code: 'VOICE_LIVE_ACTIVE', message: 'Живой разговор уже использует микрофон.' } };
  }

  const now = Date.now();
  if (now - voiceLastStartedAt < VOICE_RATE_LIMIT_MS) {
    return { ok: false, error: { code: 'VOICE_RATE_LIMITED', message: 'Подождите секунду перед повторным запуском.' } };
  }

  voiceListenInFlight = true;
  voiceLastStartedAt = now;
  try {
    return await runLocalVoiceRecognition();
  } finally {
    voiceListenInFlight = false;
  }
});

function registerVoiceControl(channel, action) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedOperatorSender(event)) {
      return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'IPC sender is not trusted' } };
    }
    if (args.length !== 0) {
      return { ok: false, error: { code: 'VOICE_INPUT_REJECTED', message: 'Голосовой канал не принимает параметры.' } };
    }
    if (action === 'start' && voiceListenInFlight) {
      return { ok: false, error: { code: 'VOICE_BUSY', message: 'Дождитесь завершения текущего распознавания.' } };
    }
    return ensureLiveVoiceManager()[action]();
  });
}

registerVoiceControl(VOICE_LIVE_START_CHANNEL, 'start');
registerVoiceControl(VOICE_LIVE_STOP_CHANNEL, 'stop');
registerVoiceControl(VOICE_LIVE_PAUSE_CHANNEL, 'pause');
registerVoiceControl(VOICE_LIVE_RESUME_CHANNEL, 'resume');

function normalizeTtsText(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/\s+/g, ' ').trim();
}

async function runPiperSynthesis(text) {
  let temporaryOutput;
  try {
    temporaryOutput = await prepareEphemeralTtsFile(eclipseAiRuntimeRoot);
  } catch {
    return { ok: false, error: { code: 'TTS_UNAVAILABLE', message: 'Не удалось подготовить локальный голос на диске E:.' } };
  }

  try {
    return await new Promise((resolve) => {
      let stderrBytes = 0;
      let settled = false;
      let terminalError = null;
      let killFallbackId = null;
      const child = spawn(piperTtsExecutable, [
        '--model', piperTtsModelRelative,
        '--espeak_data', path.join('.', 'espeak-ng-data'),
        '--output_file', temporaryOutput.filePath,
        '--length_scale', '0.94',
        '--sentence_silence', '0.12',
        '--quiet',
      ], {
        cwd: piperTtsDirectory,
        windowsHide: true,
        shell: false,
        stdio: ['pipe', 'ignore', 'pipe'],
      });
      piperTtsProcess = child;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        if (killFallbackId) clearTimeout(killFallbackId);
        if (piperTtsProcess === child) piperTtsProcess = null;
        resolve(result);
      };
      const timeoutId = setTimeout(() => {
        terminalError = { ok: false, error: { code: 'TTS_TIMEOUT', message: 'Быстрый локальный голос не успел ответить.' } };
        child.kill();
        killFallbackId = setTimeout(() => finish(terminalError), 1_000);
      }, PIPER_TTS_TIMEOUT_MS);

      child.stderr.on('data', (chunk) => {
        stderrBytes += chunk.length;
        if (stderrBytes > 4 * 1024 && !terminalError) {
          terminalError = { ok: false, error: { code: 'TTS_OUTPUT_LIMIT', message: 'Локальный голос превысил лимит диагностики.' } };
          child.kill();
        }
      });
      child.once('error', () => {
        finish({ ok: false, error: { code: 'TTS_UNAVAILABLE', message: 'Быстрый локальный голос недоступен.' } });
      });
      child.once('close', async (code) => {
        if (settled) return;
        if (terminalError) {
          finish(terminalError);
          return;
        }
        if (code !== 0) {
          finish({ ok: false, error: { code: 'TTS_INVALID_AUDIO', message: 'Локальный голос не сформировал аудио.' } });
          return;
        }
        try {
          const wav = await readBoundedPcmWav(temporaryOutput.filePath, PIPER_TTS_OUTPUT_LIMIT_BYTES);
          if (!wav) {
            finish({ ok: false, error: { code: 'TTS_INVALID_AUDIO', message: 'Локальный голос вернул некорректное аудио.' } });
            return;
          }
          finish({ ok: true, audio: new Uint8Array(wav), engine: 'piper-denis-medium' });
        } catch {
          finish({ ok: false, error: { code: 'TTS_INVALID_AUDIO', message: 'Не удалось прочитать локальное аудио.' } });
        }
      });

      child.stdin.on('error', () => {});
      child.stdin.end(`${text}\n`, 'utf8');
    });
  } catch {
    return { ok: false, error: { code: 'TTS_UNAVAILABLE', message: 'Быстрый локальный голос недоступен.' } };
  } finally {
    await removeEphemeralTtsFile(temporaryOutput.filePath);
  }
}

ipcMain.handle(VOICE_TTS_SYNTHESIZE_CHANNEL, async (event, ...args) => {
  if (!isTrustedOperatorSender(event)) {
    return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'IPC sender is not trusted' } };
  }
  if (args.length !== 1) {
    return { ok: false, error: { code: 'TTS_INPUT_REJECTED', message: 'Голосовой канал принимает только текст.' } };
  }
  const text = normalizeTtsText(args[0]);
  if (!text || text.length > PIPER_TTS_TEXT_LIMIT) {
    return { ok: false, error: { code: 'TTS_TEXT_LIMIT', message: 'Текст для голоса должен содержать от 1 до 400 символов.' } };
  }
  if (!existsSync(piperTtsExecutable)) {
    return { ok: false, error: { code: 'TTS_RUNTIME_MISSING', message: 'Piper runtime не найден на диске E:.' } };
  }
  if (piperTtsProcess) {
    return { ok: false, error: { code: 'TTS_BUSY', message: 'Локальный голос уже формирует реплику.' } };
  }
  const now = Date.now();
  if (now - piperTtsLastStartedAt < PIPER_TTS_RATE_LIMIT_MS) {
    return { ok: false, error: { code: 'TTS_RATE_LIMITED', message: 'Следующая реплика запускается слишком быстро.' } };
  }
  piperTtsLastStartedAt = now;
  return runPiperSynthesis(text);
});

ipcMain.handle(VOICE_TTS_STOP_CHANNEL, (event, ...args) => {
  if (!isTrustedOperatorSender(event) || args.length !== 0) return false;
  if (piperTtsProcess && !piperTtsProcess.killed) piperTtsProcess.kill();
  piperTtsProcess = null;
  return true;
});

Menu.setApplicationMenu(null);

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: 'Eclipse Ultron',
    backgroundColor: '#050507',
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#050507',
      symbolColor: '#C7CDD6',
      height: 40,
    },
    icon: windowIconPath,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (target.protocol === 'https:') void shell.openExternal(target.href);
    } catch {
      // Invalid and non-HTTPS URLs stay closed.
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  // Voice devices stay fail-closed until the dedicated hardware/dependency
  // audit can bind permission to an explicit operator action.
  win.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  win.once('ready-to-show', () => win.show());

  // Minimize to tray instead of closing
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:3939');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function refreshTrayMenu() {
  if (!tray) return;
  const liveActive = Boolean(liveVoiceManager?.isActive());
  tray.setToolTip(liveActive ? 'Eclipse Ultron · микрофон включён' : 'Eclipse Ultron');
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Открыть', click: () => { win.show(); win.focus(); } },
    {
      label: liveActive ? 'Остановить живой разговор' : 'Включить живой разговор',
      click: () => {
        const manager = ensureLiveVoiceManager();
        if (manager.isActive()) manager.stop(); else manager.start();
      },
    },
    { type: 'separator' },
    { label: 'Выход', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
}

function createTray() {
  const icon = nativeImage.createFromPath(windowIconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  refreshTrayMenu();
  tray.on('click', () => { win.show(); win.focus(); });
}

app.whenReady().then(() => {
  void pruneStaleTtsFiles(piperTtsTempDirectory).catch(() => {});
  createWindow();
  createTray();
  void warmPrimaryVoiceModel();
  void ensureLabOllamaServer();

  // Global hotkey: Ctrl+Shift+S to toggle window
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Don't quit — stay in tray
  }
});

app.on('activate', () => {
  if (win) { win.show(); win.focus(); }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  liveVoiceManager?.dispose();
  liveVoiceManager = null;
  if (piperTtsProcess && !piperTtsProcess.killed) piperTtsProcess.kill();
  piperTtsProcess = null;
  if (labOllamaProcess && !labOllamaProcess.killed) {
    labOllamaProcess.kill();
    labOllamaProcess = null;
  }
  void officeRuntimePromise.then((runtime) => {
    if (runtime) runtime.dispose();
  }).catch(() => {});
});
