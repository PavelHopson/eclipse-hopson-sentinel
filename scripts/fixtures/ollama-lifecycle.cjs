// Owned OS regression fixture. Never touches an Ollama endpoint or model.
const { spawn } = require('node:child_process');
const { createPrimaryVoiceRuntime } = require('../../dashboard/electron/primary-voice-runtime.cjs');
if (process.argv[2] === 'daemon') {
  setTimeout(() => {}, 20_000); // Hard bound even if test cleanup is interrupted.
} else {
  let probes = 0;
  let daemon;
  const runtime = createPrimaryVoiceRuntime({
    executable: process.execPath, modelsPath: __dirname, consoleHost: process.execPath,
    fetchImpl: async () => {
      if (++probes === 1) throw new Error('fixture-offline');
      return new Response(JSON.stringify({ models: [{ name: 'qwen3:8b' }] }));
    },
    wait: async () => {},
    spawnProcess: (_exe, _args, options) => {
      daemon = spawn(process.execPath, [__filename, 'daemon'], process.argv[2] === 'legacy'
        ? { ...options, detached: false } : options);
      return daemon;
    },
  });
  runtime.ensure().then(result => {
    if (!result.ok || !daemon?.pid) throw new Error('fixture-start');
    runtime.dispose();
    process.stdout.write(JSON.stringify({ pid: daemon.pid }) + '\n');
    if (process.argv[2] !== 'normal') setTimeout(() => {}, 20_000);
  }).catch(() => { process.exitCode = 1; });
}
