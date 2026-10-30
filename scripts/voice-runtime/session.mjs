// Short-lived model reuse over private pipes, never a listening daemon.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRequest, workerEnvironment, decodeWorkerResponse, killOwnedProcess } from './supervisor.mjs';

const WORKER = fileURLToPath(new URL('./worker.py', import.meta.url));
const MAX_OUTPUT = 1_800_000;
const MAX_AGE_TO_REUSE = 180_000;
const HOST_BUDGET = 350_000; // Native host still terminates the entire job at 360 s.
const MAX_REQUESTS = 8;

export function createVoiceSession({ python, modelRoot, modelLock, sandboxHost,
  timeoutMs = 350_000, idleMs = 30_000, spawnProcess = spawn, killProcess = killOwnedProcess,
  onStage = () => {}, now = () => performance.now() }) {
  if (!sandboxHost) throw new Error('os-sandbox-required');
  for (const value of [python, modelRoot, modelLock, sandboxHost])
    if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) throw new Error('invalid-runtime-path');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > HOST_BUDGET
    || !Number.isSafeInteger(idleMs) || idleMs < 10 || idleMs > 30_000) throw new Error('invalid-timeout');
  let session = null, busy = false, stopGeneration = 0;

  function retire(ctx, failure) {
    if (ctx.closed) return ctx.done;
    ctx.failure ??= failure;
    clearTimeout(ctx.idleTimer);
    if (!ctx.ending) { ctx.ending = true; killProcess(ctx.child); }
    return ctx.done;
  }

  function start() {
    const child = spawnProcess(sandboxHost, [python, '-I', WORKER, '--model-root', modelRoot,
      '--model-lock', modelLock, '--session'],
    { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: workerEnvironment() });
    let closed;
    const ctx = { child, born: now(), count: 0, pending: null, output: Buffer.alloc(0), log: '', logBytes: 0,
      ending: false, closed: false, failure: null, idleTimer: null, lifetimeTimer: null,
      done: new Promise(resolve => { closed = resolve; }) };
    session = ctx;
    child.on('error', () => { ctx.failure ??= 'runtime-unavailable'; });
    child.stdin.on('error', () => { void retire(ctx, 'input-failed'); });
    child.stdout.on('data', data => {
      if (ctx.ending) return;
      if (!ctx.pending) { void retire(ctx, 'unexpected-response'); return; }
      if (ctx.output.length + data.length > MAX_OUTPUT) { void retire(ctx, 'output-limit'); return; }
      ctx.output = Buffer.concat([ctx.output, data]);
      const end = ctx.output.indexOf(10);
      if (end < 0) return;
      if (end !== ctx.output.length - 1) { void retire(ctx, 'response-framing'); return; }
      try {
        const value = decodeWorkerResponse(ctx.output.toString('utf8', 0, end), ctx.pending.profile, ctx.count);
        ctx.output = Buffer.alloc(0);
        ctx.count++;
        const pending = ctx.pending; ctx.pending = null;
        pending.finish(null, value);
        if (ctx.count >= MAX_REQUESTS || now() - ctx.born >= MAX_AGE_TO_REUSE) void retire(ctx);
        else { ctx.idleTimer = setTimeout(() => { void retire(ctx); }, idleMs); ctx.idleTimer.unref?.(); }
      } catch { void retire(ctx, 'invalid-response'); }
    });
    child.stderr.on('data', data => {
      ctx.logBytes += data.length;
      if (ctx.logBytes > 8192) { void retire(ctx, 'log-limit'); return; }
      ctx.log += data.toString('utf8');
      const lines = ctx.log.split('\n'); ctx.log = lines.pop();
      for (const line of lines) {
        try {
          const stage = JSON.parse(line).stage;
          if (!ctx.ending && ctx.pending && ['loading-offline-cpu', 'synthesizing'].includes(stage)) onStage(stage);
        } catch { /* Never forward native logs, text or paths. */ }
      }
    });
    child.on('close', () => {
      ctx.closed = true;
      clearTimeout(ctx.idleTimer); clearTimeout(ctx.lifetimeTimer);
      ctx.output = Buffer.alloc(0); ctx.log = '';
      if (ctx.pending) { const pending = ctx.pending; ctx.pending = null; pending.finish(ctx.failure || 'synthesis-failed'); }
      if (session === ctx) session = null;
      closed();
    });
    ctx.lifetimeTimer = setTimeout(() => { void retire(ctx, 'timeout'); }, HOST_BUDGET);
    ctx.lifetimeTimer.unref?.();
    return ctx;
  }

  async function synthesize(request, { signal } = {}) {
    const encoded = validateRequest(request);
    if (signal?.aborted) throw new Error('cancelled');
    if (busy) throw new Error('busy');
    busy = true;
    const generation = stopGeneration;
    try {
      if (session && (session.ending || now() - session.born >= MAX_AGE_TO_REUSE || session.count >= MAX_REQUESTS))
        await retire(session);
      if (signal?.aborted || stopGeneration !== generation) throw new Error('cancelled');
      const ctx = session || start();
      clearTimeout(ctx.idleTimer);
      return await new Promise((resolve, reject) => {
        let settled = false;
        const abort = () => { void retire(ctx, 'cancelled'); };
        const timer = setTimeout(() => { void retire(ctx, 'timeout'); }, Math.min(timeoutMs, HOST_BUDGET - (now() - ctx.born)));
        ctx.pending = { profile: request.profile, finish(error, value) {
          if (settled) return;
          settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
          if (error) reject(new Error(error)); else resolve(value);
        } };
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        else {
          try { ctx.child.stdin.write(encoded + '\n', 'utf8'); }
          catch { void retire(ctx, 'input-failed'); }
        }
      });
    } finally { busy = false; }
  }

  synthesize.stop = async () => {
    stopGeneration++;
    if (session) await retire(session, 'cancelled');
  };
  return synthesize;
}
