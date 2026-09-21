import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createRecoveryJournalEntry,
  InMemoryRecoveryRunJournal,
  RECOVERY_JOURNAL_VERSION,
} from './recoveryRunJournal.ts'
import { SupervisedRecoverySession } from './supervisedRecoverySession.ts'

test('journal records bounded recovery directives without execution authority', () => {
  const journal = new InMemoryRecoveryRunJournal()
  const session = new SupervisedRecoverySession(
    undefined,
    undefined,
    {
      journal,
      now: () => '2026-09-21T12:00:00.000Z',
    },
  )

  session.record({ type: 'progress' })
  session.record({ type: 'failure' })

  const entries = journal.entries()
  assert.equal(entries.length, 2)
  assert.equal(entries[0]?.journalVersion, RECOVERY_JOURNAL_VERSION)
  assert.equal(entries[0]?.sequence, 1)
  assert.equal(entries[1]?.sequence, 2)
  assert.equal(entries[1]?.event, 'failure')
  assert.equal(entries[1]?.automatedRollbackAuthorized, false)
  assert.equal(entries[1]?.externalActionAuthorized, false)

  assert.deepEqual(Object.keys(entries[1] ?? {}).sort(), [
    'action',
    'automatedRollbackAuthorized',
    'checkpointPersistenceRequired',
    'event',
    'externalActionAuthorized',
    'journalVersion',
    'mayContinueWithoutHuman',
    'reasonCode',
    'recordedAt',
    'requiresHumanApproval',
    'sequence',
    'state',
  ])
})

test('returned entries are copies and cannot mutate stored journal state', () => {
  const journal = new InMemoryRecoveryRunJournal()
  const session = new SupervisedRecoverySession(
    undefined,
    undefined,
    {
      journal,
      now: () => '2026-09-21T12:00:00.000Z',
    },
  )

  session.record({ type: 'failure' })
  const first = journal.entries()[0]
  assert.ok(first)

  ;(first.state as { consecutiveFailures: number }).consecutiveFailures = 999

  const reread = journal.entries()[0]
  assert.equal(reread?.state.consecutiveFailures, 1)
})

test('capacity overflow is visible but does not authorize recovery actions', () => {
  const journal = new InMemoryRecoveryRunJournal(1)
  const session = new SupervisedRecoverySession(
    undefined,
    undefined,
    {
      journal,
      now: () => '2026-09-21T12:00:00.000Z',
    },
  )

  const first = session.record({ type: 'progress' })
  const second = session.record({ type: 'progress' })

  assert.equal(first.journalRecorded, true)
  assert.equal(second.journalRecorded, false)
  assert.equal(second.externalActionAuthorized, false)
  assert.equal(second.automatedRollbackAuthorized, false)
  assert.deepEqual(journal.diagnostics(), {
    storedEntries: 1,
    droppedEntries: 1,
    maxEntries: 1,
  })
})

test('supervisor reset is journaled explicitly', () => {
  const journal = new InMemoryRecoveryRunJournal()
  const session = new SupervisedRecoverySession(
    undefined,
    undefined,
    {
      journal,
      now: () => '2026-09-21T12:00:00.000Z',
    },
  )

  session.record({ type: 'goal-drift' })
  const reset = session.clearReplanFlags()

  assert.equal(reset.journalRecorded, true)
  assert.equal(journal.entries()[1]?.event, 'supervisor-reset')
  assert.equal(journal.entries()[1]?.action, 'continue')
})

test('entry builder rejects invalid journal metadata', () => {
  const session = new SupervisedRecoverySession()
  const snapshot = session.snapshot()

  assert.throws(
    () =>
      createRecoveryJournalEntry({
        sequence: 0,
        event: 'progress',
        snapshot,
        recordedAt: '2026-09-21T12:00:00.000Z',
      }),
    /positive integer/,
  )

  assert.throws(
    () =>
      createRecoveryJournalEntry({
        sequence: 1,
        event: 'progress',
        snapshot,
        recordedAt: 'not-a-date',
      }),
    /valid timestamp/,
  )
})


test('journal failure cannot mask a human-stop recovery decision', () => {
  const session = new SupervisedRecoverySession(
    undefined,
    undefined,
    {
      journal: {
        append() {
          throw new Error('journal unavailable')
        },
      },
      now: () => '2026-09-21T12:00:00.000Z',
    },
  )

  const stopped = session.record({
    type: 'unexpected-external-side-effect',
  })

  assert.equal(stopped.journalRecorded, false)
  assert.equal(stopped.decision.action, 'stop-for-human')
  assert.equal(stopped.decision.requiresHumanApproval, true)
  assert.equal(stopped.mayContinueWithoutHuman, false)
  assert.equal(stopped.externalActionAuthorized, false)
  assert.equal(stopped.automatedRollbackAuthorized, false)
})
