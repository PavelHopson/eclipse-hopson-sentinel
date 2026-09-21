import assert from 'node:assert/strict'
import test from 'node:test'

import { simulateSupervisedRecovery } from './recoverySimulation.ts'

test('failure injection shows replan before unsafe continuation', () => {
  const steps = simulateSupervisedRecovery([
    { type: 'progress' },
    { type: 'failure' },
    { type: 'failure' },
    { type: 'failure' },
    { type: 'progress' },
  ])

  assert.equal(steps.length, 5)
  assert.equal(steps[3]?.action, 'replan')
  assert.equal(steps[3]?.reasonCode, 'failure-threshold')
})

test('external side-effect injection terminates the simulation immediately', () => {
  const steps = simulateSupervisedRecovery([
    { type: 'progress' },
    { type: 'unexpected-external-side-effect' },
    { type: 'progress' },
  ])

  assert.equal(steps.length, 2)
  assert.equal(steps[1]?.action, 'stop-for-human')
  assert.equal(steps[1]?.requiresHumanApproval, true)
})
