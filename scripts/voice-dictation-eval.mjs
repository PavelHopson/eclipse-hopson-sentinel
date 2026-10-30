import { readFile, lstat, open } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const MAX_INPUT_BYTES = 128 * 1024;
const CASES = JSON.parse(await readFile(new URL('./fixtures/ru-dictation-v1.json', import.meta.url), 'utf8')).cases;
const PROVIDERS = new Set(['whisper-local', 'gemini-transcribe', 'other-local', 'other-cloud']);

/** Conservative normalization: do not remove negation, signs or numeric zeros. */
export function tokens(text) {
  return text.normalize('NFC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
    .match(/[+\-−]?\d+(?:[.,]\d+)*|[\p{L}\p{M}]+/gu)?.map((item) => item.replace(/−/g, '-').replace(/,/g, '.')) ?? [];
}

/** Levenshtein distance with linear memory. Inputs are bounded before this call. */
function distance(expected, actual) {
  let previous = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let i = 0; i < expected.length; i += 1) {
    const current = [i + 1];
    for (let j = 0; j < actual.length; j += 1) {
      current[j + 1] = Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + (expected[i] === actual[j] ? 0 : 1));
    }
    previous = current;
  }
  return previous[actual.length];
}

function exact(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
}
function requireValid(condition) { if (!condition) throw new Error('INVALID_EVALUATION_INPUT'); }
function countSequence(haystack, needle) {
  return haystack.reduce((count, _, start) => count + Number(needle.every((part, i) => haystack[start + i] === part)), 0);
}
function percentile(values, fraction) {
  return values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1] : null;
}

/** Creates empty slots, never fabricated model answers. Text is supplied locally after recording. */
export function createTemplate() {
  return {
    schemaVersion: 'eclipse.ru-dictation-results.v1', provider: 'whisper-local', source: 'unrecorded',
    results: CASES.map(({ id }) => ({ id, status: 'missing', text: null, latencyMs: null, costUsd: null })),
  };
}

/** Returns numeric evidence only; no dictated text, paths, credentials or model execution. */
export function evaluateDictation(input) {
  requireValid(exact(input, ['schemaVersion', 'provider', 'source', 'results']));
  requireValid(input.schemaVersion === 'eclipse.ru-dictation-results.v1' && PROVIDERS.has(input.provider));
  requireValid(['unrecorded', 'synthetic', 'recorded'].includes(input.source));
  requireValid(Array.isArray(input.results) && input.results.length <= CASES.length);
  const known = new Map(CASES.map((item) => [item.id, item]));
  const seen = new Set();
  const entries = [];
  const latencies = [];
  let wordErrors = 0, charErrors = 0, referenceWords = 0, referenceChars = 0, cost = 0, costsKnown = 0;
  let failed = 0, cancelled = 0, criticalFailures = 0;
  for (const item of input.results) {
    requireValid(exact(item, ['id', 'status', 'text', 'latencyMs', 'costUsd']));
    requireValid(known.has(item.id) && !seen.has(item.id));
    seen.add(item.id);
    requireValid(['ok', 'missing', 'error', 'cancelled'].includes(item.status));
    requireValid(item.latencyMs === null || (Number.isFinite(item.latencyMs) && item.latencyMs >= 0 && item.latencyMs <= 3_600_000));
    requireValid(item.costUsd === null || (Number.isFinite(item.costUsd) && item.costUsd >= 0 && item.costUsd <= 100));
    if (input.source === 'unrecorded') requireValid(item.status === 'missing');
    if (item.status === 'missing') requireValid(item.latencyMs === null && item.costUsd === null);
    // A failed or cancelled provider request can still be billed.
    if (item.costUsd !== null) { cost += item.costUsd; costsKnown += 1; }
    if (item.status !== 'ok') {
      requireValid(item.text === null);
      failed += Number(item.status === 'error');
      cancelled += Number(item.status === 'cancelled');
      continue;
    }
    requireValid(input.source !== 'unrecorded');
    requireValid(typeof item.text === 'string' && item.text.length <= 1000 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(item.text));
    const sample = known.get(item.id);
    const expected = tokens(sample.reference), actual = tokens(item.text);
    const expectedChars = [...expected.join('')], actualChars = [...actual.join('')];
    const words = distance(expected, actual), chars = distance(expectedChars, actualChars);
    const numeric = (parts) => parts.filter((part) => /^[+\-]?\d/.test(part));
    const numbersMatch = JSON.stringify(numeric(expected)) === JSON.stringify(numeric(actual));
    const termsMatch = sample.critical.every((term) => countSequence(expected, tokens(term)) === countSequence(actual, tokens(term)));
    const criticalMatch = numbersMatch && termsMatch;
    criticalFailures += Number(!criticalMatch);
    wordErrors += words; charErrors += chars;
    referenceWords += expected.length; referenceChars += expectedChars.length;
    if (item.latencyMs !== null) latencies.push(item.latencyMs);
    entries.push({ id: sample.id, group: sample.group, wordErrors: words, referenceWords: expected.length, charErrors: chars, referenceChars: expectedChars.length, criticalMatch });
  }
  return {
    schemaVersion: 'eclipse.ru-dictation-report.v1', provider: input.provider, source: input.source,
    status: entries.length === CASES.length && failed === 0 && cancelled === 0 && input.source === 'recorded' ? 'awaiting-human-review' : 'incomplete-or-synthetic',
    promotionAllowed: false, expectedCases: CASES.length, evaluatedCases: entries.length,
    missingCases: CASES.length - entries.length - failed - cancelled, failedCases: failed, cancelledCases: cancelled,
    wer: referenceWords ? wordErrors / referenceWords : null,
    cer: referenceChars ? charErrors / referenceChars : null,
    criticalFailures, latencySamples: latencies.length, latencyP50Ms: percentile(latencies, 0.5), latencyP95Ms: percentile(latencies, 0.95),
    knownCostUsd: costsKnown ? cost : null, costComplete: costsKnown === CASES.length,
    entries,
  };
}

async function main(args) {
  if (args.length === 1 && args[0] === '--template') return createTemplate();
  if (args.length === 0) return evaluateDictation(createTemplate());
  requireValid(args.length === 2 && args[0] === '--results');
  const stat = await lstat(args[1]);
  requireValid(stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_INPUT_BYTES);
  const handle = await open(args[1], 'r');
  try {
    requireValid((await handle.stat()).isFile());
    const buffer = Buffer.alloc(MAX_INPUT_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    requireValid(length <= MAX_INPUT_BYTES);
    return evaluateDictation(JSON.parse(buffer.subarray(0, length).toString('utf8')));
  } finally { await handle.close(); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { process.stdout.write(`${JSON.stringify(await main(process.argv.slice(2)), null, 2)}\n`); }
  catch { process.stderr.write('Проверка не выполнена: нужен локальный JSON результатов до 128 КБ, без лишних полей.\n'); process.exitCode = 1; }
}
