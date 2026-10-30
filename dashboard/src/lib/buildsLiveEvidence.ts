export type CheckState = 'passed' | 'failed' | 'interrupted' | 'unverified';
export type CheckEvidence = { state: CheckState; exitCode: number | null; durationMs: number | null; at: string | null };
export type AttemptEvidence = {
  id: string; revision: string; retryOf: string | null; requestId: string | null; receiptId: string | null;
  workspaceId: string | null; before: string | null; diff: string | null;
  change: 'applied' | 'preview' | 'unverified'; syntax: CheckEvidence; runtime: CheckEvidence;
  feedback: boolean; fixesPrevious: boolean;
};
export type BuildsEvidence = { runId: string; taskId: string; title: string; baselineCommit: string;
  generatedAt: string; stale: boolean; attempts: AttemptEvidence[] };
const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown, max = 200) => typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;
const uuid = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v) ? v : null;
const sha = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v) ? v : null;
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : NaN;
const unknownCheck = (): CheckEvidence => ({ state: 'unverified', exitCode: null, durationMs: null, at: null });
function check(raw: unknown, revision: string, earliest: number, latest: number, name: string): CheckEvidence {
  const c = record(raw), at = date(c.finishedAt);
  if (c.name !== name || c.revision !== revision || !(at >= earliest && at <= latest)
    || typeof c.durationMs !== 'number' || !Number.isInteger(c.durationMs) || c.durationMs < 0 || c.durationMs > 60000) return unknownCheck();
  if (['SIGTERM', 'SIGKILL', 'SIGINT'].includes(String(c.signal)) && c.exitCode === null)
    return { state: 'interrupted', exitCode: null, durationMs: c.durationMs, at: c.finishedAt as string };
  if (c.signal !== null || typeof c.exitCode !== 'number' || !Number.isInteger(c.exitCode) || c.exitCode < 0 || c.exitCode > 255) return unknownCheck();
  return { state: c.exitCode === 0 ? 'passed' : 'failed', exitCode: c.exitCode, durationMs: c.durationMs, at: c.finishedAt as string };
}
export function parseBuildsEvidence(raw: unknown, now = Date.now()): BuildsEvidence {
  const r = record(raw), runId = uuid(r.runId), generatedAt = date(r.generatedAt);
  if (r.schemaVersion !== 'eclipse.ultron.builds-live-pilot.v1' || r.origin !== 'local-fixture'
    || !runId || r.taskId !== 'IDEA-029-ULTRON' || !text(r.taskTitle)
    || !Number.isFinite(now) || !Number.isFinite(generatedAt) || generatedAt > now + 5000
    || typeof r.baselineCommit !== 'string' || !/^[a-f0-9]{40}$/.test(r.baselineCommit)
    || r.modelUsed !== false || r.installedRuntimeTested !== false || r.published !== false || r.productTaskId !== null
    || !Array.isArray(r.attempts) || r.attempts.length > 12) throw new Error('EVIDENCE_INVALID');
  const attempts: AttemptEvidence[] = [];
  for (const [index, rawAttempt] of r.attempts.entries()) {
    const a = record(rawAttempt), p = record(a.proposal), receipt = record(a.receipt);
    const revision = sha(a.revision);
    if (a.id !== `${runId}:${index + 1}` || a.ordinal !== index + 1 || !revision) throw new Error('ATTEMPT_INVALID');
    const change = record(Array.isArray(p.changes) && p.changes.length === 1 ? p.changes[0] : null);
    const file = record(Array.isArray(receipt.files) && receipt.files.length === 1 ? receipt.files[0] : null);
    const created = date(p.createdAt), expires = date(p.expiresAt), applied = date(receipt.appliedAt);
    const validProposal = p.schemaVersion === 'eclipse.ultron.developer-proposal.v1' && !!uuid(p.requestId) && !!uuid(p.workspaceId)
      && !!sha(change.expectedSha256) && change.afterSha256 === revision && !!text(change.diff, 16384)
      && change.path === `reports/builds-live-idea-029/runs/${runId}/status.mjs`
      && created <= generatedAt && expires > created;
    const validReceipt = validProposal && receipt.schemaVersion === 'eclipse.ultron.developer-receipt.v1'
      && receipt.status === 'applied' && !!uuid(receipt.receiptId) && receipt.requestId === p.requestId && receipt.workspaceId === p.workspaceId
      && file.path === change.path && file.beforeSha256 === change.expectedSha256 && file.afterSha256 === revision
      && applied >= created && applied <= expires && applied <= generatedAt;
    const syntax = validReceipt ? check(a.syntax, revision, applied, generatedAt, 'node --check') : unknownCheck();
    let runtime = validReceipt ? check(a.runtime, revision, applied, generatedAt, 'fixed fixture runtime assertion') : unknownCheck();
    const observation = record(record(a.runtime).observation), feedback = record(a.feedback);
    if (runtime.state === 'passed' && !(observation.expected === 'ready' && observation.actual === 'ready' && observation.passed === true)) runtime = unknownCheck();
    const confirmedFeedback = runtime.state === 'failed' && runtime.exitCode === 1 && observation.expected === 'ready'
      && observation.actual === 'pending' && observation.passed === false && feedback.code === 'EXPECTED_READY'
      && feedback.expected === 'ready' && feedback.actual === 'pending' && feedback.source === 'runtime assertion';
    const previous = attempts[index - 1];
    attempts.push({ id: a.id as string, revision, retryOf: typeof a.retryOf === 'string' && a.retryOf === previous?.id ? a.retryOf : null,
      requestId: uuid(p.requestId), receiptId: uuid(receipt.receiptId), workspaceId: uuid(p.workspaceId), before: sha(change.expectedSha256), diff: text(change.diff, 16384),
      change: validReceipt ? 'applied' : validProposal && a.receipt == null ? 'preview' : 'unverified', syntax, runtime, feedback: confirmedFeedback,
      fixesPrevious: !!(validReceipt && previous?.feedback && previous.change === 'applied' && a.retryOf === previous.id
        && previous.workspaceId === p.workspaceId && change.expectedSha256 === previous.revision
        && runtime.state === 'passed' && syntax.state === 'passed' && date(record(a.syntax).finishedAt) <= date(record(a.runtime).finishedAt)) });
  }
  return { runId, taskId: r.taskId, title: r.taskTitle as string, baselineCommit: r.baselineCommit,
    generatedAt: r.generatedAt as string, stale: now - generatedAt > 600000, attempts };
}
export async function readBuildsEvidence(signal: AbortSignal): Promise<BuildsEvidence> {
  const response = await fetch('./evidence.json', { signal, cache: 'no-store', redirect: 'error', credentials: 'omit' });
  if (response.status === 404) throw new Error('EVIDENCE_MISSING');
  if (!response.ok || !response.body) throw new Error('EVIDENCE_READ_FAILED');
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 262144) throw new Error('EVIDENCE_TOO_LARGE');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return parseBuildsEvidence(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}
