import assert from 'node:assert/strict'
import test from 'node:test'

import { InMemoryRecoveryRunJournal } from './recoveryRunJournal.ts'
import {
  classifyToolBatchRecoverySignal,
  RecoveryToolBatchObserver,
} from './recoveryToolBatchObserver.ts'
import { SupervisedRecoverySession } from './supervisedRecoverySession.ts'

test('classifies successful tool batches as progress', () => {
  assert.deepEqual(
    classifyToolBatchRecoverySignal([
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-1',
              content: 'ok',
              is_error: false,
            },
          ],
        },
      },
    ]),
    { type: 'progress' },
  )
})

test('any explicit tool error makes the observed batch a failure', () => {
  assert.deepEqual(
    classifyToolBatchRecoverySignal([
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-1',
              content: 'ok',
            },
            {
              type: 'tool_result',
              tool_use_id: 'tool-2',
              content: 'boom',
              is_error: true,
            },
          ],
        },
      },
    ]),
    { type: 'failure' },
  )
})

test('non-tool-result messages produce no recovery signal', () => {
  assert.equal(
    classifyToolBatchRecoverySignal([
      {
        type: 'user',
        message: { content: [{ type: 'text', text: 'hello' }] },
      },
    ]),
    null,
  )
})

test('observer records directives but grants no execution authority', () => {
  const journal = new InMemoryRecoveryRunJournal()
  const session = new SupervisedRecoverySession(
    undefined,
    undefined,
    {
      journal,
      now: () => '2026-09-21T12:30:00.000Z',
    },
  )
  const observer = new RecoveryToolBatchObserver(session)

  const snapshot = observer.observe([
    {
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-1',
            content: 'failed',
            is_error: true,
          },
        ],
      },
    },
  ])

  assert.ok(snapshot)
  assert.equal(snapshot.decision.action, 'continue')
  assert.equal(snapshot.journalRecorded, true)
  assert.equal(snapshot.externalActionAuthorized, false)
  assert.equal(snapshot.automatedRollbackAuthorized, false)
  assert.equal(journal.entries()[0]?.event, 'failure')
})

test('observer reaches replan evidence after repeated failed batches without controlling flow', () => {
  const observer = new RecoveryToolBatchObserver(
    new SupervisedRecoverySession(),
  )

  const failedBatch = [
    {
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-1',
            content: 'failed',
            is_error: true,
          },
        ],
      },
    },
  ] as const

  observer.observe(failedBatch)
  observer.observe(failedBatch)
  const third = observer.observe(failedBatch)

  assert.equal(third?.decision.action, 'replan')
  assert.equal(third?.mayContinueWithoutHuman, false)
  assert.equal(third?.externalActionAuthorized, false)
})
