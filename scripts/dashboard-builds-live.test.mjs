import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseBuildsEvidence, readBuildsEvidence } from '../dashboard/src/lib/buildsLiveEvidence.ts';
import { createEvidenceServer } from './ultron-builds-live-serve.mjs';
import http from 'node:http';
const source = JSON.parse(await readFile(new URL('../reports/builds-live-idea-029/evidence.json', import.meta.url), 'utf8'));
const now = Date.parse(source.generatedAt) + 1;
const clone = () => structuredClone(source);
test('actual native receipts: syntax pass is not runtime pass; linked correction confirmed', () => {
  const r = parseBuildsEvidence(source, now);
  assert.equal(r.attempts[0].change, 'applied');
  assert.equal(r.attempts[0].syntax.state, 'passed');
  assert.equal(r.attempts[0].runtime.state, 'failed');
  assert.equal(r.attempts[0].feedback, true);
  assert.equal(r.attempts[0].fixesPrevious, false);
  assert.equal(r.attempts[1].fixesPrevious, true);
});
for (const [name, mutate] of [
  ['request', a => a.receipt.requestId = 'wrong'],
  ['workspace', a => a.receipt.workspaceId = 'wrong'],
  ['path', a => a.receipt.files[0].path = '../other'],
  ['before hash', a => a.receipt.files[0].beforeSha256 = '0'.repeat(64)],
  ['after hash', a => a.receipt.files[0].afterSha256 = '0'.repeat(64)],
  ['expiry', a => a.receipt.appliedAt = '2099-01-01T00:00:00.000Z'],
  ['rollback is not apply', a => a.receipt.status = 'rolled-back'],
]) test(`reject mismatched receipt: ${name}`, () => {
  const r = clone(); mutate(r.attempts[1]); const a = parseBuildsEvidence(r, now).attempts[1];
  assert.equal(a.change, 'unverified'); assert.equal(a.runtime.state, 'unverified'); assert.equal(a.fixesPrevious, false);
});
for (const [name, mutate] of [
  ['revision', c => c.revision = '0'.repeat(64)], ['missing observation', c => delete c.observation],
  ['contradictory observation', c => c.observation.actual = 'pending'], ['missing signal', c => delete c.signal],
  ['time', c => c.finishedAt = '2099-01-01T00:00:00.000Z'], ['duration', c => c.durationMs = -1],
]) test(`incomplete check does not confirm correction: ${name}`, () => {
  const r = clone(); mutate(r.attempts[1].runtime); const a = parseBuildsEvidence(r, now).attempts[1];
  assert.equal(a.runtime.state, 'unverified'); assert.equal(a.fixesPrevious, false);
});
test('preview is not applied and interrupted is not cancelled by user', () => {
  const r = clone(); r.attempts[0].receipt = null;
  assert.equal(parseBuildsEvidence(r, now).attempts[0].change, 'preview');
  r.attempts[1].runtime.exitCode = null; r.attempts[1].runtime.signal = 'SIGTERM';
  assert.equal(parseBuildsEvidence(r, now).attempts[1].runtime.state, 'interrupted');
  assert.equal(parseBuildsEvidence(r, now).attempts[1].fixesPrevious, false);
});
test('retry link required, feedback tied to failed observation', () => {
  const r = clone(); r.attempts[1].retryOf = null;
  assert.equal(parseBuildsEvidence(r, now).attempts[1].fixesPrevious, false);
  r.attempts[0].runtime.observation.actual = 'ready';
  assert.equal(parseBuildsEvidence(r, now).attempts[0].feedback, false);
});
test('stale, empty and invalid envelopes', () => {
  assert.equal(parseBuildsEvidence(source, now + 600001).stale, true);
  const r = clone(); r.attempts = []; assert.equal(parseBuildsEvidence(r, now).attempts.length, 0);
  for (const key of ['origin', 'modelUsed', 'published', 'installedRuntimeTested', 'productTaskId']) {
    const invalid = clone(); invalid[key] = 'unknown'; assert.throws(() => parseBuildsEvidence(invalid, now));
  }
  assert.throws(() => parseBuildsEvidence(source, now - 9000));
  r.attempts = Array(13).fill({}); assert.throws(() => parseBuildsEvidence(r, now));
});
test('fixed fetch rejects excessive body and missing evidence', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, './evidence.json'); assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
    return new Response('x'.repeat(262145));
  });
  await assert.rejects(readBuildsEvidence(new AbortController().signal), /EVIDENCE_TOO_LARGE/);
  globalThis.fetch.mock.mockImplementation(async () => new Response('', { status: 404 }));
  await assert.rejects(readBuildsEvidence(new AbortController().signal), /EVIDENCE_MISSING/);
});
test('read-only adapter refuses writes, cross-origin and unknown paths', async () => {
  const server = createEvidenceServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${base}/evidence.json`)).status, 200);
    assert.equal((await fetch(`${base}/evidence.json`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${base}/evidence.json`, { headers: { Origin: 'https://untrusted.invalid' } })).status, 403);
    const wrongHost = await new Promise((resolve, reject) => http.get(`${base}/evidence.json`, { headers: { Host: 'untrusted.invalid' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject));
    assert.equal(wrongHost, 403);
    for (const route of ['/README.md', '/.env', '/assets/%2e%2e/evidence.json', '/evidence.json?path=other']) {
      const status = await new Promise((resolve, reject) => http.get(base, { path: route }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject));
      assert.equal(status, 404, route);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
