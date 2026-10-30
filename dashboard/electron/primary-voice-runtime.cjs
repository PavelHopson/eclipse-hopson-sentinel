const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const MODEL = 'qwen3:8b';
const SERVICES = Object.freeze({
  primary: { host: '127.0.0.1:11434', keepAlive: '5m', loadTimeout: '4m', model: MODEL, startAttempts: 120, startDelayMs: 250 },
  lab: { host: '127.0.0.1:11435', keepAlive: '0', loadTimeout: '15m', model: null, startAttempts: 40, startDelayMs: 500 },
});
const MAX_TAGS_BYTES = 2 * 1024 * 1024;
const SAFE_ENV = new Set(['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE',
  'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'APPDATA', 'PROGRAMFILES', 'PATH']);
const failure = (code, message) => ({ ok: false, error: { code, message } });
const unavailable = () => failure('VOICE_MODEL_OFFLINE', 'Не удалось запустить Ollama. Нажмите «Проверить модель», чтобы попробовать снова.');
const cancelled = () => failure('VOICE_MODEL_CANCELLED', 'Подготовка модели остановлена.');

function buildPrimaryEnvironment(source, modelsPath) {
  return buildServiceEnvironment(source, modelsPath, SERVICES.primary);
}

function buildServiceEnvironment(source, modelsPath, service) {
  const env = Object.fromEntries(Object.entries(source).filter(([key]) => SAFE_ENV.has(key.toUpperCase())));
  return { ...env, OLLAMA_HOST: service.host, OLLAMA_MODELS: modelsPath,
    OLLAMA_KEEP_ALIVE: service.keepAlive, OLLAMA_LOAD_TIMEOUT: service.loadTimeout };
}

// Paths are supplied only by the trusted main process. The renderer cannot pick
// an executable, host, model directory, download or command-line argument.
function createLocalOllamaRuntime({ executable, modelsPath, consoleHost, role, environment = process.env,
  spawnProcess = spawn, fileExists = existsSync, fetchImpl = globalThis.fetch,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = () => performance.now(), onProgress = () => {} }) {
  const service = SERVICES[role];
  let serviceProcess = null;
  let inFlight = null;
  let disposed = false;
  let lastResult = null;
  let lastCheckedAt = -Infinity;
  let startupController = null;
  let preparation = null;
  let preparationController = null;
  let cancellation = null;
  let readyLease = null;
  let modelDigest = null;
  let runId = 0;
  let report = { id: 0, stage: 'idle', elapsedMs: 0, reused: false, probeCount: 0,
    timings: { launchMs: 0, probeMs: 0, preloadMs: 0, warmupMs: 0, totalMs: 0 } };
  let started = 0;
  const milliseconds = value => Math.max(0, Math.min(3600000, Math.round(value)));
  function getPreparationStatus() {
    return { ...report, timings: { ...report.timings } };
  }
  function publish(stage) {
    report.stage = stage;
    if (preparationController) {
      report.elapsedMs = milliseconds(now() - started);
      report.timings.totalMs = report.elapsedMs;
    }
    try { onProgress(getPreparationStatus()); } catch { /* Observability cannot grant readiness. */ }
  }
  async function measure(stage, task) {
    const at = now(), launchBefore = report.timings.launchMs;
    if (report.stage !== 'cancelling') publish(stage);
    try { return await task(); }
    finally {
      const launch = stage === 'probe' ? report.timings.launchMs - launchBefore : 0;
      report.timings[`${stage}Ms`] += milliseconds(now() - at - launch);
    }
  }
  async function residentIdentity(signal) {
    let response;
    try {
      response = await fetchImpl(`http://${service.host}/api/ps`, {
        redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(1200)]),
      });
      if (!response.ok || !response.body) return false;
      const reader = response.body.getReader(); let bytes = 0, text = '';
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const part = await reader.read(); if (part.done) break;
          bytes += part.value.byteLength; if (bytes > MAX_TAGS_BYTES) return false;
          text += decoder.decode(part.value, { stream: true });
        }
        text += decoder.decode();
        const data = JSON.parse(text);
        return Array.isArray(data.models) && data.models.some(entry => entry.name === MODEL
          && entry.digest === modelDigest && /^[a-f0-9]{64}$/i.test(modelDigest || '')
          && entry.context_length === 2048 && Date.parse(entry.expires_at) > Date.now());
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    } catch { return false; }
    finally { await response?.body?.cancel().catch(() => {}); }
  }

  async function probe(signal) {
    if (preparationController) report.probeCount += 1;
    let response;
    try {
      response = await fetchImpl(`http://${service.host}/api/tags`, { signal: AbortSignal.any([signal, AbortSignal.timeout(1_200)]), redirect: 'error' });
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        return { reachable: true, result: failure('VOICE_MODEL_SERVICE', 'Локальный сервис Ollama отвечает с ошибкой. Проверьте его и повторите попытку.') };
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_TAGS_BYTES) throw new Error('LIMIT');
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      const data = JSON.parse(text);
      if (!Array.isArray(data.models)) throw new Error('INVALID');
      if (!service.model) return { reachable: true, result: { ok: true } };
      const installed = data.models.find((entry) => entry?.name === MODEL || entry?.model === MODEL);
      modelDigest = typeof installed?.digest === 'string' && /^[a-f0-9]{64}$/i.test(installed.digest) ? installed.digest : null;
      return { reachable: true, result: installed ? { ok: true, model: MODEL } : failure('VOICE_MODEL_MISSING',
        'Ollama работает, но Qwen 3 8B отсутствует в основном каталоге. Модели автоматически не скачиваются; проверьте настройку OLLAMA_MODELS.') };
    } catch {
      return { reachable: Boolean(response), result: unavailable() };
    }
  }

  async function startIfNeeded(signal) {
    const first = await probe(signal);
    if (disposed || signal.aborted) return cancelled();
    if (first.reachable) return first.result;
    if (!path.isAbsolute(executable) || !path.isAbsolute(modelsPath) || !fileExists(executable) || !fileExists(modelsPath)) {
      return failure('VOICE_RUNTIME_MISSING', 'Не найден установленный Ollama или основной каталог моделей. Проверьте локальную установку — загрузка автоматически не запускается.');
    }
    if (process.platform === 'win32' && (!consoleHost || !path.isAbsolute(consoleHost) || !fileExists(consoleHost))) {
      return failure('VOICE_HOST_MISSING', 'Безоконный лаунчер Ollama не найден. Переустановите приложение; запуск с мигающими окнами отключён.');
    }
    if (!serviceProcess) {
      try {
        const launchAt = now();
        const child = spawnProcess(process.platform === 'win32' ? consoleHost : executable,
          process.platform === 'win32' ? [executable] : ['serve'], {
          cwd: path.dirname(executable), env: buildServiceEnvironment(environment, modelsPath, service),
          windowsHide: true, shell: false, stdio: 'ignore', detached: true,
        });
        serviceProcess = child;
        if (preparationController) report.timings.launchMs += milliseconds(now() - launchAt);
        const clear = () => { if (serviceProcess === child) { serviceProcess = null; readyLease = null; } };
        child.once('error', clear);
        child.once('exit', clear);
        // Ollama is a persistent local service, not a window-owned inference job.
        // Ignore stdio + detached + unref let it survive a normal app exit.
        child.unref();
      } catch { return unavailable(); }
    }
    // Startup is separate from inference. One bounded, cancellable attempt only.
    for (let attempt = 0; attempt < service.startAttempts && !disposed; attempt += 1) {
      await wait(service.startDelayMs);
      if (disposed || signal.aborted) return cancelled();
      if (!serviceProcess) return unavailable();
      const checked = await probe(signal);
      if (disposed || signal.aborted) return cancelled();
      if (checked.reachable) return checked.result;
    }
    return unavailable();
  }

  function ensure() {
    if (disposed) return Promise.resolve(unavailable());
    if (inFlight) return inFlight;
    if (lastResult && now() - lastCheckedAt < 1_500) return Promise.resolve(lastResult);
    const controller = new AbortController();
    startupController = controller;
    let startupTimedOut = false;
    const timer = setTimeout(() => { startupTimedOut = true; controller.abort(); }, 30_000);
    const pending = startIfNeeded(controller.signal).catch(unavailable).then((result) => {
      // A deadline is not the user's Stop action: retain a visible, retryable
      // error instead of returning to idle with VOICE_MODEL_CANCELLED.
      if (startupTimedOut && !disposed) return failure('VOICE_MODEL_STARTUP_TIMEOUT',
        'Локальный сервис модели не ответил за 30 секунд. Повторите проверку. Код: VOICE_MODEL_STARTUP_TIMEOUT.');
      if (!controller.signal.aborted) {
        lastResult = result;
        lastCheckedAt = now();
      }
      return result;
    }).finally(() => {
      clearTimeout(timer);
      if (inFlight === pending) inFlight = null;
      if (startupController === controller) startupController = null;
    });
    inFlight = pending;
    return inFlight;
  }

  function prepare() {
    if (disposed || role !== 'primary') return Promise.resolve(unavailable());
    if (cancellation || preparationController?.signal.aborted) return Promise.resolve(cancelled());
    if (preparation) return preparation;
    const controller = new AbortController();
    preparationController = controller;
    started = now();
    report = { id: ++runId, stage: 'probe', elapsedMs: 0, reused: false, probeCount: 0,
      timings: { launchMs: 0, probeMs: 0, preloadMs: 0, warmupMs: 0, totalMs: 0 } };
    let timedOut = false;
    // A measured Windows cold read exceeded 120s (2026-09-12). This budget is
    // only for loading; generation still has its separate short deadlines.
    const timer = setTimeout(() => { timedOut = true; controller.abort(); startupController?.abort(); }, 240_000);
    const pending = (async () => {
      // A lease never trusts a UI flag, an unowned service or /api/tags alone.
      // It expires without sliding; every reuse rechecks the owned process,
      // manifest digest and actual resident model/context through fixed read-only APIs.
      const lease = readyLease;
      if (lease && lease.child === serviceProcess && !lease.child.killed && now() < lease.until) {
        const identity = await measure('probe', async () => {
          const checked = await probe(controller.signal);
          return checked.result.ok && modelDigest === lease.digest && await residentIdentity(controller.signal);
        });
        if (controller.signal.aborted || disposed) return cancelled();
        if (identity && readyLease === lease && serviceProcess === lease.child) {
          report.reused = true;
          return { ok: true, model: MODEL };
        }
        lastResult = null;
        lastCheckedAt = -Infinity;
      }
      readyLease = null;
      const serviceReady = await measure('probe', () => ensure());
      if (controller.signal.aborted || disposed) return cancelled();
      if (!serviceReady.ok) return serviceReady;
      // Official empty-request preload. No user text, downloads or tool access.
      // Match chat context size to avoid loading a second runner on the first reply.
      await measure('preload', async () => {
        const response = await fetchImpl(`http://${service.host}/api/generate`, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: MODEL, stream: false, think: false, keep_alive: '5m', options: { num_ctx: 2048 } }),
        });
        if (!response.ok || !response.body) {
          await response.body?.cancel();
          throw new Error('PRELOAD_FAILED');
        }
        const reader = response.body.getReader();
        let bytes = 0, text = '';
        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > 16_384) throw new Error('PRELOAD_LIMIT');
            text += decoder.decode(value, { stream: true });
          }
          text += decoder.decode();
          const data = JSON.parse(text);
          if (data.done !== true || data.model !== MODEL || data.error) throw new Error('PRELOAD_INVALID');
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
      });
      if (controller.signal.aborted || disposed) return cancelled();
      // Loading tensors does not exercise CUDA decoding. A measured first
      // reply stalled after successful preload. Warm both prefill and decoding
      // with two synthetic tokens, never a user's prompt, before reporting ready.
      await measure('warmup', async () => {
        const warmup = await fetchImpl(`http://${service.host}/api/chat`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: MODEL, stream: false, think: false, keep_alive: '5m',
            messages: [{ role: 'user', content: 'Техническая проверка. Ответь: готов.' }],
            options: { num_ctx: 2048, num_predict: 2, temperature: 0 },
          }),
        });
        if (!warmup.ok || !warmup.body) { await warmup.body?.cancel(); throw new Error('WARMUP_FAILED'); }
        const warmReader = warmup.body.getReader();
        let warmText = '', warmBytes = 0;
        const warmDecoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await warmReader.read();
            if (done) break;
            warmBytes += value.byteLength;
            if (warmBytes > 16_384) throw new Error('WARMUP_LIMIT');
            warmText += warmDecoder.decode(value, { stream: true });
          }
          warmText += warmDecoder.decode();
          const data = JSON.parse(warmText);
          if (data.done !== true || data.model !== MODEL || data.error || typeof data.message?.content !== 'string' || !data.message.content.trim()) throw new Error('WARMUP_INVALID');
        } finally { await warmReader.cancel().catch(() => {}); warmReader.releaseLock(); }
      });
      if (controller.signal.aborted || disposed) return cancelled();
      const owned = serviceProcess;
      if (owned && !owned.killed && modelDigest && await measure('probe', () => residentIdentity(controller.signal))) {
        if (owned === serviceProcess) readyLease = { child: owned, digest: modelDigest, until: now() + 30000 };
      }
      if (controller.signal.aborted || disposed) { readyLease = null; return cancelled(); }
      return { ok: true, model: MODEL };
    })().catch(() => controller.signal.aborted && !timedOut ? cancelled()
      : failure('VOICE_MODEL_PREPARATION_FAILED', 'Не удалось подготовить Qwen 3 8B. Нажмите «Проверить ответ» для новой попытки. Код: VOICE_MODEL_PREPARATION_FAILED.'))
      .then(result => {
        // A late provider success after cancellation never restores readiness.
        if (controller.signal.aborted || disposed) result = timedOut
          ? failure('VOICE_MODEL_PREPARATION_FAILED', 'Подготовка модели превысила лимит времени.') : cancelled();
        if (!result.ok) readyLease = null;
        report.failedStage = result.ok ? null : report.stage;
        publish(result.ok ? 'ready' : result.error.code === 'VOICE_MODEL_CANCELLED' ? 'idle' : 'error');
        return result;
      }).finally(() => {
        clearTimeout(timer);
        if (preparation === pending) preparation = null;
        if (preparationController === controller) preparationController = null;
      });
    preparation = pending;
    return pending;
  }

  function cancelPreparation() {
    readyLease = null;
    if (cancellation) return cancellation;
    if (preparation || inFlight) publish('cancelling');
    preparationController?.abort();
    startupController?.abort();
    lastResult = null;
    lastCheckedAt = -Infinity;
    // Never unload/kill an existing shared service. Abort only this request.
    const pending = (preparation || inFlight || Promise.resolve()).then(() => { publish('idle'); })
      .finally(() => { if (cancellation === pending) cancellation = null; });
    cancellation = pending;
    return pending;
  }

  function dispose() {
    readyLease = null;
    disposed = true;
    void cancelPreparation();
    // Closing/replacing the UI must never unload another client's model. There
    // is deliberately no kill/unload endpoint here, including for a service we started.
    serviceProcess = null;
  }

  function stopOwned() {
    readyLease = null;
    const owned = serviceProcess;
    serviceProcess = null;
    lastResult = null;
    lastCheckedAt = -Infinity;
    if (!owned || owned.killed) return false;
    try { return owned.kill() !== false; } catch { return false; }
  }
  return { ensure, prepare, cancelPreparation, getPreparationStatus, isPreparing: () => Boolean(preparation), dispose, stopOwned };
}

const createPrimaryVoiceRuntime = (options) => createLocalOllamaRuntime({ ...options, role: 'primary' });
const createLabOllamaRuntime = (options) => createLocalOllamaRuntime({ ...options, role: 'lab' });
module.exports = { createPrimaryVoiceRuntime, createLabOllamaRuntime, buildPrimaryEnvironment };
