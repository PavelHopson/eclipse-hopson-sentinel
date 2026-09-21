import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  summarizeRecoveryJournal,
  type RecoveryDiagnosticsSummary,
} from './recoveryJournalDiagnostics.ts'
import {
  createRuntimeRecoveryObserver,
} from './runtimeRecoveryObserver.ts'
import {
  readSessionRecoveryJournal,
} from './sessionRecoveryJournal.ts'

export const RECOVERY_SHADOW_REPORT_VERSION =
  'sentinel.recovery-shadow-report.v1' as const

export type RecoveryShadowScenario =
  | 'healthy'
  | 'checkpoint'
  | 'replan'

export type RecoveryShadowReport = {
  reportVersion: typeof RECOVERY_SHADOW_REPORT_VERSION
  scenario: RecoveryShadowScenario
  observedBatches: number
  controlFlowAuthorized: false
  externalActionAuthorized: false
  automatedRollbackAuthorized: false
  summary: RecoveryDiagnosticsSummary
}

type ToolBatch = readonly [
  {
    type: 'user'
    message: {
      content: readonly [
        {
          type: 'tool_result'
          tool_use_id: string
          content: string
          is_error: boolean
        },
      ]
    }
  },
]

function toolBatch(
  id: number,
  isError: boolean,
): ToolBatch {
  return [
    {
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: `shadow-tool-${id}`,
            content: isError ? 'simulated failure' : 'simulated success',
            is_error: isError,
          },
        ],
      },
    },
  ]
}

function scenarioBatches(
  scenario: RecoveryShadowScenario,
): readonly ToolBatch[] {
  switch (scenario) {
    case 'healthy':
      return [toolBatch(1, false), toolBatch(2, false), toolBatch(3, false)]

    case 'checkpoint':
      return Array.from(
        { length: 8 },
        (_, index) => toolBatch(index + 1, false),
      )

    case 'replan':
      return [toolBatch(1, true), toolBatch(2, true), toolBatch(3, true)]
  }
}

export function runRecoveryShadowScenario(
  scenario: RecoveryShadowScenario,
): RecoveryShadowReport {
  const dir = mkdtempSync(join(tmpdir(), 'sentinel-recovery-shadow-'))
  const transcriptPath = join(dir, 'shadow-session.jsonl')

  try {
    let tick = 0
    const observer = createRuntimeRecoveryObserver({
      transcriptPath,
      now: () => {
        tick += 1
        return `2026-09-21T12:40:${String(tick).padStart(2, '0')}.000Z`
      },
    })

    const batches = scenarioBatches(scenario)

    for (const batch of batches) {
      observer.observe(batch)
    }

    const summary = summarizeRecoveryJournal(
      readSessionRecoveryJournal({ transcriptPath }),
    )

    return {
      reportVersion: RECOVERY_SHADOW_REPORT_VERSION,
      scenario,
      observedBatches: batches.length,
      controlFlowAuthorized: false,
      externalActionAuthorized: false,
      automatedRollbackAuthorized: false,
      summary,
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
