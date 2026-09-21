import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  createRuntimeRecoveryObserver,
} from './runtimeRecoveryObserver.ts'
import { readSessionRecoveryJournal } from './sessionRecoveryJournal.ts'

test('runtime observer persists tool-batch evidence beside the transcript', t => {
  const dir = mkdtempSync(join(tmpdir(), 'sentinel-runtime-recovery-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const transcriptPath = join(dir, 'session.jsonl')
  const observer = createRuntimeRecoveryObserver({
    transcriptPath,
    now: () => '2026-09-21T12:30:00.000Z',
  })

  const snapshot = observer.observe([
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
  ])

  assert.equal(snapshot?.journalRecorded, true)

  const persisted = readSessionRecoveryJournal({ transcriptPath })
  assert.equal(persisted.entries.length, 1)
  assert.equal(persisted.entries[0]?.event, 'progress')
  assert.equal(persisted.entries[0]?.externalActionAuthorized, false)
})
