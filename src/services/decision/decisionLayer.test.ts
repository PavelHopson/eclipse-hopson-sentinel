import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DECISION_SCHEMA_VERSION,
  runDecisionSafely,
  summarizeDecisionEvaluations,
  validateDecisionEnvelope,
  type DecisionEngine,
} from './decisionLayer.ts'

type Route = 'ignore' | 'review' | 'escalate'

test('accepts a valid typed decision envelope', () => {
  const result = validateDecisionEnvelope<Route>(
    {
      schemaVersion: DECISION_SCHEMA_VERSION,
      decision: 'review',
      confidence: 0.82,
      reasonCodes: ['unknown-device', 'suspicious-pattern'],
      engine: 'fixture',
      model: null,
    },
    ['ignore', 'review', 'escalate'],
  )

  assert.equal(result.errors.length, 0)
  assert.equal(result.envelope?.decision, 'review')
  assert.equal(result.envelope?.confidence, 0.82)
})

test('rejects decisions outside the allowed enum', () => {
  const result = validateDecisionEnvelope<Route>(
    {
      schemaVersion: DECISION_SCHEMA_VERSION,
      decision: 'delete-account',
      confidence: 0.99,
      reasonCodes: ['bad-route'],
      engine: 'fixture',
    },
    ['ignore', 'review', 'escalate'],
  )

  assert.equal(result.envelope, null)
  assert.ok(result.errors.includes('decision must be one of the allowed decisions'))
})

test('rejects invalid confidence instead of silently clamping it', () => {
  const result = validateDecisionEnvelope<Route>(
    {
      schemaVersion: DECISION_SCHEMA_VERSION,
      decision: 'review',
      confidence: 1.2,
      reasonCodes: ['invalid-confidence'],
      engine: 'fixture',
    },
    ['ignore', 'review', 'escalate'],
  )

  assert.equal(result.envelope, null)
  assert.ok(
    result.errors.includes(
      'confidence must be a finite number between 0 and 1',
    ),
  )
})

test('shadow/recommendation runner can never authorize execution', async () => {
  const engine: DecisionEngine<Route> = {
    async decide() {
      return {
        schemaVersion: DECISION_SCHEMA_VERSION,
        decision: 'escalate',
        confidence: 0.91,
        reasonCodes: ['fixture'],
        engine: 'fixture',
      }
    },
  }

  const result = await runDecisionSafely(
    engine,
    {
      decisionId: 'incident-1',
      allowedDecisions: ['ignore', 'review', 'escalate'],
      context: { severity: 'unknown' },
    },
    'recommendation',
  )

  assert.equal(result.accepted, true)
  assert.equal(result.executionAuthorized, false)
  assert.equal(result.envelope?.decision, 'escalate')
})

test('engine failures are fail-closed and do not leak raw errors', async () => {
  const engine: DecisionEngine<Route> = {
    async decide() {
      throw new Error('secret provider detail')
    },
  }

  const result = await runDecisionSafely(engine, {
    decisionId: 'incident-2',
    allowedDecisions: ['ignore', 'review', 'escalate'],
    context: {},
  })

  assert.equal(result.accepted, false)
  assert.equal(result.executionAuthorized, false)
  assert.deepEqual(result.errors, ['decision engine failed'])
})

test('evaluation summary tracks accuracy and confidence calibration signals', () => {
  const summary = summarizeDecisionEvaluations<Route>([
    { expected: 'review', actual: 'review', confidence: 0.9 },
    { expected: 'ignore', actual: 'review', confidence: 0.8 },
    { expected: 'escalate', actual: 'escalate', confidence: 0.7 },
    { expected: 'ignore', actual: null, confidence: null },
  ])

  assert.equal(summary.total, 4)
  assert.equal(summary.valid, 3)
  assert.equal(summary.correct, 2)
  assert.equal(summary.accuracy, 0.5)
  assert.equal(summary.meanConfidenceOnCorrect, 0.8)
  assert.equal(summary.meanConfidenceOnIncorrect, 0.8)
})
