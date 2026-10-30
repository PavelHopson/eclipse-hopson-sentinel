import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createVoiceSupervisor } from './supervisor.mjs';
import { createVoiceSession } from './session.mjs';

for (const [name, create] of [['one-shot', createVoiceSupervisor], ['warm-session', createVoiceSession]])
test(name + ': AppContainer cancellation kills the host, venv launcher and real interpreter', {
  skip: !process.env.TTS_TEST_PYTHON || !process.env.TTS_TEST_SANDBOX, timeout: 15000,
}, async () => {
  const python = process.env.TTS_TEST_PYTHON, sandboxHost = process.env.TTS_TEST_SANDBOX;
  const probe = fileURLToPath(new URL('./cancel-probe.py', import.meta.url));
  const abort = new AbortController(); let hostPid, workerPid;
  const run = create({ python, sandboxHost, modelRoot: fileURLToPath(new URL('.', import.meta.url)),
    modelLock: probe, timeoutMs: 7000, spawnProcess: (_exe, _args, options) => {
      const child = spawn(sandboxHost, [python, '-I', probe], options); hostPid = child.pid;
      let log = '';
      child.stderr.on('data', chunk => {
        log += chunk.toString('utf8');
        if (log.includes('\n')) {
          try { workerPid = JSON.parse(log.trim()).probePid; abort.abort(); } catch { /* incomplete probe */ }
        }
      });
      return child;
    },
  });
  await assert.rejects(run({ profile: 'ultron-angry', text: 'Отмена.' }, { signal: abort.signal }), /cancelled/);
  assert.ok(Number.isSafeInteger(hostPid)); assert.ok(Number.isSafeInteger(workerPid));
  for (const pid of new Set([hostPid, workerPid])) assert.throws(() => process.kill(pid, 0), /ESRCH/);
});
