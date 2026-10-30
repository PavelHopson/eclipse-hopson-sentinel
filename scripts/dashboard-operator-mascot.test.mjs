import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { projectOperatorMascot, operatorMascotExpiresAt, MASCOT_FRESH_MS } from '../dashboard/src/lib/operatorMascot.ts';
import { buildSafeOperatorPlan, createSafeOperatorRequest, createSafeOperatorExecutor } from '../dashboard/electron/sentinel-safe-operator.mjs';

// Real existing read-only handler, current runtimeProvider (no fabricated machine).
// This is not an Electron IPC or installed-app test.
function completed() {
  const plan = buildSafeOperatorPlan('Покажи статус системы', 'workspace.status');
  const request = createSafeOperatorRequest(plan);
  const executor = createSafeOperatorExecutor({ transport: 'electron-ipc' });
  const receipt = executor.execute(request);
  return { stage: 'receipt', plan, approvedAt: request.approval.confirmedAt,
    receipt, transport: 'electron-ipc', killSwitch: true };
}
const project = (input, now = Date.now()) => projectOperatorMascot(input, now, now);

test('actual read-only handler produces matching receipt; adapter confirms only that operation', () => {
  const input = completed();
  assert.equal(project(input).state, 'success');
  assert.equal(project(input).confirmed, true);
  assert.ok(input.receipt.lines.length);
});
test('browser preview never becomes operational success', () => {
  const input = completed(); input.transport = 'browser-preview'; input.receipt.transport = 'browser-preview';
  assert.equal(project(input).state, 'idle');
  assert.equal(project(input).confirmed, false);
  assert.match(project(input).text, /Предпросмотр/);
});
test('missing, stale, future and malformed evidence fail closed', () => {
  const input = completed(), now = Date.now();
  for (const observed of [NaN, now + 1, now - MASCOT_FRESH_MS]) assert.equal(projectOperatorMascot(input, observed, now).state, 'unknown');
  assert.equal(project(null).state, 'unknown');
  for (const changed of [{ planId: crypto.randomUUID() }, { completedAt: 'invalid' },
    { completedAt: new Date(now - MASCOT_FRESH_MS).toISOString() }, { completedAt: new Date(now + 1000).toISOString() },
    { status: 'failed' }, { effect: 'write' }, { skillId: 'memory.preview' }, { transport: 'browser-preview' },
    { schemaVersion: 'other' }, { receiptId: 'bad' }, { requestId: 'bad' }, { startedAt: 'invalid' }]) {
    assert.equal(project({ ...input, receipt: { ...input.receipt, ...changed } }).state, 'unknown');
  }
});
test('real UI stages are mapped without confusing STOP, approval and cancellation', () => {
  const input = completed();
  assert.equal(project({ ...input, stage: 'command', plan: null, receipt: null }).state, 'idle');
  assert.equal(project({ ...input, stage: 'plan', receipt: null, approvedAt: null }).state, 'awaiting-confirmation');
  for (const killSwitch of [true, false]) assert.equal(project({ ...input, stage: 'approved', killSwitch }).state, 'idle');
  assert.equal(project({ ...input, stage: 'executing', receipt: null }).state, 'working');
  assert.equal(project({ ...input, stage: 'error' }).state, 'error');
  assert.equal(project({ ...input, stage: 'cancelled' }).state, 'unknown');
  assert.equal(project({ ...input, stage: 'made-up' }).state, 'unknown');
});
test('old receipt cannot acknowledge a newer plan or missing result', () => {
  const input = completed();
  assert.equal(project({ ...input, plan: { ...input.plan, id: crypto.randomUUID() } }).state, 'unknown');
  assert.equal(project({ ...input, receipt: null }).state, 'unknown');
});
test('a nearly expired receipt does not acquire a new 30-second success lease', () => {
  const input = completed(), now = Date.now();
  input.receipt.completedAt = new Date(now - 29000).toISOString();
  assert.equal(operatorMascotExpiresAt(input, now), now + 1000);
});
test('adapter never copies private plan/receipt text and has no control capability', async () => {
  const input = completed(); input.plan.command = 'private text'; input.receipt.summary = '<script>secret</script>';
  assert.doesNotMatch(JSON.stringify(project(input)), /private text|secret|<script>/);
  for (const file of ['../dashboard/src/lib/operatorMascot.ts', '../dashboard/src/components/OperatorMascot.tsx']) {
    const code = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(code, /fetch\(|\.execute\(|\.invoke\(|startLive|listenOnce|synthesize|dangerouslySetInnerHTML|setInterval|requestAnimationFrame/);
  }
});
