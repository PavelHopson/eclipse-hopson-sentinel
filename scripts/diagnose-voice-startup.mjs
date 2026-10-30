// Isolated cold-start diagnostic. Fixed synthetic request, no microphone or user profile.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { createPrimaryVoiceRuntime } = require('../dashboard/electron/primary-voice-runtime.cjs');
const { terminateOwnedProcessTree } = require('../dashboard/electron/owned-process.cjs');
const root = 'E:/ADMIN_HOPSON_PC/Программы/Eclipse AI Runtime';
const endpoint = 'http://127.0.0.1:11436';
if (await fetch(endpoint + '/api/version', { signal: AbortSignal.timeout(800) }).then(() => true).catch(() => false)) throw new Error('TEST_PORT_BUSY');
let child, buffer = '', lines = 0;
const started = Date.now();
const runtime = createPrimaryVoiceRuntime({
  executable: path.join(root, 'ollama/ollama.exe'), modelsPath: path.join(root, 'models/ollama'),
  consoleHost: path.resolve('dashboard/build/UltronOllamaHost.exe'),
  fetchImpl: (url, options) => fetch(url.replace('127.0.0.1:11434', '127.0.0.1:11436'), options),
  spawnProcess: (exe, args, options) => {
    child = spawn(path.join(process.env.SystemRoot, 'System32/conhost.exe'), ['--headless', args[0], 'serve'], {
      ...options, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...options.env, OLLAMA_HOST: '127.0.0.1:11436', OLLAMA_NO_CLOUD: 'true', OLLAMA_NOPRUNE: 'true',
        ...(process.argv.includes('--no-cuda-graphs') ? { GGML_CUDA_DISABLE_GRAPHS: '1' } : {}) },
    });
    const observe = data => {
      buffer = (buffer + data.toString('utf8')).slice(-32768);
      const complete = buffer.split('\n'); buffer = complete.pop();
      for (const raw of complete) {
        const line = raw.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
        if (/sched.go|llama_server.go|load_tensors|offload|CUDA|error|timeout|timed out|slot|token.*second/i.test(line)
          && !/server config|env=|PATH|USERPROFILE/i.test(line) && ++lines < 110) console.log(JSON.stringify({ ms: Date.now() - started,
            diagnostic: line.replaceAll(root.replaceAll('/', '\\'), '[runtime]').slice(0, 650) }));
      }
    };
    child.stdout.on('data', observe); child.stderr.on('data', observe);
    return child;
  },
});
try {
  console.log(JSON.stringify({ stage: 'START', utc: new Date().toISOString() }));
  const result = await runtime.prepare();
  console.log(JSON.stringify({ stage: 'PREPARED', elapsedMs: Date.now() - started, result }));
  if (!result.ok) process.exitCode = 1;
  else {
    const ps = await fetch(endpoint + '/api/ps').then(r => r.json());
    console.log(JSON.stringify({ stage: 'RESIDENCY', models: ps.models?.map(m => ({ name: m.name, vram: m.size_vram, bytes: m.size })) }));
    const requestAt = Date.now();
    const answer = await fetch(endpoint + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60_000), body: JSON.stringify({ model: 'qwen3:8b',
        messages: [{ role: 'system', content: 'Отвечай по-русски кратко.' }, { role: 'user', content: 'Сколько будет два плюс два?' }],
        stream: true, think: false, keep_alive: '5m', options: { num_ctx: 2048, num_predict: 24, temperature: 0.6 },
      }) });
    if (!answer.ok) throw new Error('ANSWER_HTTP_' + answer.status);
    let first = true, bytes = 0;
    for await (const chunk of answer.body) {
      bytes += chunk.length;
      if (first) { console.log(JSON.stringify({ stage: 'FIRST_CHUNK', ms: Date.now() - requestAt })); first = false; }
      if (bytes > 32768) throw new Error('ANSWER_TOO_LARGE');
    }
    console.log(JSON.stringify({ stage: 'ANSWER_COMPLETE', ms: Date.now() - requestAt, bytes }));
  }
} finally {
  await runtime.cancelPreparation();
  if (child) await terminateOwnedProcessTree(child);
  runtime.dispose();
  console.log(JSON.stringify({ stage: 'STOPPED', elapsedMs: Date.now() - started }));
}
