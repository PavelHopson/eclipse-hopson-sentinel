import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createPrimaryVoiceRuntime } = require('../dashboard/electron/primary-voice-runtime.cjs');
const read = name => readFile(new URL('../' + name, import.meta.url), 'utf8');

test('Windows fails closed without the fixed GUI host instead of falling back to flashing console', { skip: process.platform !== 'win32' }, async () => {
  let spawned = false;
  const runtime = createPrimaryVoiceRuntime({ executable: 'E:\\runtime\\ollama.exe', modelsPath: 'E:\\runtime\\models',
    fileExists: () => true, fetchImpl: async () => { throw new Error('offline'); },
    spawnProcess: () => { spawned = true; },
  });
  assert.equal((await runtime.ensure()).error.code, 'VOICE_HOST_MISSING');
  assert.equal(spawned, false);
});

test('console host is GUI-only, local-only and has no arbitrary shell or command surface', async () => {
  const [host, build, main, pkg] = await Promise.all([
    read('dashboard/scripts/UltronOllamaHost.cs'), read('dashboard/scripts/build-ollama-console-host.mjs'),
    read('dashboard/electron/main.cjs'), read('dashboard/package.json'),
  ]);
  assert.match(build, /target:winexe/);
  assert.match(build, /windowsHide: true, shell: false/);
  assert.match(host, /args.Length != 1/);
  assert.ok(host.includes('Equals("ollama.exe", StringComparison.OrdinalIgnoreCase)'));
  assert.ok(host.includes('"127.0.0.1:11434"'));
  assert.ok(host.includes('"127.0.0.1:11435"'));
  assert.match(host, /UseShellExecute = false, CreateNoWindow = true/);
  assert.match(host, /CopyToAsync\(Stream.Null\)/);
  assert.match(host, /AssignProcessToJobObject/);
  assert.match(host, /0x2000/);
  assert.doesNotMatch(host, /Process.Start\(args|ReadToEnd|Console.Write|MessageBox.Show|cmd.exe|powershell.exe/i);
  assert.match(main, /consoleHost: ollamaConsoleHost/);
  assert.ok(JSON.parse(pkg).build.extraResources.some(r => r.to === 'runtime-host/UltronOllamaHost.exe'));
});
