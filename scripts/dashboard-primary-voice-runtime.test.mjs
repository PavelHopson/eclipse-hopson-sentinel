import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createPrimaryVoiceRuntime, createLabOllamaRuntime, buildPrimaryEnvironment } = require('../dashboard/electron/primary-voice-runtime.cjs');
const ready = () => new Response(JSON.stringify({ models: [{ name: 'qwen3:8b' }] }));
const offline = () => { throw new Error('private upstream details'); };
const fixture = (options = {}, factory = createPrimaryVoiceRuntime) => {
  const spawned = [];
  const child = new EventEmitter();
  child.killed = false;
  child.kill = () => { child.killed = true; };
  child.unref = () => { child.unreferenced = true; };
  const runtime = factory({
    executable: new URL('../dashboard/node_modules/ollama.exe', import.meta.url).pathname,
    consoleHost: new URL('../reports/test-host.exe', import.meta.url).pathname,
    modelsPath: new URL('../reports/test-models', import.meta.url).pathname,
    environment: { PATH: 'trusted-path', OPENAI_API_KEY: 'must-not-leak', OLLAMA_HOST: 'evil.invalid:80' },
    fileExists: () => true, wait: async () => {},
    spawnProcess: (...args) => { spawned.push(args); return child; }, ...options,
  });
  return { runtime, spawned, child };
};

const digest = 'a'.repeat(64);
function preparationFixture({ owned = true, ...options } = {}) {
  let first = owned, clock = 0;
  const calls = [], events = [];
  const state = { digest, context: 2048, resident: true, fail: false };
  const base = fixture({ now: () => clock, onProgress: event => events.push(event), ...options,
    fetchImpl: async (url, request) => {
      calls.push(url);
      clock += 7;
      if (first) { first = false; throw new Error('offline'); }
      if (state.fail) throw new Error('private-payload');
      if (url.endsWith('/api/tags')) return new Response(JSON.stringify({ models: [{ name: 'qwen3:8b', digest: state.digest }] }));
      if (url.endsWith('/api/ps')) return new Response(JSON.stringify({ models: state.resident ? [{
        name: 'qwen3:8b', digest: state.digest, context_length: state.context,
        expires_at: new Date(Date.now() + 300000).toISOString(),
      }] : [] }));
      return new Response(JSON.stringify({ model: 'qwen3:8b', done: true, message: { content: 'готов' } }));
    },
  });
  return { ...base, calls, events, state, advance: ms => { clock += ms; } };
}

test('owned ready prepare reuses only the same resident digest/context and exposes bounded timing', async () => {
  const f = preparationFixture();
  assert.equal((await f.runtime.prepare()).ok, true);
  assert.equal((await f.runtime.prepare()).ok, true);
  assert.equal(f.calls.filter(url => url.endsWith('/api/generate')).length, 1);
  assert.equal(f.calls.filter(url => url.endsWith('/api/chat')).length, 1);
  const report = f.runtime.getPreparationStatus();
  assert.equal(report.stage, 'ready');
  assert.equal(report.reused, true);
  assert.ok(report.timings.totalMs >= report.timings.probeMs);
  assert.deepEqual(Object.keys(report.timings).sort(), ['launchMs', 'preloadMs', 'probeMs', 'totalMs', 'warmupMs']);
  assert.doesNotMatch(JSON.stringify(f.events), /private-payload|ready\.gguf|messages|digest|prompt/);
  f.runtime.dispose();
});

test('ready lease expires and Stop, digest/context change, error and process exit invalidate reuse', async () => {
  for (const invalidate of [f => f.advance(31000), f => f.runtime.cancelPreparation(),
    f => { f.state.digest = 'b'.repeat(64); }, f => { f.state.context = 4096; },
    f => { f.state.resident = false; }, f => { f.child.emit('exit', 0); }]) {
    const f = preparationFixture();
    await f.runtime.prepare(); await invalidate(f); await f.runtime.prepare();
    assert.equal(f.calls.filter(url => url.endsWith('/api/generate')).length, 2);
    f.runtime.dispose();
  }
  const f = preparationFixture(); await f.runtime.prepare();
  f.state.fail = true; assert.equal((await f.runtime.prepare()).ok, false);
  f.state.fail = false; f.advance(2000); await f.runtime.prepare();
  assert.equal(f.calls.filter(url => url.endsWith('/api/generate')).length, 2);
  f.runtime.dispose();
});

test('pre-existing unowned runtime never receives a ready lease', async () => {
  const f = preparationFixture({ owned: false });
  await f.runtime.prepare(); await f.runtime.prepare();
  assert.equal(f.calls.filter(url => url.endsWith('/api/generate')).length, 2);
  f.runtime.dispose();
});

test('cancel stays cancelling until late warmup settles; retry cannot resurrect ready', async () => {
  let release;
  const f = fixture({ fetchImpl: async url => {
    if (url.endsWith('/api/tags')) return ready();
    if (url.endsWith('/api/chat')) return new Promise(resolve => { release = resolve; });
    return new Response(JSON.stringify({ model: 'qwen3:8b', done: true }));
  } });
  const pending = f.runtime.prepare();
  await new Promise(resolve => setImmediate(resolve));
  const stopping = f.runtime.cancelPreparation();
  assert.equal(f.runtime.cancelPreparation(), stopping, 'concurrent Stop shares one acknowledgement');
  assert.equal(f.runtime.getPreparationStatus().stage, 'cancelling');
  assert.equal((await f.runtime.prepare()).error.code, 'VOICE_MODEL_CANCELLED');
  release(new Response(JSON.stringify({ model: 'qwen3:8b', done: true, message: { content: 'late' } })));
  await stopping;
  assert.equal((await pending).error.code, 'VOICE_MODEL_CANCELLED');
  assert.equal(f.runtime.getPreparationStatus().stage, 'idle');
  f.runtime.dispose();
});

test('UI preserves cancellation until backend acknowledgement instead of clearing checkingModel eagerly', async () => {
  const source = await readFile(new URL('../dashboard/src/components/UltronVoiceConversation.tsx', import.meta.url), 'utf8');
  assert.match(source, /await cancelVoiceModel\(\)/);
  assert.match(source, /Останавливаю подготовку/);
  assert.doesNotMatch(source, /Первый запуск читает веса/);
});

test('first prepare is single-flight with separate monotonic stages and no sliding lease', async () => {
  const f = preparationFixture();
  const first = f.runtime.prepare(); assert.equal(f.runtime.prepare(), first);
  await first;
  const report = f.runtime.getPreparationStatus();
  assert.ok(report.timings.probeMs > 0);
  assert.ok(report.timings.preloadMs > 0);
  assert.ok(report.timings.warmupMs > 0);
  assert.equal(report.timings.totalMs, report.timings.launchMs + report.timings.probeMs + report.timings.preloadMs + report.timings.warmupMs);
  assert.deepEqual([...new Set(f.events.map(e => e.stage))], ['probe', 'preload', 'warmup', 'ready']);
  f.advance(20000); await f.runtime.prepare(); assert.equal(f.runtime.getPreparationStatus().reused, true);
  f.advance(11000); await f.runtime.prepare(); assert.equal(f.runtime.getPreparationStatus().reused, false);
  f.runtime.dispose();
});

test('startup deadline is an error, not user cancellation, and manual retry can recover', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let healthy = false;
  const f = fixture({ fetchImpl: async (_url, { signal }) => {
    if (healthy) return ready();
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('private')), { once: true }));
  } });
  try {
    const pending = f.runtime.prepare();
    await new Promise(resolve => setImmediate(resolve));
    context.mock.timers.tick(30001);
    const result = await pending;
    assert.equal(result.error.code, 'VOICE_MODEL_STARTUP_TIMEOUT');
    assert.equal(f.runtime.getPreparationStatus().stage, 'error');
    assert.equal(f.runtime.getPreparationStatus().failedStage, 'probe');
    assert.equal(f.spawned.length, 0);
    healthy = true;
    assert.equal((await f.runtime.ensure()).ok, true);
  } finally { f.runtime.dispose(); }
});

test('explicit startup cancellation remains cancellation, not a timeout', async () => {
  const f = fixture({ fetchImpl: async (_url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('private')), { once: true });
  }) });
  try {
    const pending = f.runtime.prepare();
    await new Promise(resolve => setImmediate(resolve));
    await f.runtime.cancelPreparation();
    assert.equal((await pending).error.code, 'VOICE_MODEL_CANCELLED');
    assert.equal(f.runtime.getPreparationStatus().stage, 'idle');
    assert.equal(f.spawned.length, 0);
  } finally { f.runtime.dispose(); }
});

test('warmup timeout fails closed and error retry performs fresh preparation', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  context.mock.method(AbortSignal, 'timeout', ms => {
    const controller = new AbortController(); setTimeout(() => controller.abort(), ms); return controller.signal;
  });
  let hang = true, warmups = 0;
  const f = fixture({ fetchImpl: async (url, { signal }) => {
    if (url.endsWith('/api/tags')) return ready();
    if (url.endsWith('/api/chat')) {
      warmups++;
      if (hang) return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('secret')), { once: true }));
      return new Response(JSON.stringify({ model: 'qwen3:8b', done: true, message: { content: 'готов' } }));
    }
    return new Response(JSON.stringify({ model: 'qwen3:8b', done: true }));
  } });
  const pending = f.runtime.prepare(); await new Promise(resolve => setImmediate(resolve));
  context.mock.timers.tick(60001);
  assert.equal((await pending).error.code, 'VOICE_MODEL_PREPARATION_FAILED');
  assert.equal(f.runtime.getPreparationStatus().failedStage, 'warmup');
  assert.doesNotMatch(JSON.stringify(f.runtime.getPreparationStatus()), /secret/);
  hang = false; assert.equal((await f.runtime.prepare()).ok, true); assert.equal(warmups, 2);
  f.runtime.dispose();
});

test('progress IPC only exposes a fixed event without granting renderer-selected channels', async () => {
  const main = await readFile(new URL('../dashboard/electron/main.cjs', import.meta.url), 'utf8');
  const preload = await readFile(new URL('../dashboard/electron/preload.cjs', import.meta.url), 'utf8');
  assert.match(main, /onProgress: snapshot => sendVoiceEvent\('sentinel:voice:model-progress', snapshot\)/);
  assert.match(preload, /onModelProgress\(callback\) \{ return subscribeToLiveVoice\('sentinel:voice:model-progress', callback\); \}/);
  assert.match(main, /if \(!isTrustedOperatorSender\(event\) \|\| args.length !== 0\)/);
});

test('existing exact primary model requires no new process and is not stopped on dispose', async () => {
  const { runtime, spawned, child } = fixture({ fetchImpl: async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:11434/api/tags');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    return ready();
  } });
  assert.deepEqual(await runtime.ensure(), { ok: true, model: 'qwen3:8b' });
  runtime.dispose();
  assert.equal(spawned.length, 0);
  assert.equal(child.killed, false);
});

test('same-family 32b and Lab models cannot satisfy the 8b readiness check or trigger downloads', async () => {
  const { runtime, spawned } = fixture({ fetchImpl: async () => new Response(JSON.stringify({ models: [
    { name: 'qwen3:32b' }, { name: 'huihui_ai/qwen3.8-abliterated:27b' },
  ] })) });
  assert.equal((await runtime.ensure()).error.code, 'VOICE_MODEL_MISSING');
  assert.equal(spawned.length, 0);
});

test('concurrent requests start only one fixed loopback server with primary cache and no keys', async () => {
  let probes = 0;
  const { runtime, spawned, child } = fixture({ fetchImpl: async () => ++probes === 1 ? offline() : ready() });
  const first = runtime.ensure();
  assert.equal(first, runtime.ensure());
  assert.equal((await first).ok, true);
  assert.equal(spawned.length, 1);
  const [executable, args, options] = spawned[0];
  assert.equal(executable, new URL(process.platform === 'win32' ? '../reports/test-host.exe' : '../dashboard/node_modules/ollama.exe', import.meta.url).pathname);
  assert.deepEqual(args, process.platform === 'win32' ? [new URL('../dashboard/node_modules/ollama.exe', import.meta.url).pathname] : ['serve']);
  assert.equal(options.env.OLLAMA_HOST, '127.0.0.1:11434');
  assert.ok(options.env.OLLAMA_MODELS.endsWith('/reports/test-models'));
  assert.equal(options.env.OPENAI_API_KEY, undefined);
  assert.equal(options.shell, false);
  assert.equal(options.windowsHide, true);
  assert.equal(options.stdio, 'ignore');
  assert.equal(options.detached, true);
  assert.equal(child.unreferenced, true);
  runtime.dispose();
  assert.equal(child.killed, false);
});

test('primary startup tolerates a slow Windows cold start without launching a second server', async () => {
  let probes = 0;
  const { runtime, spawned } = fixture({
    fetchImpl: async () => ++probes < 14 ? offline() : ready(),
  });
  assert.deepEqual(await runtime.ensure(), { ok: true, model: 'qwen3:8b' });
  assert.equal(probes, 14);
  assert.equal(spawned.length, 1);
  runtime.dispose();
});

test('missing runtime/cache fails closed, with no download or raw error leakage', async () => {
  const { runtime, spawned } = fixture({ fetchImpl: offline, fileExists: () => false });
  const result = await runtime.ensure();
  assert.equal(result.error.code, 'VOICE_RUNTIME_MISSING');
  assert.doesNotMatch(JSON.stringify(result), /private upstream/);
  assert.equal(spawned.length, 0);
});

test('HTTP errors, malformed and oversized service responses never launch a competing server', async () => {
  for (const response of [new Response('', { status: 500 }), new Response('not json'),
    new Response('a'.repeat(2 * 1024 * 1024 + 1))]) {
    const { runtime, spawned } = fixture({ fetchImpl: async () => response });
    assert.equal((await runtime.ensure()).ok, false);
    assert.equal(spawned.length, 0);
  }
});

test('failed startup is bounded, cooldown limits retries and a later retry can recover', async () => {
  let clock = 0;
  let healthy = false;
  let probes = 0;
  const { runtime, spawned } = fixture({ now: () => clock, fetchImpl: async () => {
    probes += 1;
    return healthy ? ready() : offline();
  } });
  assert.equal((await runtime.ensure()).ok, false);
  assert.equal(probes, 121);
  await runtime.ensure();
  assert.equal(probes, 121);
  clock = 2000;
  healthy = true;
  assert.equal((await runtime.ensure()).ok, true);
  assert.equal(spawned.length, 1);
  runtime.dispose();
});

test('dispose during async probing prevents a late process launch', async () => {
  let release;
  const { runtime, spawned } = fixture({ fetchImpl: () => new Promise((_, reject) => { release = reject; }) });
  const pending = runtime.ensure();
  runtime.dispose();
  release(new Error('offline'));
  assert.equal((await pending).ok, false);
  assert.equal(spawned.length, 0);
});

test('spawn failure is handled and host/proxy/plugin environment cannot cross the boundary', async () => {
  const { runtime } = fixture({ fetchImpl: offline, spawnProcess: () => { throw new Error('private path'); } });
  assert.equal((await runtime.ensure()).ok, false);
  const env = buildPrimaryEnvironment({ Path: 'ok', SystemRoot: 'win', ANTHROPIC_API_KEY: 'secret',
    NODE_OPTIONS: '--require evil', HTTP_PROXY: 'remote', OLLAMA_ORIGINS: '*', OLLAMA_MODELS: 'lab' }, '/primary');
  assert.deepEqual(Object.keys(env).sort(), ['Path', 'SystemRoot', 'OLLAMA_HOST', 'OLLAMA_MODELS', 'OLLAMA_KEEP_ALIVE', 'OLLAMA_LOAD_TIMEOUT'].sort());
  assert.equal(env.OLLAMA_MODELS, '/primary');
});

test('recovery IPC is no-argument, main-frame-only; startup never activates the microphone', async () => {
  const main = await readFile(new URL('../dashboard/electron/main.cjs', import.meta.url), 'utf8');
  const preload = await readFile(new URL('../dashboard/electron/preload.cjs', import.meta.url), 'utf8');
  assert.match(main, /ipcMain.handle\(VOICE_MODEL_ENSURE_CHANNEL, async \(event, \.\.\.args\) => \{\s*if \(!isTrustedOperatorSender\(event\) \|\| args.length !== 0\)/);
  assert.match(main, /event.senderFrame !== win.webContents.mainFrame/);
  assert.match(preload, /ensureModel\(\) \{\s*return ipcRenderer.invoke\(VOICE_MODEL_ENSURE_CHANNEL\);/);
  const startup = main.split('app.whenReady().then')[1].split("app.on('window-all-closed'")[0];
  assert.doesNotMatch(startup, /startLive|listenOnce|runLocalVoiceRecognition|\.start\(/);
});

test('Lab uses the same persistent boundary with its own catalog, port and sanitized environment', async () => {
  let probes = 0;
  const { runtime, spawned, child } = fixture({ fetchImpl: async url => {
    assert.equal(url, 'http://127.0.0.1:11435/api/tags');
    if (++probes === 1) return offline();
    return new Response(JSON.stringify({ models: [{ name: 'lab-only' }] }));
  }, environment: { SystemRoot: 'win', OPENAI_API_KEY: 'secret', OLLAMA_ORIGINS: '*',
    HTTP_PROXY: 'remote', OLLAMA_HOST: '0.0.0.0:11434', NODE_OPTIONS: '--require evil' } }, createLabOllamaRuntime);
  assert.deepEqual(await runtime.ensure(), { ok: true });
  const options = spawned[0][2];
  assert.deepEqual(options.env, { SystemRoot: 'win', OLLAMA_HOST: '127.0.0.1:11435',
    OLLAMA_MODELS: new URL('../reports/test-models', import.meta.url).pathname,
    OLLAMA_KEEP_ALIVE: '0', OLLAMA_LOAD_TIMEOUT: '15m' });
  assert.equal(options.detached, true);
  assert.equal(options.stdio, 'ignore');
  runtime.dispose();
  runtime.dispose();
  assert.equal(child.killed, false);
  assert.equal((await runtime.ensure()).ok, false);
});

test('Lab can stop only the server instance it started; a pre-existing endpoint is never killed', async () => {
  let probes = 0;
  const owned = fixture({ fetchImpl: async () => ++probes === 1 ? offline() : new Response(JSON.stringify({ models: [] })) }, createLabOllamaRuntime);
  assert.equal((await owned.runtime.ensure()).ok, true);
  assert.equal(owned.runtime.stopOwned(), true);
  assert.equal(owned.child.killed, true);
  const external = fixture({ fetchImpl: async () => new Response(JSON.stringify({ models: [] })) }, createLabOllamaRuntime);
  assert.equal((await external.runtime.ensure()).ok, true);
  assert.equal(external.runtime.stopOwned(), false);
  assert.equal(external.child.killed, false);
});

test('dispose during service startup releases ownership without killing or late duplicate launch', async () => {
  let resume;
  const { runtime, spawned, child } = fixture({ fetchImpl: offline,
    wait: () => new Promise(resolve => { resume = resolve; }) });
  const pending = runtime.ensure();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(spawned.length, 1);
  runtime.dispose();
  resume();
  assert.equal((await pending).ok, false);
  assert.equal(child.killed, false);
  assert.equal(child.unreferenced, true);
  assert.equal(spawned.length, 1);
});

test('Lab never launches over a responding invalid service or reuses the primary port', async () => {
  for (const response of [new Response('invalid'), new Response('', { status: 500 }),
    new Response('x'.repeat(2 * 1024 * 1024 + 1))]) {
    const { runtime, spawned } = fixture({ role: 'primary', fetchImpl: async url => {
      assert.match(url, /:11435\/api\/tags$/);
      return response;
    } }, createLabOllamaRuntime);
    assert.equal((await runtime.ensure()).ok, false);
    assert.equal(spawned.length, 0);
    runtime.dispose();
  }
});

test('installer refuses active Ultron instead of killing it or its model processes', async () => {
  const source = await readFile(new URL('../dashboard/build/installer.nsh', import.meta.url), 'utf8');
  const guard = source.split('!macro customCheckAppRunning')[1].split('!macroend')[0];
  assert.match(guard, /nsProcess::_FindProcess/);
  assert.match(guard, /SetErrorLevel 4/);
  assert.match(guard, /SetErrorLevel 5/);
  assert.doesNotMatch(guard, /taskkill|Stop-Process|_KillProcess|KILL_PROCESS/i);
});

test('a late successful startup probe cannot acknowledge readiness after dispose', async () => {
  let probes = 0, release;
  const { runtime, child } = fixture({ fetchImpl: () => {
    if (++probes === 1) return Promise.reject(new Error('offline'));
    return new Promise(resolve => { release = resolve; });
  } });
  const pending = runtime.ensure();
  await new Promise(resolve => setImmediate(resolve));
  runtime.dispose();
  release(ready());
  assert.equal((await pending).ok, false);
  assert.equal(child.killed, false);
});

test('installer verifies existing private RX access before attempting an ACL mutation', async () => {
  const source = await readFile(new URL('../dashboard/build/installer.nsh', import.meta.url), 'utf8');
  const install = source.split('!macro customInstall')[1].split('!macroend')[0];
  assert.ok(install.indexOf('!insertmacro verifyVoiceAccess') < install.indexOf('icacls.exe'));
  assert.equal(install.match(/!insertmacro verifyVoiceAccess/g).length, 2);
  assert.match(install, /SetErrorLevel 6/);
  assert.doesNotMatch(source, /ExecutionPolicy\s+Bypass|takeown|SetOwner/i);
  const checker = await readFile(new URL('../dashboard/build/verify-voice-acl.ps1', import.meta.url), 'utf8');
  assert.match(checker, /ReparsePoint/);
  assert.match(checker, /ReadAndExecute/);
  assert.match(checker, /Deny/);
  assert.doesNotMatch(checker, /Set-Acl|icacls|WriteAll|Set-Content|Invoke-WebRequest/i);
});

test('preparation is single-flight and survives the measured slow Windows cold read', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  let release;
  const { runtime } = fixture({ fetchImpl: async (url, options) => {
    calls.push([url, options]);
    if (url.endsWith('/api/tags')) return ready();
    if (url.endsWith('/api/chat')) return new Response(JSON.stringify({ model: 'qwen3:8b', done: true, message: { content: 'Готов' } }));
    return new Promise(resolve => { release = resolve; });
  } });
  const pending = runtime.prepare();
  assert.equal(runtime.prepare(), pending);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runtime.isPreparing(), true);
  context.mock.timers.tick(175_000);
  assert.equal(calls[1][1].signal.aborted, false, 'model load must not consume the 30-second reply deadline');
  assert.equal(calls[1][0], 'http://127.0.0.1:11434/api/generate');
  assert.equal(calls[1][1].redirect, 'error');
  assert.deepEqual(JSON.parse(calls[1][1].body), { model: 'qwen3:8b', stream: false, think: false,
    keep_alive: '5m', options: { num_ctx: 2048 } });
  release(new Response(JSON.stringify({ model: 'qwen3:8b', done: true })));
  assert.deepEqual(await pending, { ok: true, model: 'qwen3:8b' });
  const warmup = JSON.parse(calls[2][1].body);
  assert.equal(warmup.model, 'qwen3:8b');
  assert.equal(warmup.options.num_predict, 2);
  assert.equal(warmup.options.num_ctx, 2048);
  assert.equal(warmup.think, false);
  assert.equal(warmup.tools, undefined);
  assert.match(warmup.messages[0].content, /Техническая проверка/);
  assert.equal(runtime.isPreparing(), false);
  runtime.dispose();
});

test('tensor preload alone cannot advertise readiness when the first decode fails', async () => {
  for (const body of ['invalid', '{"model":"qwen3:8b","done":true,"message":{"content":""}}',
    '{"model":"wrong-model","done":true,"message":{"content":"ready"}}']) {
    const { runtime } = fixture({ fetchImpl: async url => url.endsWith('/api/tags') ? ready()
      : new Response(url.endsWith('/api/chat') ? body : '{"model":"qwen3:8b","done":true}') });
    assert.equal((await runtime.prepare()).error.code, 'VOICE_MODEL_PREPARATION_FAILED');
    runtime.dispose();
  }
});

test('cancel during preflight prevents late spawn; cancel during preload aborts only that request', async () => {
  let release;
  const first = fixture({ fetchImpl: () => new Promise(resolve => { release = resolve; }) });
  const early = first.runtime.prepare();
  const cancelledEarly = first.runtime.cancelPreparation();
  release(ready());
  await cancelledEarly;
  assert.equal((await early).error.code, 'VOICE_MODEL_CANCELLED');
  assert.equal(first.spawned.length, 0);
  let signal;
  const second = fixture({ fetchImpl: async (url, options) => {
    if (url.endsWith('/api/tags')) return ready();
    signal = options.signal;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('abort')), { once: true }));
  } });
  const late = second.runtime.prepare();
  await new Promise(resolve => setImmediate(resolve));
  await second.runtime.cancelPreparation();
  assert.equal(signal.aborted, true);
  assert.equal((await late).error.code, 'VOICE_MODEL_CANCELLED');
  assert.equal(second.child.killed, false);
  assert.equal(second.runtime.isPreparing(), false);
});

test('model preparation expires after four minutes without retrying or leaking upstream payloads', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let requests = 0;
  const { runtime } = fixture({ fetchImpl: async (url, { signal }) => {
    requests++;
    if (url.endsWith('/api/tags')) return ready();
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('sensitive-payload')), { once: true }));
  } });
  const pending = runtime.prepare();
  await new Promise(resolve => setImmediate(resolve));
  context.mock.timers.tick(240_001);
  const result = await pending;
  assert.equal(result.error.code, 'VOICE_MODEL_PREPARATION_FAILED');
  assert.doesNotMatch(JSON.stringify(result), /sensitive-payload/);
  assert.equal(requests, 2);
});

test('invalid, oversized or wrong-model preload replies never acknowledge readiness', async () => {
  for (const body of ['invalid', 'x'.repeat(16385), '{"done":true,"model":"qwen3:32b"}', '{"model":"qwen3:8b"}']) {
    const { runtime } = fixture({ fetchImpl: async url => url.endsWith('/api/tags') ? ready() : new Response(body) });
    assert.equal((await runtime.prepare()).ok, false);
    runtime.dispose();
  }
});

test('preload cancellation IPC is trusted, parameter-free and busy guards include preparation', async () => {
  const source = await readFile(new URL('../dashboard/electron/main.cjs', import.meta.url), 'utf8');
  assert.match(source, /ipcMain.handle\(VOICE_MODEL_CANCEL_CHANNEL, async \(event, \.\.\.args\) => \{\s*if \(!isTrustedOperatorSender\(event\) \|\| args.length !== 0\)/);
  assert.match(source, /return primaryVoiceRuntime.prepare\(\)/);
  assert.match(source, /function developerResourcesBusy\(\) \{[^}]*primaryVoiceRuntime.isPreparing\(\)/);
});
