import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assessCandidateForCanaryReview,
  DECISION_PROMOTION_GATE_VERSION,
} from './decisionPromotionGate.ts'
import {
  DECISION_SHADOW_REPORT_VERSION,
  type DecisionShadowReport,
} from './shadowReport.ts'

function report(overrides: Partial<DecisionShadowReport> = {}): DecisionShadowReport {
  return {
    schemaVersion: DECISION_SHADOW_REPORT_VERSION,
    generatedAt: '2026-09-21T12:00:00.000Z',
    engineId: 'engine',
    provider: 'provider',
    model: 'model',
    corpus: 'seed',
    caseCount: 3,
    metrics: {
      accuracy: 1,
      valid: 3,
      correct: 3,
      invalidRate: 0,
      meanConfidenceOnCorrect: 0.8,
      meanConfidenceOnIncorrect: null,
      meanLatencyMs: 100,
      p50LatencyMs: 100,
      p95LatencyMs: 120,
    },
    cases: [
      {
        id: 'ignore-case',
        expected: 'ignore',
        actual: 'ignore',
        confidence: 0.8,
        accepted: true,
        elapsedMs: 90,
        errors: [],
      },
      {
        id: 'review-case',
        expected: 'review',
        actual: 'review',
        confidence: 0.8,
        accepted: true,
        elapsedMs: 100,
        errors: [],
      },
      {
        id: 'escalate-case',
        expected: 'escalate',
        actual: 'escalate',
        confidence: 0.8,
        accepted: true,
        elapsedMs: 120,
        errors: [],
      },
    ],
    ...overrides,
  }
}

test('passing the gate still never authorizes canary traffic', () => {
  const baseline = report()
  const candidate = report({
    engineId: 'candidate',
    model: 'candidate-model',
    metrics: {
      ...report().metrics,
      meanLatencyMs: 90,
      p50LatencyMs: 90,
      p95LatencyMs: 100,
    },
  })

  const result = assessCandidateForCanaryReview(baseline, candidate, {
    criticalExpectedDecisions: ['escalate'],
  })

  assert.equal(result.gateVersion, DECISION_PROMOTION_GATE_VERSION)
  assert.equal(result.eligibleForCanaryReview, true)
  assert.equal(result.canaryAuthorized, false)
  assert.deepEqual(result.blockingReasons, [])
})

test('blocks a candidate that regresses baseline-correct cases', () => {
  const baseline = report()
  const candidate = report({
    engineId: 'candidate',
    metrics: {
      ...report().metrics,
      accuracy: 2 / 3,
      correct: 2,
      meanConfidenceOnIncorrect: 0.9,
    },
    cases: report().cases.map(item =>
      item.id === 'review-case'
        ? { ...item, actual: 'ignore', confidence: 0.9 }
        : item,
    ),
  })

  const result = assessCandidateForCanaryReview(baseline, candidate)

  assert.equal(result.eligibleForCanaryReview, false)
  assert.ok(
    result.blockingReasons.includes('candidate accuracy is below baseline'),
  )
  assert.deepEqual(result.baselineCorrectRegressions, ['review-case'])
})

test('critical escalate regression is always blocking', () => {
  const baseline = report()
  const candidate = report({
    engineId: 'candidate',
    metrics: {
      ...report().metrics,
      accuracy: 2 / 3,
      correct: 2,
    },
    cases: report().cases.map(item =>
      item.id === 'escalate-case'
        ? { ...item, actual: 'review' }
        : item,
    ),
  })

  const result = assessCandidateForCanaryReview(baseline, candidate, {
    criticalExpectedDecisions: ['escalate'],
  })

  assert.equal(result.eligibleForCanaryReview, false)
  assert.deepEqual(result.criticalRegressions, ['escalate-case'])
  assert.ok(
    result.blockingReasons.includes('candidate has critical decision regressions'),
  )
})

test('latency regression is a warning, not automatic authority or rejection', () => {
  const baseline = report()
  const candidate = report({
    engineId: 'candidate',
    metrics: {
      ...report().metrics,
      meanLatencyMs: 900,
      p50LatencyMs: 900,
      p95LatencyMs: 1_500,
    },
  })

  const result = assessCandidateForCanaryReview(baseline, candidate)

  assert.equal(result.eligibleForCanaryReview, true)
  assert.equal(result.canaryAuthorized, false)
  assert.ok(
    result.warnings.includes(
      'candidate p95 latency materially exceeds baseline',
    ),
  )
})

test('mismatched corpus or case labels fail closed', () => {
  const baseline = report()
  const candidate = report({
    corpus: 'other-corpus',
    cases: report().cases.map(item =>
      item.id === 'review-case'
        ? { ...item, expected: 'ignore' }
        : item,
    ),
  })

  const result = assessCandidateForCanaryReview(baseline, candidate)

  assert.equal(result.eligibleForCanaryReview, false)
  assert.ok(
    result.blockingReasons.includes(
      'baseline and candidate must use the same corpus',
    ),
  )
  assert.ok(
    result.blockingReasons.includes(
      'expected label mismatch for case: review-case',
    ),
  )
})
