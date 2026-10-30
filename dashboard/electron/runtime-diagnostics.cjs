const { lstat, readFile, statfs } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const PRIMARY_MODEL = 'qwen3:8b';
const DEVELOPER_MODEL = 'hf.co/chimingw/Qwen3.8-27B-Uncensored-OrcaRouter-GGUF:Q4_K_M';
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const LOOPBACK_ENDPOINTS = Object.freeze({
  primaryTags: 'http://127.0.0.1:11434/api/tags',
  labProcesses: 'http://127.0.0.1:11435/api/ps',
});

const item = (id, label, state, detail) => ({ id, label, state, detail });

async function isRegularFile(filename, minimumBytes = 1) {
  try {
    const info = await lstat(filename);
    return info.isFile() && !info.isSymbolicLink() && info.size >= minimumBytes;
  } catch {
    return false;
  }
}

async function isExactRegularFile(filename, expectedBytes) {
  try {
    const info = await lstat(filename);
    return info.isFile() && !info.isSymbolicLink() && info.size === expectedBytes;
  } catch {
    return false;
  }
}

async function readLoopbackJson(url, fetchImpl) {
  if (!Object.values(LOOPBACK_ENDPOINTS).includes(url)) return null;
  let response;
  try {
    response = await fetchImpl(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(1_200),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let body = '';
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_JSON_BYTES) return null;
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
      return JSON.parse(body);
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  } catch {
    return null;
  } finally {
    await response?.body?.cancel().catch(() => {});
  }
}

async function hasJsonConfig(filename) {
  if (!(await isRegularFile(filename, 2))) return false;
  try {
    const info = await lstat(filename);
    if (info.size > 64 * 1024) return false;
    const parsed = JSON.parse(await readFile(filename, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function modelNames(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.models)) return [];
  return payload.models.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const name = typeof entry.name === 'string' ? entry.name : typeof entry.model === 'string' ? entry.model : '';
    return name ? [name.slice(0, 240)] : [];
  }).slice(0, 128);
}

function hasModel(names, expected) {
  const exact = expected.toLocaleLowerCase('en-US');
  return names.some((name) => name.toLocaleLowerCase('en-US') === exact);
}

function manifestPaths(modelsPath) {
  return {
    primary: path.join(modelsPath, 'manifests', 'registry.ollama.ai', 'library', 'qwen3', '8b'),
    developer: path.join(modelsPath, 'manifests', 'hf.co', 'chimingw',
      'Qwen3.8-27B-Uncensored-OrcaRouter-GGUF', 'Q4_K_M'),
  };
}

async function collectRuntimeDiagnostics({
  runtimeRoot,
  modelsPath,
  consoleHost,
  voiceActive = false,
  developerActive = false,
  ttsActive = false,
  fetchImpl = globalThis.fetch,
  totalMemory = os.totalmem,
  freeMemory = os.freemem,
  statfsImpl = statfs,
  now = Date.now,
}) {
  const root = path.resolve(runtimeRoot);
  const models = path.resolve(modelsPath);
  const expectedDrive = `${path.parse(root).root}`.toLocaleUpperCase('en-US') === 'E:\\';
  const files = {
    ollama: path.join(root, 'ollama', 'ollama.exe'),
    whisper: path.join(root, 'whisper', 'Release', 'whisper-stream.exe'),
    whisperModel: path.join(root, 'models', 'whisper', 'ggml-large-v3-turbo-q5_0.bin'),
    ttsConfig: path.join(root, 'tts', 'ultron', 'runtime.json'),
    piper: path.join(root, 'tts', 'piper', 'runtime', 'piper', 'piper.exe'),
    piperModel: path.join(root, 'tts', 'piper', 'voices', 'ru', 'ru_RU', 'denis', 'medium', 'ru_RU-denis-medium.onnx'),
    piperConfig: path.join(root, 'tts', 'piper', 'voices', 'ru', 'ru_RU', 'denis', 'medium', 'ru_RU-denis-medium.onnx.json'),
  };
  const manifests = manifestPaths(models);
  const consoleHostReady = typeof consoleHost === 'string' && path.isAbsolute(consoleHost) && await isRegularFile(consoleHost, 1024);

  const [
    ollamaReady,
    whisperReady,
    whisperModelReady,
    ttsConfigReady,
    piperReady,
    piperModelReady,
    piperConfigReady,
    primaryManifest,
    developerManifest,
    primaryPayload,
    labPayload,
    disk,
  ] = await Promise.all([
    isRegularFile(files.ollama, 1024),
    isRegularFile(files.whisper, 1024),
    isRegularFile(files.whisperModel, 1024 * 1024),
    hasJsonConfig(files.ttsConfig),
    isExactRegularFile(files.piper, 509_952),
    isExactRegularFile(files.piperModel, 63_201_294),
    isExactRegularFile(files.piperConfig, 4_823),
    isRegularFile(manifests.primary, 2),
    isRegularFile(manifests.developer, 2),
    readLoopbackJson(LOOPBACK_ENDPOINTS.primaryTags, fetchImpl),
    readLoopbackJson(LOOPBACK_ENDPOINTS.labProcesses, fetchImpl),
    statfsImpl(root).catch(() => null),
  ]);

  const primaryNames = modelNames(primaryPayload);
  const labNames = modelNames(labPayload);
  const primaryInstalled = primaryManifest || hasModel(primaryNames, PRIMARY_MODEL);
  const developerInstalled = developerManifest || hasModel(labNames, DEVELOPER_MODEL);
  const labModelsLoaded = labNames.length;
  const diskFreeGiB = disk ? Number(((disk.bavail * disk.bsize) / (1024 ** 3)).toFixed(1)) : null;
  const memoryFreeGiB = Number((freeMemory() / (1024 ** 3)).toFixed(1));
  const memoryTotalGiB = Number((totalMemory() / (1024 ** 3)).toFixed(1));
  const runtimeFilesReady = ollamaReady && whisperReady && whisperModelReady;
  const ttsReady = ttsConfigReady && piperReady && piperModelReady && piperConfigReady;
  const resourceBusy = developerActive || ttsActive;

  const checks = [
    item('console-host', 'Безоконный запуск', consoleHostReady ? 'ready' : 'blocked',
      consoleHostReady ? 'GUI-лаунчер Ollama найден. Командные окна не используются для запуска сервиса.' : 'Безоконный лаунчер отсутствует или повреждён. Переустановите Альтрона.'),
    item('storage', 'E-first хранилище', expectedDrive && diskFreeGiB !== null && diskFreeGiB >= 10 ? 'ready' : 'warning',
      !expectedDrive ? 'Runtime расположен не на диске E:.' : diskFreeGiB === null ? 'Не удалось проверить свободное место.' : `${diskFreeGiB} ГиБ свободно на диске E:.`),
    item('microphone', 'Распознавание речи', runtimeFilesReady ? 'ready' : 'blocked',
      runtimeFilesReady ? 'Whisper и русская модель готовы. Сам микрофон проверяется только после вашего нажатия.' : 'Не найден Whisper runtime или русская модель на диске E:.'),
    item('tts', 'Голос Альтрона', ttsReady ? (ttsActive ? 'active' : 'ready') : 'blocked',
      ttsReady ? (ttsActive ? 'Сейчас готовится локальная озвучка.' : 'Pinned Piper и Ultron DSP готовы; сеть и GPU не используются.') : 'Конфигурация локального TTS отсутствует или повреждена.'),
    item('voice-model', 'Быстрый диалог · Qwen 3 8B', ollamaReady && primaryInstalled ? (primaryPayload ? 'ready' : 'idle') : 'blocked',
      !ollamaReady ? 'Portable Ollama не найден на диске E:.' : !primaryInstalled ? 'Модель Qwen 3 8B не найдена.' : primaryPayload ? 'Сервис отвечает локально на 127.0.0.1.' : 'Модель установлена; сервис спит до голосовой команды.'),
    item('developer-model', 'Разработка · Qwen3.8 27B', ollamaReady && developerInstalled ? (developerActive ? 'active' : 'ready') : 'blocked',
      !developerInstalled ? 'Проверенный 27B manifest не найден.' : developerActive ? 'Developer Mode использует CPU; голос и TTS временно заблокированы.' : 'Тяжёлая модель доступна только по запросу и не занимает GPU медиаплеера.'),
    item('media-guard', 'Защита видео и музыки', resourceBusy || labModelsLoaded > 0 ? 'warning' : 'ready',
      developerActive ? 'Идёт тяжёлый proposal. Не запускайте второй AI-процесс до завершения.' : ttsActive ? 'Идёт озвучка; новый тяжёлый proposal заблокирован.' : labModelsLoaded > 0 ? 'На Lab-порту осталась загруженная модель; завершите Developer Mode.' : '27B выгружена; голосовой и Developer-контуры не запускаются одновременно.'),
  ];

  const blocked = checks.filter((check) => check.state === 'blocked').length;
  const warnings = checks.filter((check) => check.state === 'warning').length;
  return {
    schemaVersion: 'eclipse.ultron.diagnostics.v1',
    overall: blocked > 0 ? 'blocked' : warnings > 0 ? 'attention' : 'ready',
    checkedAt: new Date(now()).toISOString(),
    checks,
    resources: {
      diskFreeGiB,
      memoryFreeGiB,
      memoryTotalGiB,
      labModelsLoaded,
      voiceActive: Boolean(voiceActive),
      developerActive: Boolean(developerActive),
    },
  };
}

module.exports = {
  DEVELOPER_MODEL,
  LOOPBACK_ENDPOINTS,
  PRIMARY_MODEL,
  collectRuntimeDiagnostics,
  manifestPaths,
};
