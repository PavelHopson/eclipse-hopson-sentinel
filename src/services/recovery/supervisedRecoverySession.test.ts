import assert from 'node:assert/strict'
import test from 'node:test'

import { SupervisedRecoverySession } from './supervisedRecoverySession.ts'

test('healthy progress requests a checkpoint at the configured boundary', () => {
  const session = new SupervisedRecoverySession({
    maxConsecutiveFailures: 3,
    maxNoProgressSteps: 5,
    maxStepsBetweenCheckpoints: 3,
  })

  assert.equal(session.record({ type: 'progress' }).decision.action, 'continue')
  assert.equal(session.record({ type: 'progress' }).decision.action, 'continue')

  const checkpoint = session.record({ type: 'progress' })
  assert.equal(checkpoint.decision.action, 'checkpoint')
  assert.equal(checkpoint.checkpointPersistenceRequired, true)
  assert.equal(checkpoint.mayContinueWithoutHuman, true)
  assert.equal(checkpoint.automatedRollbackAuthorized, false)
  assert.equal(checkpoint.externalActionAuthorized, false)

  const afterPersist = session.record({ type: 'checkpoint-persisted' })
  assert.equal(afterPersist.state.stepsSinceCheckpoint, 0)
  assert.equal(afterPersist.decision.action, 'continue')
})

test('three failures trigger replan rather than blind retry', () => {
  const session = new SupervisedRecoverySession()

  session.record({ type: 'failure' })
  session.record({ type: 'failure' })
  const decision = session.record({ type: 'failure' })

  assert.equal(decision.decision.action, 'replan')
  assert.equal(decision.decision.reasonCode, 'failure-threshold')
  assert.equal(decision.mayContinueWithoutHuman, false)
  assert.equal(decision.externalActionAuthorized, false)
})

test('no-progress budget triggers replan', () => {
  const session = new SupervisedRecoverySession({
    maxConsecutiveFailures: 3,
    maxNoProgressSteps: 2,
    maxStepsBetweenCheckpoints: 8,
  })

  session.record({ type: 'no-progress' })
  const decision = session.record({ type: 'no-progress' })

  assert.equal(decision.decision.action, 'replan')
  assert.equal(decision.decision.reasonCode, 'no-progress-threshold')
})

test('goal drift remains visible until the supervisor explicitly clears it', () => {
  const session = new SupervisedRecoverySession()

  const drift = session.record({ type: 'goal-drift' })
  assert.equal(drift.decision.action, 'replan')
  assert.equal(drift.state.goalDriftDetected, true)

  const cleared = session.clearReplanFlags()
  assert.equal(cleared.state.goalDriftDetected, false)
  assert.equal(cleared.decision.action, 'continue')
})

test('unexpected external side effects stop and cannot self-clear', () => {
  const session = new SupervisedRecoverySession()

  const stopped = session.record({
    type: 'unexpected-external-side-effect',
  })

  assert.equal(stopped.decision.action, 'stop-for-human')
  assert.equal(stopped.decision.requiresHumanApproval, true)
  assert.equal(stopped.mayContinueWithoutHuman, false)

  const afterClearAttempt = session.clearReplanFlags()
  assert.equal(afterClearAttempt.decision.action, 'stop-for-human')
  assert.equal(
    afterClearAttempt.state.unexpectedExternalSideEffect,
    true,
  )
})

test('protected resource loss stops the workflow', () => {
  const session = new SupervisedRecoverySession()

  const stopped = session.record({ type: 'protected-resource-lost' })

  assert.equal(stopped.decision.action, 'stop-for-human')
  assert.equal(stopped.decision.reasonCode, 'protected-resource-lost')
})

test('critical invariant violation stops the workflow', () => {
  const session = new SupervisedRecoverySession()

  const stopped = session.record({ type: 'critical-invariant' })

  assert.equal(stopped.decision.action, 'stop-for-human')
  assert.equal(stopped.decision.reasonCode, 'critical-invariant')
})
