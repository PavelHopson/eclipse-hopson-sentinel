import assert from 'node:assert/strict'
import test from 'node:test'

import { runDecisionSafely } from './decisionLayer.ts'
import { StructuredOutputDecisionEngine } from './structuredOutputDecisionEngine.ts'

type Route = 'ignore' | 'review' | 'escalate'

test('wraps trusted engine metadata around structured output', async () => {
  const engine = new StructuredOutputDecisionEngine<Route>(
    async input => {
      assert.deepEqual(input.allowedDecisions, ['ignore', 'review', 'escalate'])
      assert.match(input.instruction, /Do not execute tools/)
      return {
        decision: 'review',
        confidence: 0.76,
        reasonCodes: ['unknown-device'],
        engine: 'untrusted-model-value',
        model: 'untrusted-model-value',
      }
    },
    { engineName: 'sentinel-baseline', model: 'baseline-model' },
  )

  const result = await runDecisionSafely(engine, {
    decisionId: 'case-1',
    allowedDecisions: ['ignore', 'review', 'escalate'],
    context: { deviceKnown: false },
  })

  assert.equal(result.accepted, true)
  assert.equal(result.envelope?.engine, 'sentinel-baseline')
  assert.equal(result.envelope?.model, 'baseline-model')
  assert.equal(result.envelope?.decision, 'review')
  assert.equal(result.executionAuthorized, false)
})

test('does not repair invalid model output silently', async () => {
  const engine = new StructuredOutputDecisionEngine<Route>(async () => ({
    decision: 'delete-account',
    confidence: 3,
    reasonCodes: ['bad'],
  }))

  const result = await runDecisionSafely(engine, {
    decisionId: 'case-2',
    allowedDecisions: ['ignore', 'review', 'escalate'],
    context: {},
  })

  assert.equal(result.accepted, false)
  assert.ok(result.errors.length >= 2)
  assert.equal(result.executionAuthorized, false)
})

test('preserves fail-closed handling for non-object responses', async () => {
  const engine = new StructuredOutputDecisionEngine<Route>(
    async () => 'not-json',
  )

  const result = await runDecisionSafely(engine, {
    decisionId: 'case-3',
    allowedDecisions: ['ignore', 'review', 'escalate'],
    context: {},
  })

  assert.equal(result.accepted, false)
  assert.deepEqual(result.errors, ['decision envelope must be an object'])
})
