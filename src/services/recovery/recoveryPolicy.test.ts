import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_RECOVERY_POLICY,
  decideRecovery,
  type RecoveryState,
} from './recoveryPolicy.ts'

function state(overrides: Partial<RecoveryState> = {}): RecoveryState {
  return {
    consecutiveFailures: 0,
    noProgressSteps: 0,
    stepsSinceCheckpoint: 0,
    goalDriftDetected: false,
    criticalInvariantViolated: false,
    unexpectedExternalSideEffect: false,
    protectedResourceLost: false,
    ...overrides,
  }
}

test('healthy runs continue', () => {
  assert.deepEqual(decideRecovery(state()), {
    policyVersion: 'sentinel.recovery.v1',
    action: 'continue',
    reasonCode: 'healthy',
    requiresHumanApproval: false,
  })
})

test('checkpoint is requested before a long run drifts too far', () => {
  const decision = decideRecovery(
    state({
      stepsSinceCheckpoint: DEFAULT_RECOVERY_POLICY.maxStepsBetweenCheckpoints,
    }),
  )

  assert.equal(decision.action, 'checkpoint')
  assert.equal(decision.reasonCode, 'checkpoint-due')
})

test('repeated failures trigger replan instead of blind retry', () => {
  const decision = decideRecovery(
    state({
      consecutiveFailures: DEFAULT_RECOVERY_POLICY.maxConsecutiveFailures,
    }),
  )

  assert.equal(decision.action, 'replan')
  assert.equal(decision.reasonCode, 'failure-threshold')
})

test('lack of progress triggers replan', () => {
  const decision = decideRecovery(
    state({
      noProgressSteps: DEFAULT_RECOVERY_POLICY.maxNoProgressSteps,
    }),
  )

  assert.equal(decision.action, 'replan')
  assert.equal(decision.reasonCode, 'no-progress-threshold')
})

test('goal drift triggers a deterministic replan', () => {
  const decision = decideRecovery(state({ goalDriftDetected: true }))

  assert.equal(decision.action, 'replan')
  assert.equal(decision.reasonCode, 'goal-drift')
})

test('unexpected external side effects stop for human review', () => {
  const decision = decideRecovery(
    state({ unexpectedExternalSideEffect: true }),
  )

  assert.equal(decision.action, 'stop-for-human')
  assert.equal(decision.reasonCode, 'unexpected-side-effect')
  assert.equal(decision.requiresHumanApproval, true)
})

test('protected resource loss stops for human review', () => {
  const decision = decideRecovery(state({ protectedResourceLost: true }))

  assert.equal(decision.action, 'stop-for-human')
  assert.equal(decision.reasonCode, 'protected-resource-lost')
  assert.equal(decision.requiresHumanApproval, true)
})

test('invalid counters fail closed', () => {
  const decision = decideRecovery(state({ consecutiveFailures: -1 }))

  assert.equal(decision.action, 'stop-for-human')
  assert.equal(decision.requiresHumanApproval, true)
})
