import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';

const require = createRequire(import.meta.url);
const { createTaskPolicy } = require('../dashboard/electron/task-ledger-contract.cjs');
const { createTaskLedgerRuntime } = require('../dashboard/electron/task-ledger-runtime.cjs');
const { createSshTaskTransport, buildRemoteProgram, remoteTaskRequest, SSH_ARGS } = require('../dashboard/electron/task-ledger-transport.cjs');
const policy = createTaskPolicy();
const id = '4f2bbb09-e0b3-47de-9b50-dbb56acad719';
const task = { id, projectId: 'ultron', title: 'Connect ledger', detail: '', state: 'proposed', revision: 1, createdAt: '2026-09-06T10:00:00.000Z', updatedAt: '2026-09-06T10:00:00.000Z', createdBy: 'pilot-tasks', executionAllowed: false, completionEvidence: null };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('fixed request surface rejects URL, commands, extra authority and unknown projects', () => {
  assert.equal(policy.request({ kind: 'list', projectId: 'ultron' }).after, 0);
  for (const args of [{ kind: 'exec', projectId: 'ultron' }, { kind: 'list', projectId: 'other' }, { kind: 'list', projectId: 'ultron', url: 'http://example.com' }, { kind: 'transition', projectId: 'ultron', taskId: id, action: 'run', expectedRevision: 1 }]) assert.throws(() => policy.request(args));
});

test('response projection rejects foreign task, execution claim and malformed completion', () => {
  assert.equal(policy.task(task, 'ultron').id, id);
  for (const raw of [{ ...task, projectId: 'starcrm' }, { ...task, executionAllowed: true }, { ...task, state: 'completed' }]) assert.throws(() => policy.task(raw, 'ultron'));
});

test('late list cannot cross a replaced native project session', async () => {
  const pending = deferred();
  const runtime = createTaskLedgerRuntime({ transport: () => pending.promise });
  const old = runtime.activate('ultron');
  const result = runtime.request({ session: old.session, kind: 'list', projectId: 'ultron' });
  runtime.activate('starcrm');
  pending.resolve({ ok: true, items: [task], total: 1, nextCursor: null });
  assert.equal((await result).error, 'stale_session');
});

test('mutation uses authoritative title, explicit native confirmation and one POST', async () => {
  const calls = [];
  const runtime = createTaskLedgerRuntime({ transport: async args => { calls.push(args); return { ok: true, task }; }, confirm: async value => { assert.equal(value.task.title, task.title); return true; } });
  const scope = runtime.activate('ultron');
  const result = await runtime.request({ session: scope.session, kind: 'transition', projectId: 'ultron', taskId: id, action: 'accept', expectedRevision: 1 });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map(c => c.kind), ['get', 'transition']);
  assert.match(calls[1].idempotencyKey, /^[a-f0-9-]{36}$/);
});

test('cancelled confirmation and stale revision never POST', async () => {
  for (const [revision, confirmed, code] of [[1, false, 'cancelled'], [2, true, 'conflict']]) {
    const calls = [];
    const runtime = createTaskLedgerRuntime({ transport: async args => { calls.push(args); return { ok: true, task: { ...task, revision } }; }, confirm: async () => confirmed });
    const scope = runtime.activate('ultron');
    const result = await runtime.request({ session: scope.session, kind: 'transition', projectId: 'ultron', taskId: id, action: 'accept', expectedRevision: 1 });
    assert.equal(result.error, code);
    assert.equal(calls.length, 1);
  }
});

test('project switch during confirmation cancels mutation and close is session-specific', async () => {
  const confirmation = deferred(), reached = deferred(), calls = [];
  const runtime = createTaskLedgerRuntime({ transport: async args => { calls.push(args); return { ok: true, task }; }, confirm: () => { reached.resolve(); return confirmation.promise; } });
  const old = runtime.activate('ultron');
  const result = runtime.request({ session: old.session, kind: 'transition', projectId: 'ultron', taskId: id, action: 'accept', expectedRevision: 1 });
  await reached.promise;
  const current = runtime.activate('starcrm');
  runtime.close(old.session);
  confirmation.resolve(true);
  assert.equal((await result).error, 'stale_session');
  assert.equal(calls.length, 1);
  assert.equal(runtime.isCurrent(current.session), true);
});

test('double action is busy and uncertain delivery is not retried', async () => {
  const pending = deferred(), reached = deferred(); let posts = 0;
  const runtime = createTaskLedgerRuntime({ transport: async args => { if (args.kind === 'get') return { ok: true, task }; posts++; reached.resolve(); return pending.promise; }, confirm: async () => true });
  const scope = runtime.activate('ultron');
  const args = { session: scope.session, kind: 'transition', projectId: 'ultron', taskId: id, action: 'accept', expectedRevision: 1 };
  const first = runtime.request(args);
  await reached.promise;
  assert.equal((await runtime.request(args)).error, 'busy');
  pending.resolve({ ok: false, error: 'delivery_unconfirmed' });
  assert.equal((await first).error, 'delivery_unconfirmed');
  assert.equal(posts, 1);
});

test('history and pagination enforce tuple, bounds and event revisions', () => {
  const request = { kind: 'get', projectId: 'ultron', taskId: id };
  const raw = { schemaVersion: 'eclipse.task.v1', task, events: [{ revision: 1, action: 'propose', actor: 'pilot-tasks', at: task.createdAt }] };
  assert.equal(policy.response(raw, request).events.length, 1);
  assert.throws(() => policy.response({ ...raw, events: [] }, request));
  assert.throws(() => policy.response({ ...raw, task: { ...task, id: '0f2bbb09-e0b3-47de-9b50-dbb56acad719' } }, request));
  assert.throws(() => policy.response({ schemaVersion: 'eclipse.task-list.v1', projectId: 'ultron', items: [task, task], total: 2, nextCursor: 0, executionAllowed: false }, { kind: 'list', projectId: 'ultron', after: 0 }));
});

test('remote program treats proposal text as data and keeps credentials server-only', () => {
  const title = "'); process.exit(42); //";
  const program = buildRemoteProgram({ kind: 'propose', projectId: 'ultron', title, detail: '', idempotencyKey: id });
  assert.equal(program.includes(title), false);
  assert.match(program, /owner-ledger/);
  assert.match(program, /http:\/\/127\.0\.0\.1:8810\/v1\/projects/);
  assert.equal(SSH_ARGS.includes('StrictHostKeyChecking=yes'), true);
  assert.equal(SSH_ARGS.includes('ForwardAgent=no'), true);
  assert.throws(() => buildRemoteProgram({ kind: 'get', projectId: 'ultron', taskId: '../env' }));
});

function childStub() {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.stdin = new Writable({ write(_chunk, _encoding, done) { done(); } });
  child.kills = 0; child.kill = () => { child.kills++; queueMicrotask(() => child.emit('close', null)); return true; };
  return child;
}

test('SSH transport has fixed executable, clean env, global admission and abort cleanup', async () => {
  const child = childStub(); let calls = 0;
  const transport = createSshTaskTransport({ env: { SystemRoot: 'safe', ProgramData: 'safe', API_TOKEN: 'private', NODE_OPTIONS: '--bad', HTTPS_PROXY: 'private' }, spawnImpl: (exe, args, options) => {
    calls++; assert.equal(exe, 'C:\\Windows\\System32\\OpenSSH\\ssh.exe'); assert.deepEqual(args, SSH_ARGS);
    assert.equal(options.shell, false); assert.equal(options.windowsHide, true);
    assert.deepEqual(options.env, { SystemRoot: 'safe', ProgramData: 'safe' }); return child;
  } });
  const abort = new AbortController();
  const first = transport({ kind: 'list', projectId: 'ultron', after: 0 }, abort.signal);
  assert.equal((await transport({ kind: 'list', projectId: 'starcrm', after: 0 })).error, 'busy');
  abort.abort(); assert.equal((await first).ok, false); assert.equal(child.kills, 1); assert.equal(calls, 1);
});

test('SSH output overflow kills owned child and raw stderr never escapes', async () => {
  for (const stream of ['stdout', 'stderr']) {
    const child = childStub(); const transport = createSshTaskTransport({ spawnImpl: () => child });
    const result = transport({ kind: 'list', projectId: 'ultron', after: 0 });
    child[stream].write(Buffer.alloc(70000, 65));
    assert.deepEqual(await result, { ok: false, error: 'connection_required', executionAllowed: false });
    assert.equal(child.kills, 1);
  }
});

test('an owned process error cannot release admission before close', async () => {
  const child = childStub(); child.pid = 123;
  const transport = createSshTaskTransport({ spawnImpl: () => child });
  const first = transport({ kind: 'list', projectId: 'ultron', after: 0 });
  child.emit('error', new Error('synthetic kill failure'));
  assert.equal((await transport({ kind: 'list', projectId: 'starcrm', after: 0 })).error, 'busy');
  child.emit('close', 1);
  assert.equal((await first).ok, false);
});

test('remote bridge uses owner scope and fixed local API without a provider call', async () => {
  const oldEnv = process.env.AI_GATEWAY_SERVICE_CLIENTS, oldFetch = globalThis.fetch; const calls = [];
  process.env.AI_GATEWAY_SERVICE_CLIENTS = JSON.stringify([{ id: 'owner-ledger', tokens: ['a'.repeat(64)], scopes: ['tasks:ultron:read'] }]);
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return Response.json({ schemaVersion: 'eclipse.task-list.v1', projectId: 'ultron', total: 1, items: [task], nextCursor: null, executionAllowed: false }); };
  try {
    assert.equal((await remoteTaskRequest({ kind: 'list', projectId: 'ultron', after: 0 }, policy)).ok, true);
    assert.equal(calls[0].url, 'http://127.0.0.1:8810/v1/projects/ultron/tasks?limit=20&after=0');
    assert.equal(calls[0].options.method, 'GET'); assert.equal(calls[0].options.redirect, 'error');
    assert.equal((await remoteTaskRequest({ kind: 'transition', projectId: 'ultron', taskId: id, action: 'accept', expectedRevision: 1, idempotencyKey: id }, policy)).error, 'not_configured');
    assert.equal(calls.length, 1);
  } finally { if (oldEnv === undefined) delete process.env.AI_GATEWAY_SERVICE_CLIENTS; else process.env.AI_GATEWAY_SERVICE_CLIENTS = oldEnv; globalThis.fetch = oldFetch; }
});
