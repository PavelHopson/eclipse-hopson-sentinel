import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, mkdir, open, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  LOOPBACK_ENDPOINTS,
  collectRuntimeDiagnostics,
  manifestPaths,
} = require('../dashboard/electron/runtime-diagnostics.cjs');

const fixtures = [];
after(async () => Promise.all(fixtures.map((root) => rm(root, { recursive: true, force: true }))));

async function prepareFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ultron-diagnostics-'));
  fixtures.push(root);
  const models = path.join(root, 'models', 'ollama');
  const files = [
    [path.join(root, 'host.exe'), Buffer.alloc(2048, 1)],
    [path.join(root, 'ollama', 'ollama.exe'), Buffer.alloc(2048, 1)],
    [path.join(root, 'whisper', 'Release', 'whisper-stream.exe'), Buffer.alloc(2048, 2)],
    [path.join(root, 'models', 'whisper', 'ggml-large-v3-turbo-q5_0.bin'), Buffer.alloc(1024 * 1024, 3)],
    [path.join(root, 'tts', 'ultron', 'runtime.json'), JSON.stringify({ engine: 'piper' })],
    [path.join(root, 'tts', 'piper', 'runtime', 'piper', 'piper.exe'), { size: 509_952 }],
    [path.join(root, 'tts', 'piper', 'voices', 'ru', 'ru_RU', 'denis', 'medium', 'ru_RU-denis-medium.onnx'), { size: 63_201_294 }],
    [path.join(root, 'tts', 'piper', 'voices', 'ru', 'ru_RU', 'denis', 'medium', 'ru_RU-denis-medium.onnx.json'), { size: 4_823 }],
    [manifestPaths(models).primary, '{}'],
    [manifestPaths(models).developer, '{}'],
  ];
  for (const [filename, content] of files) {
    await mkdir(path.dirname(filename), { recursive: true });
    if (content && typeof content === 'object' && 'size' in content) {
      const file = await open(filename, 'w');
      await file.truncate(content.size);
      await file.close();
    } else {
      await writeFile(filename, content);
    }
  }
  return { root, models };
}

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('diagnostics only probes fixed loopback endpoints and never starts a model', async () => {
  const { root, models } = await prepareFixture();
  const requested = [];
  const result = await collectRuntimeDiagnostics({
    runtimeRoot: root,
    modelsPath: models,
    consoleHost: path.join(root, 'host.exe'),
    fetchImpl: async (url) => {
      requested.push(url);
      return url === LOOPBACK_ENDPOINTS.primaryTags
        ? jsonResponse({ models: [{ name: 'qwen3:8b' }] })
        : jsonResponse({ models: [] });
    },
    statfsImpl: async () => ({ bavail: 40, bsize: 1024 ** 3 }),
    totalMemory: () => 64 * 1024 ** 3,
    freeMemory: () => 32 * 1024 ** 3,
    now: () => Date.UTC(2026, 7, 31),
  });

  assert.deepEqual(requested.sort(), Object.values(LOOPBACK_ENDPOINTS).sort());
  assert.equal(result.schemaVersion, 'eclipse.ultron.diagnostics.v1');
  assert.equal(result.resources.labModelsLoaded, 0);
  assert.equal(result.resources.memoryFreeGiB, 32);
  assert.equal(result.checks.find((entry) => entry.id === 'media-guard').state, 'ready');
  assert.equal(result.checks.find((entry) => entry.id === 'voice-model').state, 'ready');
  assert.equal(result.checks.find((entry) => entry.id === 'console-host').state, 'ready');
});

test('diagnostics reports a loaded lab model and active developer route without hiding the risk', async () => {
  const { root, models } = await prepareFixture();
  const result = await collectRuntimeDiagnostics({
    runtimeRoot: root,
    modelsPath: models,
    consoleHost: path.join(root, 'host.exe'),
    developerActive: true,
    fetchImpl: async (url) => url === LOOPBACK_ENDPOINTS.labProcesses
      ? jsonResponse({ models: [{ name: 'hf.co/chimingw/Qwen3.8-27B-Uncensored-OrcaRouter-GGUF:Q4_K_M' }] })
      : jsonResponse({ models: [{ name: 'qwen3:8b' }] }),
    statfsImpl: async () => ({ bavail: 40, bsize: 1024 ** 3 }),
  });

  assert.equal(result.resources.developerActive, true);
  assert.equal(result.resources.labModelsLoaded, 1);
  assert.equal(result.checks.find((entry) => entry.id === 'developer-model').state, 'active');
  assert.equal(result.checks.find((entry) => entry.id === 'media-guard').state, 'warning');
  assert.equal(result.overall, 'attention');
});

test('diagnostics fails closed when fixed runtime artifacts are absent', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ultron-diagnostics-empty-'));
  fixtures.push(root);
  const result = await collectRuntimeDiagnostics({
    runtimeRoot: root,
    modelsPath: path.join(root, 'models'),
    fetchImpl: async () => { throw new Error('offline'); },
    statfsImpl: async () => ({ bavail: 5, bsize: 1024 ** 3 }),
  });
  assert.equal(result.overall, 'blocked');
  assert.equal(result.checks.find((entry) => entry.id === 'microphone').state, 'blocked');
  assert.equal(result.checks.find((entry) => entry.id === 'tts').state, 'blocked');
  assert.equal(result.checks.find((entry) => entry.id === 'voice-model').state, 'blocked');
  assert.equal(result.checks.find((entry) => entry.id === 'console-host').state, 'blocked');
});
