import assert from 'node:assert/strict'
import test from 'node:test'

import {
  RECOVERY_SHADOW_REPORT_VERSION,
  runRecoveryShadowScenario,
} from './recoveryShadowHarness.ts'

test('healthy shadow scenario stays non-alerting', () => {
  const report = runRecoveryShadowScenario('healthy')

  assert.equal(report.reportVersion, RECOVERY_SHADOW_REPORT_VERSION)
  assert.equal(report.observedBatches, 3)
  assert.equal(report.summary.attentionRequired, false)
  assert.equal(report.summary.latest?.action, 'continue')
  assert.equal(report.summary.events.progress, 3)
  assert.equal(report.controlFlowAuthorized, false)
  assert.equal(report.externalActionAuthorized, false)
  assert.equal(report.automatedRollbackAuthorized, false)
})

test('checkpoint shadow scenario exercises persisted checkpoint directive', () => {
  const report = runRecoveryShadowScenario('checkpoint')

  assert.equal(report.observedBatches, 8)
  assert.equal(report.summary.latest?.action, 'checkpoint')
  assert.equal(report.summary.actions.checkpoint, 1)
  assert.equal(report.summary.attentionRequired, false)
  assert.equal(report.controlFlowAuthorized, false)
})

test('replan shadow scenario surfaces attention after three failed batches', () => {
  const report = runRecoveryShadowScenario('replan')

  assert.equal(report.observedBatches, 3)
  assert.equal(report.summary.latest?.action, 'replan')
  assert.equal(report.summary.latest?.reasonCode, 'failure-threshold')
  assert.equal(report.summary.events.failure, 3)
  assert.equal(report.summary.actions.replan, 1)
  assert.equal(report.summary.attentionRequired, true)
  assert.deepEqual(report.summary.attentionReasons, ['latest-replan'])
  assert.equal(report.controlFlowAuthorized, false)
})

test('shadow report does not expose temp paths or raw tool content', () => {
  const serialized = JSON.stringify(
    runRecoveryShadowScenario('replan'),
  )

  assert.doesNotMatch(serialized, /sentinel-recovery-shadow-/)
  assert.doesNotMatch(serialized, /simulated failure/)
  assert.doesNotMatch(serialized, /shadow-tool-/)
  assert.doesNotMatch(serialized, /tmpdir/)
})
