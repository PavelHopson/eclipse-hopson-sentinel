import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createRecoveryJournalEntry,
  type RecoveryJournalEntry,
} from './recoveryRunJournal.ts'
import {
  RECOVERY_DIAGNOSTICS_VERSION,
  summarizeRecoveryJournal,
} from './recoveryJournalDiagnostics.ts'
import type {
  SessionRecoveryJournalReadResult,
} from './sessionRecoveryJournal.ts'
import { SupervisedRecoverySession } from './supervisedRecoverySession.ts'

function entry(
  sequence: number,
  signal:
    | 'progress'
    | 'failure'
    | 'unexpected-external-side-effect',
): RecoveryJournalEntry {
  const session = new SupervisedRecoverySession()

  let snapshot
  if (signal === 'progress') {
    snapshot = session.record({ type: 'progress' })
  } else if (signal === 'failure') {
    snapshot = session.record({ type: 'failure' })
  } else {
    snapshot = session.record({
      type: 'unexpected-external-side-effect',
    })
  }

  return createRecoveryJournalEntry({
    sequence,
    event: signal,
    snapshot,
    recordedAt: `2026-09-21T12:30:0${sequence}.000Z`,
  })
}

function readResult(
  entries: readonly RecoveryJournalEntry[],
  overrides: Partial<
    SessionRecoveryJournalReadResult['diagnostics']
  > = {},
): SessionRecoveryJournalReadResult {
  return {
    entries,
    diagnostics: {
      filePath: '/sensitive/local/path/session.recovery.jsonl',
      totalLines: entries.length,
      validEntries: entries.length,
      invalidLines: 0,
      truncatedEntries: 0,
      ...overrides,
    },
  }
}

test('healthy journal summary stays read-only and does not require attention', () => {
  const summary = summarizeRecoveryJournal(
    readResult([entry(1, 'progress'), entry(2, 'progress')]),
  )

  assert.equal(
    summary.diagnosticsVersion,
    RECOVERY_DIAGNOSTICS_VERSION,
  )
  assert.equal(summary.attentionRequired, false)
  assert.deepEqual(summary.attentionReasons, [])
  assert.equal(summary.events.progress, 2)
  assert.equal(summary.actions.continue, 2)
  assert.equal(summary.latest?.sequence, 2)
  assert.equal(summary.latest?.action, 'continue')
})

test('latest human-stop directive is surfaced without authorizing anything', () => {
  const summary = summarizeRecoveryJournal(
    readResult([
      entry(1, 'progress'),
      entry(2, 'unexpected-external-side-effect'),
    ]),
  )

  assert.equal(summary.attentionRequired, true)
  assert.deepEqual(summary.attentionReasons, [
    'human-approval-required',
  ])
  assert.equal(summary.latest?.action, 'stop-for-human')
  assert.equal(summary.latest?.requiresHumanApproval, true)

  const serialized = JSON.stringify(summary)
  assert.doesNotMatch(serialized, /automatedRollbackAuthorized/)
  assert.doesNotMatch(serialized, /externalActionAuthorized/)
})

test('journal corruption and truncated history are explicit attention signals', () => {
  const summary = summarizeRecoveryJournal(
    readResult([entry(4, 'failure')], {
      totalLines: 8,
      invalidLines: 2,
      truncatedEntries: 5,
    }),
  )

  assert.equal(summary.attentionRequired, true)
  assert.deepEqual(summary.attentionReasons, [
    'invalid-journal-lines',
    'truncated-journal-history',
  ])
  assert.equal(summary.invalidLines, 2)
  assert.equal(summary.truncatedEntries, 5)
})

test('summary never exposes local source file paths', () => {
  const summary = summarizeRecoveryJournal(
    readResult([entry(1, 'progress')]),
  )

  assert.doesNotMatch(
    JSON.stringify(summary),
    /sensitive\/local\/path/,
  )
  assert.ok(!('filePath' in summary))
})

test('empty journal produces an empty non-alerting diagnostic', () => {
  const summary = summarizeRecoveryJournal(readResult([]))

  assert.equal(summary.observedEntries, 0)
  assert.equal(summary.latest, null)
  assert.equal(summary.attentionRequired, false)
})
