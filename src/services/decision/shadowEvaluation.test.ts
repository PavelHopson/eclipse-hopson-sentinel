import assert from 'node:assert/strict'
import test from 'node:test'

import { DECISION_SCHEMA_VERSION, type DecisionEngine } from './decisionLayer.ts'
import {
  compareShadowReports,
  evaluateDecisionEngineInShadow,
  type DecisionCorpusCase,
} from './shadowEvaluation.ts'

type Route = 'ignore' | 'review' | 'escalate'

const corpus: DecisionCorpusCase<Route>[] = [
  {
    id: 'c1',
    expected: 'ignore',
    allowedDecisions: ['ignore', 'review', 'escalate'],
    context: { known: true },
  },
  {
    id: 'c2',
    expected: 'review',
    allowedDecisions: ['ignore', 'review', 'escalate'],
    context: { known: false },
  },
  {
    id: 'c3',
    expected: 'escalate',
    allowedDecisions: ['ignore', 'review', 'escalate'],
    context: { critical: true },
  },
]

function engine(outputs: Array<Route | 'invalid'>): DecisionEngine<Route> {
  let index = 0
  return {
    async decide() {
      const output = outputs[index++] ?? 'invalid'
      if (output === 'invalid') {
        return { nope: true }
      }
      return {
        schemaVersion: DECISION_SCHEMA_VERSION,
        decision: output,
        confidence: 0.8,
        reasonCodes: ['fixture'],
        engine: 'fixture',
      }
    },
  }
}

test('produces deterministic shadow metrics without authorizing actions', async () => {
  let clock = 0
  const report = await evaluateDecisionEngineInShadow(
    'baseline',
    engine(['ignore', 'review', 'escalate']),
    corpus,
    () => {
      clock += 5
      return clock
    },
  )

  assert.equal(report.evaluation.accuracy, 1)
  assert.equal(report.invalidRate, 0)
  assert.equal(report.meanLatencyMs, 5)
  assert.equal(report.p50LatencyMs, 5)
  assert.equal(report.p95LatencyMs, 5)
  assert.equal(report.cases.length, 3)
})

test('counts invalid envelopes separately from wrong decisions', async () => {
  const report = await evaluateDecisionEngineInShadow(
    'candidate',
    engine(['ignore', 'invalid', 'review']),
    corpus,
    () => 0,
  )

  assert.equal(report.evaluation.total, 3)
  assert.equal(report.evaluation.valid, 2)
  assert.equal(report.evaluation.correct, 1)
  assert.equal(report.evaluation.accuracy, 0.3333)
  assert.equal(report.invalidRate, 0.3333)
})

test('compares candidate deltas against a fixed baseline', async () => {
  const baseline = await evaluateDecisionEngineInShadow(
    'baseline',
    engine(['ignore', 'review', 'escalate']),
    corpus,
    () => 0,
  )
  const candidate = await evaluateDecisionEngineInShadow(
    'candidate',
    engine(['ignore', 'review', 'review']),
    corpus,
    () => 0,
  )

  const comparison = compareShadowReports(baseline, candidate)
  assert.equal(comparison.accuracyDelta, -0.3333)
  assert.equal(comparison.invalidRateDelta, 0)
})
