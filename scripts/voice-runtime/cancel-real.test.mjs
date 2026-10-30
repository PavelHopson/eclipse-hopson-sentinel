import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createVoiceSupervisor } from './supervisor.mjs';

test('real cancellation kills both the Python launcher and its owned interpreter',
  { skip: !process.env.TTS_TEST_PYTHON, timeout: 15000 }, async () => {
    const python = process.env.TTS_TEST_PYTHON;
    const probe = fileURLToPath(new URL('./cancel-probe.py', import.meta.url));
    const controller = new AbortController();
    let launcherPid, workerPid;
    const run = createVoiceSupervisor({ python, modelRoot: fileURLToPath(new URL('.', import.meta.url)), modelLock: probe,
      timeoutMs: 5000,
      spawnProcess: (_exe, _args, options) => {
        const child = spawn(python, ['-I', probe], options);
        launcherPid = child.pid;
        let log = '';
        child.stderr.on('data', chunk => {
          log += chunk.toString('utf8');
          if (!log.includes('\n')) return;
          try { workerPid = JSON.parse(log.trim()).probePid; controller.abort(); } catch { /* wait for complete probe */ }
        });
        return child;
      },
    });
    await assert.rejects(run({ profile: 'ultron-angry', text: 'Проверка.' }, { signal: controller.signal }), /cancelled/);
    assert.ok(Number.isInteger(launcherPid)); assert.ok(Number.isInteger(workerPid));
    for (const pid of new Set([launcherPid, workerPid])) assert.throws(() => process.kill(pid, 0), /ESRCH/);
  });
