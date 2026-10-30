import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createTemplate, evaluateDictation, tokens } from './voice-dictation-eval.mjs';

const corpus = JSON.parse(await readFile(new URL('./fixtures/ru-dictation-v1.json', import.meta.url), 'utf8'));
function one(id, text) {
  return { ...createTemplate(), source: 'synthetic', results: [{ id, status: 'ok', text, latencyMs: null, costUsd: null }] };
}

test('empty benchmark does not claim zero errors, free use, latency or completion', () => {
  const report = evaluateDictation(createTemplate());
  assert.equal(report.evaluatedCases, 0);
  assert.equal(report.missingCases, 30);
  for (const field of ['wer', 'cer', 'knownCostUsd', 'latencyP50Ms', 'latencyP95Ms']) assert.equal(report[field], null);
  assert.equal(report.promotionAllowed, false);
  assert.equal(report.costComplete, false);
});

test('numbers, signs, zeros and negation survive normalization', () => {
  assert.deepEqual(tokens('НЕ: -5, +5, 0042, 15,5; ёж'), ['не', '-5', '+5', '0042', '15.5', 'еж']);
  for (const [id, phrase] of [['ru-01', 'Открывай YouTube.'], ['ru-06', 'Температура 5 градусов.'], ['ru-09', 'Номер заказа 42.']]) {
    assert.equal(evaluateDictation(one(id, phrase)).criticalFailures, 1);
  }
});

test('metric is weighted edit distance rather than average of percentages', () => {
  const report = evaluateDictation(one('ru-01', 'Открывай YouTube.'));
  assert.equal(report.wer, 1 / 3);
  assert.ok(report.cer > 0);
});

test('perfect synthetic fixtures cannot be promoted as measured STT accuracy', () => {
  const input = { ...createTemplate(), source: 'synthetic', results: corpus.cases.map(({ id, reference }) => ({ id, status: 'ok', text: reference, latencyMs: null, costUsd: null })) };
  const report = evaluateDictation(input);
  assert.equal(report.wer, 0);
  assert.equal(report.criticalFailures, 0);
  assert.equal(report.status, 'incomplete-or-synthetic');
  assert.equal(report.promotionAllowed, false);
});

test('duplicates, unknown IDs, hostile metadata and invalid measurements fail closed', () => {
  const valid = one('ru-01', 'Не открывай YouTube.');
  for (const invalid of [
    { ...valid, results: [...valid.results, ...valid.results] },
    { ...valid, provider: 'https://example.invalid/?key=secret' },
    { ...valid, source: 'unrecorded' },
    { ...valid, apiKey: 'not-a-key' },
    ...[{ id: 'unknown' }, { text: 'a'.repeat(1001) }, { latencyMs: -1 }, { costUsd: Infinity }, { status: 'cancelled' }].map((change) => ({ ...valid, results: [{ ...valid.results[0], ...change }] })),
  ]) assert.throws(() => evaluateDictation(invalid), /INVALID_EVALUATION_INPUT/);
});

test('report never includes transcript text and separates cancelled from missing results', () => {
  const input = one('ru-01', 'PRIVATE_TRANSCRIPT_MARKER');
  input.results.push({ id: 'ru-02', status: 'cancelled', text: null, latencyMs: null, costUsd: null });
  const report = evaluateDictation(input);
  assert.equal(report.cancelledCases, 1);
  assert.equal(report.missingCases, 28);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_TRANSCRIPT_MARKER/);
});

test('known charges include failed and cancelled calls without inventing missing measurements', () => {
  const input = one('ru-01', 'Не открывай YouTube.');
  input.results[0].costUsd = 0.125;
  input.results.push({ id: 'ru-02', status: 'error', text: null, latencyMs: 500, costUsd: 0.25 });
  input.results.push({ id: 'ru-03', status: 'cancelled', text: null, latencyMs: 250, costUsd: 0.125 });
  const report = evaluateDictation(input);
  assert.equal(report.knownCostUsd, 0.5);
  assert.equal(report.costComplete, false);
  assert.equal(report.latencySamples, 0);
  for (const status of ['missing', 'unrecorded']) {
    const invalid = structuredClone(input);
    if (status === 'missing') invalid.results[1].status = 'missing';
    else invalid.source = 'unrecorded';
    assert.throws(() => evaluateDictation(invalid), /INVALID_EVALUATION_INPUT/);
  }
});
