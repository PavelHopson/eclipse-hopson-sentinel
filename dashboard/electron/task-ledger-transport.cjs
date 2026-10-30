const { spawn } = require('node:child_process');
const { createTaskPolicy } = require('./task-ledger-contract.cjs');

const SSH = 'C:\\Windows\\System32\\OpenSSH\\ssh.exe';
const SSH_ARGS = Object.freeze(['-F', 'NUL', '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8', '-o', 'ConnectionAttempts=1', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=1', '-o', 'PermitLocalCommand=no', '-o', 'ClearAllForwardings=yes', '-o', 'ForwardAgent=no', 'star@100.83.22.120', 'docker', 'exec', '-i', 'starai-status-api', 'node', '--input-type=module']);
const MAX_OUTPUT = 65536;

async function remoteTaskRequest(input, policy) {
  const mutation = ['transition', 'propose'].includes(input.kind);
  const failure = error => ({ ok: false, error, executionAllowed: false });
  try {
    const args = policy.request(input, true);
    const clients = JSON.parse(process.env.AI_GATEWAY_SERVICE_CLIENTS ?? 'null');
    const owner = Array.isArray(clients) && clients.find(client => client.id === 'owner-ledger');
    const scope = `tasks:${args.projectId}:${mutation ? args.kind === 'propose' ? 'propose' : 'manage' : 'read'}`;
    if (!owner?.scopes?.includes(scope) || !/^[a-f0-9]{64}$/.test(owner.tokens?.[0])) return failure('not_configured');
    let suffix = '', body;
    if (args.kind === 'list') suffix = `?limit=20&after=${args.after}`;
    if (args.kind === 'get') suffix = `/${args.taskId}`;
    if (args.kind === 'propose') body = { title: args.title, detail: args.detail };
    if (args.kind === 'transition') {
      suffix = `/${args.taskId}/transitions`;
      body = { action: args.action, expectedRevision: args.expectedRevision, ...(args.action === 'complete' ? { evidenceNote: args.evidenceNote } : {}) };
    }
    const result = await fetch(`http://127.0.0.1:8810/v1/projects/${args.projectId}/tasks${suffix}`, {
      method: mutation ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(6000),
      headers: { Authorization: `Bearer ${owner.tokens[0]}`, Accept: 'application/json', ...(mutation ? { 'Content-Type': 'application/json', 'Idempotency-Key': args.idempotencyKey } : {}) },
      ...(mutation ? { body: JSON.stringify(body) } : {}),
    });
    if (!result.ok) {
      await result.body?.cancel();
      return failure(({ 400: 'invalid_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 429: 'rate_limited' })[result.status] ?? (mutation ? 'delivery_unconfirmed' : 'unavailable'));
    }
    if (!result.headers.get('content-type')?.startsWith('application/json') || Number(result.headers.get('content-length') ?? 0) > 65536) { await result.body?.cancel(); throw new Error('invalid_response'); }
    const reader = result.body.getReader(); const chunks = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > 65536) throw new Error('response_large'); chunks.push(value);
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    return policy.response(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))), args);
  } catch { return failure(mutation ? 'delivery_unconfirmed' : 'unavailable'); }
}

function buildRemoteProgram(request) {
  const args = createTaskPolicy().request(request, true);
  const encoded = Buffer.from(JSON.stringify(args)).toString('base64');
  return `const policy=(${createTaskPolicy.toString()})();\nconst request=JSON.parse(Buffer.from('${encoded}','base64').toString('utf8'));\nconst result=await (${remoteTaskRequest.toString()})(request,policy);\nprocess.stdout.write(JSON.stringify(result));\n`;
}

function createSshTaskTransport({ spawnImpl = spawn, env = process.env } = {}) {
  let inFlight = false;
  return function transport(request, signal) {
    const program = buildRemoteProgram(request);
    if (signal?.aborted) return Promise.resolve({ ok: false, error: 'stale_session' });
    if (inFlight) return Promise.resolve({ ok: false, error: 'busy', executionAllowed: false });
    inFlight = true;
    return new Promise(resolve => {
      let child, timer, bytes = 0, stderrBytes = 0, stopped = false;
      const chunks = [];
      const mutation = ['transition', 'propose'].includes(request.kind);
      const fail = () => ({ ok: false, error: mutation ? 'delivery_unconfirmed' : 'connection_required', executionAllowed: false });
      const stop = () => { stopped = true; child?.stdin.destroy(); try { child?.kill(); } catch { /* Keep admission occupied until the owned process closes. */ } };
      const cleanup = () => { inFlight = false; clearTimeout(timer); signal?.removeEventListener('abort', stop); };
      try {
        // No renderer-controlled environment, proxy, shell, SSH options or destination.
        const childEnv = Object.fromEntries(['SystemRoot', 'WINDIR', 'SystemDrive', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'USERNAME', 'USERDOMAIN', 'LOCALAPPDATA', 'APPDATA', 'ProgramData', 'ALLUSERSPROFILE', 'ComSpec', 'SSH_AUTH_SOCK', 'TEMP', 'TMP'].filter(key => typeof env[key] === 'string').map(key => [key, env[key]]));
        child = spawnImpl(SSH, [...SSH_ARGS], { windowsHide: true, shell: false, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'] });
        timer = setTimeout(stop, 20000);
        signal?.addEventListener('abort', stop, { once: true });
        child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > MAX_OUTPUT) stop(); else if (!stopped) chunks.push(chunk); });
        child.stderr.on('data', chunk => { stderrBytes += chunk.length; if (stderrBytes > 8192) stop(); });
        child.stdin.on('error', () => { stopped = true; });
        child.on('error', () => {
          stopped = true;
          if (!child.pid) { cleanup(); resolve(fail()); }
          // A kill failure is not a closed process; retain admission until close.
        });
        child.once('close', code => {
          cleanup();
          if (stopped || code !== 0 || signal?.aborted) { resolve(fail()); return; }
          try {
            const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
            if (raw.ok !== true) {
              const errors = ['not_configured', 'unauthorized', 'forbidden', 'invalid_request', 'not_found', 'conflict', 'rate_limited', 'delivery_unconfirmed', 'unavailable'];
              resolve({ ok: false, error: errors.includes(raw.error) ? raw.error : fail().error, executionAllowed: false }); return;
            }
            const policy = createTaskPolicy();
            const api = request.kind === 'list'
              ? { ...raw, schemaVersion: 'eclipse.task-list.v1', projectId: request.projectId }
              : { ...raw, schemaVersion: 'eclipse.task.v1' };
            resolve(policy.response(api, request));
          } catch { resolve(fail()); }
        });
        child.stdin.end(program);
      } catch { stop(); if (!child) cleanup(); resolve(fail()); }
    });
  };
}

module.exports = { createSshTaskTransport, buildRemoteProgram, remoteTaskRequest, SSH, SSH_ARGS };
