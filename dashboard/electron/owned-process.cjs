const { spawn } = require('node:child_process');
const path = require('node:path');

const DEFAULT_KILL_TIMEOUT_MS = 2_000;

function stopDirectChild(child) {
  if (!child || typeof child.kill !== 'function') return false;
  try {
    return child.kill() !== false;
  } catch {
    return false;
  }
}

// Voice capture uses a trusted PowerShell wrapper which owns whisper-stream.
// Killing only the wrapper can leave Whisper holding the microphone, so Windows
// termination must be scoped to that exact PID tree. No renderer value reaches
// the executable, PID or arguments and no shell is involved.
function terminateOwnedProcessTree(child, {
  platform = process.platform,
  systemRoot = process.env.SYSTEMROOT || process.env.WINDIR || 'C:\\Windows',
  spawnProcess = spawn,
  timeoutMs = DEFAULT_KILL_TIMEOUT_MS,
} = {}) {
  if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0) {
    return Promise.resolve(false);
  }
  if (platform !== 'win32') return Promise.resolve(stopDirectChild(child));
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 5_000) {
    return Promise.resolve(stopDirectChild(child));
  }

  const taskkill = path.join(systemRoot, 'System32', 'taskkill.exe');
  return new Promise((resolve) => {
    let killer;
    let settled = false;
    let timer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const fallback = () => finish(stopDirectChild(child));

    try {
      killer = spawnProcess(taskkill, ['/PID', String(child.pid), '/T', '/F'], {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
        env: { SYSTEMROOT: systemRoot, WINDIR: systemRoot },
      });
    } catch {
      fallback();
      return;
    }

    killer.once('error', fallback);
    killer.once('close', (code) => finish(code === 0 || stopDirectChild(child)));
    timer = setTimeout(() => {
      stopDirectChild(killer);
      fallback();
    }, timeoutMs);
    timer.unref?.();
  });
}

module.exports = { DEFAULT_KILL_TIMEOUT_MS, terminateOwnedProcessTree };
