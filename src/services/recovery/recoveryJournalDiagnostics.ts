import type {
  RecoveryAction,
  RecoveryDecision,
} from './recoveryPolicy.ts'
import type {
  RecoveryJournalEntry,
  RecoveryJournalEventType,
} from './recoveryRunJournal.ts'
import type {
  SessionRecoveryJournalDiagnostics,
  SessionRecoveryJournalReadResult,
} from './sessionRecoveryJournal.ts'

export const RECOVERY_DIAGNOSTICS_VERSION =
  'sentinel.recovery-diagnostics.v1' as const

export type RecoveryDiagnosticsAttentionReason =
  | 'human-approval-required'
  | 'latest-replan'
  | 'invalid-journal-lines'
  | 'truncated-journal-history'

export type RecoveryDiagnosticsSummary = {
  diagnosticsVersion: typeof RECOVERY_DIAGNOSTICS_VERSION
  observedEntries: number
  invalidLines: number
  truncatedEntries: number
  attentionRequired: boolean
  attentionReasons: readonly RecoveryDiagnosticsAttentionReason[]
  events: Record<RecoveryJournalEventType, number>
  actions: Record<RecoveryAction, number>
  latest: {
    sequence: number
    recordedAt: string
    event: RecoveryJournalEventType
    action: RecoveryAction
    reasonCode: RecoveryDecision['reasonCode']
    requiresHumanApproval: boolean
    journalState: {
      consecutiveFailures: number
      noProgressSteps: number
      stepsSinceCheckpoint: number
      goalDriftDetected: boolean
      criticalInvariantViolated: boolean
      unexpectedExternalSideEffect: boolean
      protectedResourceLost: boolean
    }
  } | null
}

const EVENT_KEYS: readonly RecoveryJournalEventType[] = [
  'progress',
  'no-progress',
  'failure',
  'checkpoint-persisted',
  'goal-drift',
  'critical-invariant',
  'unexpected-external-side-effect',
  'protected-resource-lost',
  'supervisor-reset',
]

const ACTION_KEYS: readonly RecoveryAction[] = [
  'continue',
  'checkpoint',
  'replan',
  'stop-for-human',
]

function zeroedRecord<T extends string>(
  keys: readonly T[],
): Record<T, number> {
  return Object.fromEntries(keys.map(key => [key, 0])) as Record<T, number>
}

function latestEntry(
  entries: readonly RecoveryJournalEntry[],
): RecoveryJournalEntry | null {
  let latest: RecoveryJournalEntry | null = null

  for (const entry of entries) {
    if (
      latest === null ||
      entry.sequence > latest.sequence ||
      (entry.sequence === latest.sequence &&
        Date.parse(entry.recordedAt) > Date.parse(latest.recordedAt))
    ) {
      latest = entry
    }
  }

  return latest
}

function buildAttentionReasons(
  latest: RecoveryJournalEntry | null,
  diagnostics: Pick<
    SessionRecoveryJournalDiagnostics,
    'invalidLines' | 'truncatedEntries'
  >,
): RecoveryDiagnosticsAttentionReason[] {
  const reasons: RecoveryDiagnosticsAttentionReason[] = []

  if (latest?.requiresHumanApproval) {
    reasons.push('human-approval-required')
  } else if (latest?.action === 'replan') {
    reasons.push('latest-replan')
  }

  if (diagnostics.invalidLines > 0) {
    reasons.push('invalid-journal-lines')
  }

  if (diagnostics.truncatedEntries > 0) {
    reasons.push('truncated-journal-history')
  }

  return reasons
}

export function summarizeRecoveryJournal(
  readResult: SessionRecoveryJournalReadResult,
): RecoveryDiagnosticsSummary {
  const events = zeroedRecord(EVENT_KEYS)
  const actions = zeroedRecord(ACTION_KEYS)

  for (const entry of readResult.entries) {
    events[entry.event] += 1
    actions[entry.action] += 1
  }

  const latest = latestEntry(readResult.entries)
  const attentionReasons = buildAttentionReasons(
    latest,
    readResult.diagnostics,
  )

  return {
    diagnosticsVersion: RECOVERY_DIAGNOSTICS_VERSION,
    observedEntries: readResult.entries.length,
    invalidLines: readResult.diagnostics.invalidLines,
    truncatedEntries: readResult.diagnostics.truncatedEntries,
    attentionRequired: attentionReasons.length > 0,
    attentionReasons,
    events,
    actions,
    latest: latest
      ? {
          sequence: latest.sequence,
          recordedAt: latest.recordedAt,
          event: latest.event,
          action: latest.action,
          reasonCode: latest.reasonCode,
          requiresHumanApproval: latest.requiresHumanApproval,
          journalState: {
            consecutiveFailures: latest.state.consecutiveFailures,
            noProgressSteps: latest.state.noProgressSteps,
            stepsSinceCheckpoint: latest.state.stepsSinceCheckpoint,
            goalDriftDetected: latest.state.goalDriftDetected,
            criticalInvariantViolated:
              latest.state.criticalInvariantViolated,
            unexpectedExternalSideEffect:
              latest.state.unexpectedExternalSideEffect,
            protectedResourceLost: latest.state.protectedResourceLost,
          },
        }
      : null,
  }
}
