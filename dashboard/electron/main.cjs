const { app, BrowserWindow, shell, Menu, Tray, globalShortcut, nativeImage, dialog } = require('electron');
const path = require('path');
const { existsSync, mkdirSync } = require('fs');
const { ipcMain } = require('electron');
const { pathToFileURL } = require('url');
const { UltronLiveVoiceManager } = require('./ultron-live-voice.cjs');
const { createPrimaryVoiceRuntime, createLabOllamaRuntime } = require('./primary-voice-runtime.cjs');
const { terminateOwnedProcessTree } = require('./owned-process.cjs');
const { createLocalModelsRuntime, validateRequest } = require('./local-models-runtime.cjs');
const localModelRuntime = createLocalModelsRuntime({ terminate: terminateOwnedProcessTree });
const { createDeveloperModeRuntime } = require('./developer-mode-runtime.cjs');
const { collectRuntimeDiagnostics } = require('./runtime-diagnostics.cjs');
const { publicTtsFailure } = require('./voice-tts-errors.cjs');
const { createTaskLedgerRuntime } = require('./task-ledger-runtime.cjs');
const { createSshTaskTransport } = require('./task-ledger-transport.cjs');
const {
  applyDeveloperProposal,
  approveDeveloperProposal,
  createDeveloperProposal,
  createRollbackPreview,
  executeRollback,
  openDeveloperWorkspace,
  prepareDeveloperContext,
  publicProposal,
} = require('./developer-mode-policy.cjs');
const {
  approveVoiceAction,
  createVoiceActionPreview,
  createVoiceActionReceipt,
} = require('./voice-action-policy.cjs');

// The desktop product was renamed to Eclipse Ultron, but the existing local
// Chromium profile remains the stable data boundary for sessions and settings.
// Set it before app readiness so an upgrade never creates an empty parallel profile.
app.setPath('userData', path.join(app.getPath('appData'), 'Eclipse Sentinel'));

// A second desktop instance would own a second tray, microphone manager and
// helper lifecycle. Fail closed before app readiness and focus the existing
// window instead of starting another local runtime.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.exit(0);

const isDev = !app.isPackaged;
let win = null;
let tray = null;
let safeOperatorExecutor = null;
let liveVoiceManager = null;
let pendingVoiceActionPreview = null;
let voiceActionLastExecutedAt = 0;
const EXECUTE_CHANNEL = 'sentinel:operator:execute';
const VOICE_LISTEN_CHANNEL = 'sentinel:voice:listen-once';
const VOICE_LISTEN_CANCEL_CHANNEL = 'sentinel:voice:listen-cancel';
const VOICE_MODEL_ENSURE_CHANNEL = 'sentinel:voice:ensure-model';
const VOICE_MODEL_CANCEL_CHANNEL = 'sentinel:voice:cancel-model';
const VOICE_LIVE_START_CHANNEL = 'sentinel:voice:live-start';
const VOICE_LIVE_STOP_CHANNEL = 'sentinel:voice:live-stop';
const VOICE_LIVE_PAUSE_CHANNEL = 'sentinel:voice:live-pause';
const VOICE_LIVE_RESUME_CHANNEL = 'sentinel:voice:live-resume';
const VOICE_LIVE_STATUS_CHANNEL = 'sentinel:voice:live-status';
const VOICE_LIVE_CONTROL_EVENT = 'sentinel:voice:live-control';
const VOICE_TTS_SYNTHESIZE_CHANNEL = 'sentinel:voice:tts-synthesize';
const VOICE_TTS_STOP_CHANNEL = 'sentinel:voice:tts-stop';
const VOICE_TTS_PREVIEW_CHANNEL = 'sentinel:voice:tts-preview';
const VOICE_ACTION_PREVIEW_CHANNEL = 'sentinel:voice:action-preview';
const VOICE_ACTION_EXECUTE_CHANNEL = 'sentinel:voice:action-execute';
const VOICE_ACTION_CANCEL_CHANNEL = 'sentinel:voice:action-cancel';
const DEVELOPER_SELECT_CHANNEL = 'sentinel:developer:select-workspace';
const DEVELOPER_PROPOSE_CHANNEL = 'sentinel:developer:propose';
const DEVELOPER_CANCEL_CHANNEL = 'sentinel:developer:cancel';
const DEVELOPER_APPLY_CHANNEL = 'sentinel:developer:apply';
const DEVELOPER_ROLLBACK_PREVIEW_CHANNEL = 'sentinel:developer:rollback-preview';
const DEVELOPER_ROLLBACK_CHANNEL = 'sentinel:developer:rollback';
const DIAGNOSTICS_COLLECT_CHANNEL = 'sentinel:diagnostics:collect';
const VOICE_RATE_LIMIT_MS = 1_500;
const VOICE_ACTION_RATE_LIMIT_MS = 1_000;
let voiceListenInFlight = false;
let cancelVoiceListen = null;
let voiceLastStartedAt = 0;
let developerWorkspace = null;
let developerProposal = null;
let developerApplied = null;
let developerRollbackPreview = null;
let developerInFlight = false;
let developerLastStartedAt = 0;
let diagnosticsInFlight = null;
let diagnosticsLastResult = null;
let diagnosticsLastCheckedAt = 0;
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

const eclipseProgramsRoot = isDev
  ? path.join(path.parse(__dirname).root, 'ADMIN_HOPSON_PC', 'Программы')
  : path.dirname(path.dirname(process.execPath));
const eclipseAiRuntimeRoot = process.env.ECLIPSE_AI_RUNTIME_DIR
  ? path.resolve(process.env.ECLIPSE_AI_RUNTIME_DIR)
  : path.join(eclipseProgramsRoot, 'Eclipse AI Runtime');
const ultronCacheRoot = path.join(eclipseAiRuntimeRoot, 'cache', 'ultron');
try {
  const chromiumCache = path.join(ultronCacheRoot, 'chromium');
  const logs = path.join(eclipseAiRuntimeRoot, 'logs', 'ultron');
  mkdirSync(chromiumCache, { recursive: true });
  mkdirSync(logs, { recursive: true });
  app.commandLine.appendSwitch('disk-cache-dir', chromiumCache);
  app.setPath('logs', logs);
} catch {
  // A read-only or missing E: remains recoverable: Electron uses its standard
  // profile paths and diagnostics reports the storage problem to the operator.
}
const labOllamaExecutable = path.join(eclipseAiRuntimeRoot, 'ollama', 'ollama.exe');
const labOllamaModels = path.join(eclipseAiRuntimeRoot, 'models', 'ollama');
// Both profiles use the reviewed E-first store. A stale user environment
// variable must never redirect the desktop app back to C: or a legacy model
// directory; the renderer has no way to override this path.
const primaryOllamaModels = labOllamaModels;
const ollamaConsoleHost = isDev
  ? path.resolve(__dirname, '../build/UltronOllamaHost.exe')
  : path.join(process.resourcesPath, 'runtime-host', 'UltronOllamaHost.exe');
const labOllamaRuntime = createLabOllamaRuntime({ executable: labOllamaExecutable, modelsPath: labOllamaModels, consoleHost: ollamaConsoleHost });
const developerModeRuntime = createDeveloperModeRuntime();
const primaryVoiceRuntime = createPrimaryVoiceRuntime({
  executable: labOllamaExecutable,
  modelsPath: primaryOllamaModels,
  consoleHost: ollamaConsoleHost,
  onProgress: snapshot => sendVoiceEvent('sentinel:voice:model-progress', snapshot),
});

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
      terminateProcessTree: terminateOwnedProcessTree,
    });
  }
  return liveVoiceManager;
}

function isTrustedOperatorSender(event) {
  if (!win || event.sender !== win.webContents || !event.senderFrame) return false;
  if (event.senderFrame !== win.webContents.mainFrame) return false;
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

async function runLocalVoiceRecognition() {
  const manager = ensureLiveVoiceManager();
  const cancel = () => manager.finishOnce({ ok: false,
    error: { code: 'VOICE_CANCELLED', message: 'Распознавание остановлено.' },
  });
  cancelVoiceListen = cancel;
  try {
    return await manager.listenOnce();
  } finally {
    if (cancelVoiceListen === cancel) cancelVoiceListen = null;
  }
}

const taskLedger = createTaskLedgerRuntime({
  transport: createSshTaskTransport(),
  confirm: async (request) => {
    if (!win || win.isDestroyed()) return false;
    const labels = { propose: 'Предложить задачу', accept: 'Принять в план', pause: 'Приостановить план', resume: 'Вернуть в план', complete: 'Отметить выполненной', cancel: 'Отменить задачу' };
    const label = labels[request.kind === 'propose' ? 'propose' : request.action];
    const result = await dialog.showMessageBox(win, {
      type: 'question', title: 'Журнал задач AI Hub',
      message: `${label}?`,
      detail: `${request.projectId}: ${request.task?.title ?? request.title}\n\nИзменится только запись в журнале. Команды, голосовой режим и развёртывание не запускаются.${request.action === 'complete' ? `\n\nПодтверждение владельца: ${request.evidenceNote}` : ''}`,
      buttons: ['Не менять', label], defaultId: 0, cancelId: 0, noLink: true,
    });
    return result.response === 1;
  },
});

function isTrustedTaskSender(event) {
  if (!isTrustedOperatorSender(event)) return false;
  if (isDev) return true;
  try {
    const url = new URL(event.senderFrame.url);
    url.search = ''; url.hash = '';
    return url.href === pathToFileURL(path.resolve(__dirname, '../dist/index.html')).href;
  } catch { return false; }
}

ipcMain.handle('sentinel:tasks:activate', (event, ...args) => {
  if (!isTrustedTaskSender(event) || args.length !== 1) return { ok: false, error: 'forbidden' };
  return taskLedger.activate(args[0]);
});
ipcMain.handle('sentinel:tasks:request', (event, ...args) => {
  if (!isTrustedTaskSender(event) || args.length !== 1) return { ok: false, error: 'forbidden' };
  return taskLedger.request(args[0]);
});
ipcMain.handle('sentinel:tasks:close', (event, ...args) => {
  if (!isTrustedTaskSender(event) || args.length !== 1) return false;
  taskLedger.close(args[0]); return true;
});

ipcMain.handle(VOICE_MODEL_ENSURE_CHANNEL, async (event, ...args) => {
  if (!isTrustedOperatorSender(event) || args.length !== 0) {
    return { ok: false, error: { code: 'VOICE_INPUT_REJECTED', message: 'Проверка модели доступна только в основном окне без параметров.' } };
  }
  if (developerInFlight || localModelRuntime.status().busy) return { ok: false, error: { code: 'VOICE_RESOURCE_BUSY', message: 'Developer Mode использует локальную модель. Дождитесь завершения proposal.' } };
  return primaryVoiceRuntime.prepare();
});

ipcMain.handle(VOICE_MODEL_CANCEL_CHANNEL, async (event, ...args) => {
  if (!isTrustedOperatorSender(event) || args.length !== 0) return false;
  await primaryVoiceRuntime.cancelPreparation();
  return true;
});

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
  if (developerInFlight || localModelRuntime.status().busy) {
    return { ok: false, error: { code: 'VOICE_RESOURCE_BUSY', message: 'Developer Mode использует ресурсы. Дождитесь завершения proposal.' } };
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

ipcMain.handle(VOICE_LISTEN_CANCEL_CHANNEL, (event, ...args) => {
  if (!isTrustedOperatorSender(event) || args.length !== 0) return false;
  if (!cancelVoiceListen) return false;
  cancelVoiceListen();
  return true;
});

function registerVoiceControl(channel, action) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedOperatorSender(event)) {
      return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'IPC sender is not trusted' } };
    }
    if (args.length !== 0) {
      return { ok: false, error: { code: 'VOICE_INPUT_REJECTED', message: 'Голосовой канал не принимает параметры.' } };
    }
    if (action === 'start' && voiceListenInFlight) {
      return { ok: false, error: { code: 'VOICE_BUSY', message: 'Дождитесь завершения текущего распознавания.' } };
    }
    if (action === 'start' && (developerInFlight || localModelRuntime.status().busy)) {
      return { ok: false, error: { code: 'VOICE_RESOURCE_BUSY', message: 'Developer Mode использует ресурсы. Дождитесь завершения proposal.' } };
    }
    const manager = ensureLiveVoiceManager();
    const result = manager[action]();
    if (action !== 'stop') return result;
    void primaryVoiceRuntime.cancelPreparation();
    await manager.whenStopped;
    return manager.isActive()
      ? { ok: false, active: true, state: 'stopping', error: { code: 'VOICE_STOP_FAILED', message: 'Остановка микрофона не подтверждена. Повторите остановку или закройте Альтрона.' } }
      : { ok: true, active: false, state: 'idle' };
  });
}

registerVoiceControl(VOICE_LIVE_START_CHANNEL, 'start');
registerVoiceControl(VOICE_LIVE_STOP_CHANNEL, 'stop');
registerVoiceControl(VOICE_LIVE_PAUSE_CHANNEL, 'pause');
registerVoiceControl(VOICE_LIVE_RESUME_CHANNEL, 'resume');

ipcMain.handle(VOICE_LIVE_STATUS_CHANNEL, (event, ...args) => {
  if (!isTrustedOperatorSender(event) || args.length !== 0) {
    return { ok: false, active: false, state: 'idle', error: { code: 'VOICE_INPUT_REJECTED', message: 'Статус голоса доступен только в основном окне.' } };
  }
  const active = Boolean(liveVoiceManager?.isActive() && !voiceListenInFlight);
  return { ok: true, active, state: active ? liveVoiceManager.state : 'idle' };
});

let ultronTtsRuntime = null;
let ultronTtsLoading = null;
let ultronTtsInFlight = false;
let ultronSpeechGeneration = 0;
let ultronPreviewLastStarted = 0;

function stopUltronActivity(source = 'manual') {
  void localModelRuntime.cancel();
  void primaryVoiceRuntime.cancelPreparation();
  sendVoiceEvent(VOICE_LIVE_CONTROL_EVENT, {
    action: source === 'emergency' ? 'emergency-stop' : 'stop',
    source,
  });
  pendingVoiceActionPreview = null;
  liveVoiceManager?.stop();
  cancelVoiceListen?.();
  ultronSpeechGeneration += 1;
  void ultronTtsRuntime?.stop();
  developerModeRuntime.cancel();
  refreshTrayMenu();
}

const ultronVoiceHelperRoot = isDev
  ? path.resolve(__dirname, '../../scripts/voice-runtime')
  : path.join(process.resourcesPath, 'voice-runtime');

async function ensureUltronTts() {
  if (ultronTtsRuntime) return ultronTtsRuntime;
  if (!ultronTtsLoading) {
    ultronTtsLoading = (async () => {
      const { readRuntimeConfig } = await import(pathToFileURL(path.join(ultronVoiceHelperRoot, 'runtime.mjs')).href);
      const { createFastUltronTts } = await import(pathToFileURL(path.join(ultronVoiceHelperRoot, 'piper-runtime.mjs')).href);
      const config = await readRuntimeConfig(path.join(eclipseAiRuntimeRoot, 'tts', 'ultron', 'runtime.json'));
      const runtime = createFastUltronTts({
        runtimeRoot: eclipseAiRuntimeRoot,
        ffmpeg: config.ffmpeg,
        sandboxHost: config.sandboxHost,
      });
      ultronTtsRuntime = runtime;
      return runtime;
    })().finally(() => { ultronTtsLoading = null; });
  }
  return ultronTtsLoading;
}

ipcMain.handle(VOICE_TTS_SYNTHESIZE_CHANNEL, async (event, ...args) => {
  if (!isTrustedOperatorSender(event)) {
    return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'IPC sender is not trusted' } };
  }
  if (args.length !== 1 || typeof args[0] !== 'string' || !args[0].trim()
    || [...args[0]].length > 240 || /\p{C}/u.test(args[0]) || args[0].includes('<|') || args[0].includes('|>')) {
    return { ok: false, error: { code: 'TTS_INPUT_REJECTED', message: 'Для озвучки нужен текст до 240 символов без служебных команд.' } };
  }
  if (developerInFlight || localModelRuntime.status().busy) return { ok: false, error: { code: 'TTS_RESOURCE_BUSY', message: 'Developer Mode использует CPU. Озвучка доступна после завершения proposal.' } };
  if (ultronTtsInFlight) return { ok: false, error: { code: 'TTS_BUSY', message: 'Альтрон уже готовит голос.' } };
  ultronTtsInFlight = true;
  const generation = ultronSpeechGeneration;
  try {
    const runtime = await ensureUltronTts();
    if (generation !== ultronSpeechGeneration) return { ok: false, error: { code: 'TTS_CANCELLED', message: 'Озвучка остановлена.' } };
    return await runtime.synthesize(args[0].trim());
  } catch (error) {
    return publicTtsFailure(error);
  } finally {
    ultronTtsInFlight = false;
  }
});

ipcMain.handle(VOICE_TTS_PREVIEW_CHANNEL, async (event, ...args) => {
  if (!isTrustedOperatorSender(event) || args.length !== 0) return { ok: false, error: { code: 'PREVIEW_INPUT_REJECTED', message: 'Предпросмотр доступен только в основном окне.' } };
  if (developerInFlight || voiceListenInFlight || liveVoiceManager?.isActive()) {
    return { ok: false, error: { code: 'PREVIEW_RESOURCE_BUSY', message: 'Остановите живой разговор перед проверкой голоса.' } };
  }
  if (ultronTtsInFlight) return { ok: false, error: { code: 'TTS_BUSY', message: 'Альтрон уже готовит голос.' } };
  const now = Date.now();
  if (now - ultronPreviewLastStarted < 1_000) return { ok: false, error: { code: 'PREVIEW_RATE_LIMITED', message: 'Подождите секунду перед повторной проверкой.' } };
  ultronPreviewLastStarted = now;
  ultronTtsInFlight = true;
  const generation = ultronSpeechGeneration;
  try {
    const runtime = await ensureUltronTts();
    if (generation !== ultronSpeechGeneration) return { ok: false, error: { code: 'TTS_CANCELLED', message: 'Проверка голоса остановлена.' } };
    return await runtime.synthesize('Альтрон на связи. Голосовой контур готов.');
  } catch (error) { return publicTtsFailure(error); }
  finally { ultronTtsInFlight = false; }
});

ipcMain.handle(VOICE_TTS_STOP_CHANNEL, async (event, ...args) => {
  if (!isTrustedOperatorSender(event) || args.length !== 0) return false;
  ultronSpeechGeneration += 1;
  await ultronTtsRuntime?.stop();
  return true;
});

function developerFailure(error) {
  const code = typeof error?.code === 'string' && error.code.startsWith('DEVELOPER_') ? error.code : 'DEVELOPER_FAILED';
  const message = code === 'DEVELOPER_FAILED' ? 'Developer Mode остановлен безопасно. Проверьте задачу и повторите.' : error.message;
  return { ok: false, error: { code, message } };
}

function developerResourcesBusy() {
  return localModelRuntime.status().busy || voiceListenInFlight || ultronTtsInFlight || primaryVoiceRuntime.isPreparing() || Boolean(liveVoiceManager?.isActive());
}

ipcMain.handle(DIAGNOSTICS_COLLECT_CHANNEL, async (event, ...args) => {
  if (!isTrustedOperatorSender(event) || args.length !== 0) {
    return { ok: false, error: { code: 'DIAGNOSTICS_INPUT_REJECTED', message: 'Диагностика доступна только в основном окне.' } };
  }
  if (diagnosticsInFlight) return diagnosticsInFlight;
  if (diagnosticsLastResult && Date.now() - diagnosticsLastCheckedAt < 1_000) {
    return { ok: true, diagnostics: diagnosticsLastResult };
  }
  diagnosticsInFlight = collectRuntimeDiagnostics({
    runtimeRoot: eclipseAiRuntimeRoot,
    modelsPath: primaryOllamaModels,
    consoleHost: ollamaConsoleHost,
    voiceActive: voiceListenInFlight || Boolean(liveVoiceManager?.isActive()),
    developerActive: developerInFlight,
    ttsActive: ultronTtsInFlight,
  }).then((diagnostics) => {
    diagnosticsLastResult = diagnostics;
    diagnosticsLastCheckedAt = Date.now();
    return { ok: true, diagnostics };
  }).catch(() => ({
    ok: false,
    error: { code: 'DIAGNOSTICS_FAILED', message: 'Не удалось собрать локальную диагностику. Никакие процессы не запускались.' },
  })).finally(() => { diagnosticsInFlight = null; });
  return diagnosticsInFlight;
});

ipcMain.handle(DEVELOPER_SELECT_CHANNEL, async (event, ...args) => {
  if (!isTrustedOperatorSender(event) || args.length !== 0) return developerFailure(Object.assign(new Error('Недоверенный IPC-запрос.'), { code: 'DEVELOPER_INPUT_REJECTED' }));
  if (developerInFlight || localModelRuntime.status().busy) return developerFailure(Object.assign(new Error('Дождитесь завершения текущего proposal.'), { code: 'DEVELOPER_BUSY' }));
  const selection = await dialog.showOpenDialog(win, {
    title: 'Выберите Git-репозиторий для read-only анализа',
    buttonLabel: 'Выбрать репозиторий',
    properties: ['openDirectory', 'dontAddToRecent'],
  });
  if (selection.canceled || selection.filePaths.length !== 1) return { ok: false, canceled: true };
  try {
    developerWorkspace = await openDeveloperWorkspace(selection.filePaths[0]);
    developerProposal = null;
    developerApplied = null;
    developerRollbackPreview = null;
    return { ok: true, workspace: { id: developerWorkspace.workspaceId, name: developerWorkspace.name,
      files: developerWorkspace.files.length, truncated: developerWorkspace.truncated, openedAt: developerWorkspace.openedAt } };
  } catch (error) { return developerFailure(error); }
});

ipcMain.handle(DEVELOPER_PROPOSE_CHANNEL, async (event, ...args) => {
  if (!isTrustedOperatorSender(event) || args.length !== 1 || typeof args[0] !== 'object' || args[0] === null
    || Array.isArray(args[0]) || Object.keys(args[0]).length !== 1 || typeof args[0].task !== 'string') {
    return developerFailure(Object.assign(new Error('Задача не прошла проверку.'), { code: 'DEVELOPER_INPUT_REJECTED' }));
  }
  if (!developerWorkspace) return developerFailure(Object.assign(new Error('Сначала выберите Git-репозиторий.'), { code: 'DEVELOPER_WORKSPACE_REQUIRED' }));
  if (developerResourcesBusy()) return developerFailure(Object.assign(new Error('Остановите живой голос и дождитесь завершения озвучки: Developer Mode не делит ресурсы с медиаконтуром.'), { code: 'DEVELOPER_RESOURCE_BUSY' }));
  if (developerInFlight || localModelRuntime.status().busy) return developerFailure(Object.assign(new Error('Developer Mode уже формирует proposal.'), { code: 'DEVELOPER_BUSY' }));
  const now = Date.now();
  if (now - developerLastStartedAt < 2_000) return developerFailure(Object.assign(new Error('Подождите две секунды перед повторным запуском.'), { code: 'DEVELOPER_RATE_LIMITED' }));
  developerInFlight = true;
  developerLastStartedAt = now;
  developerProposal = null;
  try {
    const service = await labOllamaRuntime.ensure();
    if (!service.ok) throw Object.assign(new Error(service.error?.message || 'Lab Ollama недоступен.'), { code: 'DEVELOPER_MODEL_OFFLINE' });
    const context = await prepareDeveloperContext(developerWorkspace, args[0].task);
    const generated = await developerModeRuntime.propose(context);
    developerProposal = createDeveloperProposal(developerWorkspace, context, generated.content);
    return { ok: true, model: generated.model, proposal: publicProposal(developerProposal) };
  } catch (error) { return developerFailure(error); }
  finally {
    developerInFlight = false;
    labOllamaRuntime.stopOwned();
  }
});

ipcMain.handle(DEVELOPER_CANCEL_CHANNEL, (event, ...args) => {
  if (!isTrustedOperatorSender(event) || args.length !== 0) return false;
  return developerModeRuntime.cancel();
});

ipcMain.handle(DEVELOPER_APPLY_CHANNEL, async (event, ...args) => {
  if (!isTrustedOperatorSender(event) || args.length !== 1 || !approveDeveloperProposal(developerProposal, args[0])) {
    developerProposal = null;
    return developerFailure(Object.assign(new Error('Preview истёк, изменился или не был подтверждён.'), { code: 'DEVELOPER_APPROVAL_INVALID' }));
  }
  const approved = developerProposal;
  developerProposal = null;
  try {
    developerApplied = await applyDeveloperProposal(developerWorkspace, approved);
    developerRollbackPreview = null;
    return { ok: true, receipt: developerApplied.receipt };
  } catch (error) { return developerFailure(error); }
});

ipcMain.handle(DEVELOPER_ROLLBACK_PREVIEW_CHANNEL, (event, ...args) => {
  if (!isTrustedOperatorSender(event) || args.length !== 0 || !developerApplied) {
    return developerFailure(Object.assign(new Error('Для текущей сессии нет доступного отката.'), { code: 'DEVELOPER_ROLLBACK_UNAVAILABLE' }));
  }
  try {
    developerRollbackPreview = createRollbackPreview(developerApplied.rollback);
    return { ok: true, preview: developerRollbackPreview };
  }
  catch (error) { return developerFailure(error); }
});

ipcMain.handle(DEVELOPER_ROLLBACK_CHANNEL, async (event, ...args) => {
  if (!isTrustedOperatorSender(event) || args.length !== 1 || !developerApplied || !developerRollbackPreview) {
    return developerFailure(Object.assign(new Error('Подтверждение отката недействительно.'), { code: 'DEVELOPER_ROLLBACK_INVALID' }));
  }
  try {
    const preview = developerRollbackPreview;
    developerRollbackPreview = null;
    const receipt = await executeRollback(developerWorkspace, developerApplied.rollback, preview, args[0]);
    developerApplied = null;
    return { ok: true, receipt };
  } catch (error) { return developerFailure(error); }
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
    taskLedger.dispose();
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
    taskLedger.dispose();
    if (!app.isQuitting) {
      e.preventDefault();
      stopUltronActivity('window-close');
      win.hide();
    }
  });
  win.webContents.on('did-start-navigation', (_event, _url, _isInPlace, isMainFrame) => {
    if (isMainFrame) taskLedger.dispose();
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
        if (manager.isActive()) {
          stopUltronActivity('tray');
          return;
        }
        if (voiceListenInFlight || developerInFlight || manager.stopping) {
          win.show(); win.focus();
          return;
        }
        sendVoiceEvent(VOICE_LIVE_CONTROL_EVENT, { action: 'start', source: 'tray' });
        const result = manager.start();
        if (!result.ok) {
          sendVoiceEvent('sentinel:voice:live-state', {
            state: 'error',
            detail: result.error?.message || 'Не удалось включить живой разговор.',
          });
        }
      },
    },
    {
      label: 'Аварийно остановить Альтрона',
      click: () => {
        stopUltronActivity('emergency');
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

if (hasSingleInstanceLock) app.whenReady().then(() => {
  createWindow();
  createTray();

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

app.on('second-instance', () => {
  if (!hasSingleInstanceLock || !win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
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
  taskLedger.dispose();
  globalShortcut.unregisterAll();
  cancelVoiceListen?.();
  primaryVoiceRuntime.dispose();
  liveVoiceManager?.dispose();
  liveVoiceManager = null;
  ultronSpeechGeneration += 1;
  ultronTtsRuntime?.stop();
  labOllamaRuntime.dispose();
  void officeRuntimePromise.then((runtime) => {
    if (runtime) runtime.dispose();
  }).catch(() => {});
});

// Separate local model Lab. Renderer cannot supply executable, path, URL or tool authority.
ipcMain.handle('sentinel:local-models:status', (event,...args) => {
  if (!isTrustedOperatorSender(event) || args.length !== 0) return {ok:false};
  return localModelRuntime.status();
});
ipcMain.handle('sentinel:local-models:cancel', (event,...args) => {
  if (!isTrustedOperatorSender(event) || args.length !== 0) return {ok:false};
  return localModelRuntime.cancel();
});
ipcMain.handle('sentinel:local-models:run', async (event,...args) => {
  if (!isTrustedOperatorSender(event) || args.length !== 1) return {ok:false,error:{code:'INVALID_REQUEST'}};
  if (localModelRuntime.status().busy) return {ok:false,error:{code:'BUSY'}};
  if (developerInFlight || developerResourcesBusy()) return {ok:false,error:{code:'RESOURCE_BUSY'}};
  try {
    const request=validateRequest(args[0]);
    if(request.image){
      const image=nativeImage.createFromDataURL(request.image);
      const {width,height}=image.getSize();
      if(image.isEmpty() || width>4096 || height>4096 || width*height>16000000) return {ok:false,error:{code:'INVALID_IMAGE'}};
    }
    return await localModelRuntime.run(request);
  } catch(error) { return {ok:false,error:{code:error.code||'INVALID_REQUEST'}}; }
});
app.on('will-quit',()=>void localModelRuntime.dispose());
