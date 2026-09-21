import type { RecoveryDecision, RecoveryState } from './recoveryPolicy.ts'
import type { RecoverySignal, SupervisedRecoverySnapshot } from './supervisedRecoverySession.ts'

export const RECOVERY_JOURNAL_VERSION =
  'sentinel.recovery-journal.v1' as const

export type RecoveryJournalEventType =
  | RecoverySignal['type']
  | 'supervisor-reset'

export type RecoveryJournalEntry = {
  journalVersion: typeof RECOVERY_JOURNAL_VERSION
  sequence: number
  recordedAt: string
  event: RecoveryJournalEventType
  action: RecoveryDecision['action']
  reasonCode: RecoveryDecision['reasonCode']
  requiresHumanApproval: boolean
  mayContinueWithoutHuman: boolean
  checkpointPersistenceRequired: boolean
  automatedRollbackAuthorized: false
  externalActionAuthorized: false
  state: Pick<
    RecoveryState,
    | 'consecutiveFailures'
    | 'noProgressSteps'
    | 'stepsSinceCheckpoint'
    | 'goalDriftDetected'
    | 'criticalInvariantViolated'
    | 'unexpectedExternalSideEffect'
    | 'protectedResourceLost'
  >
}

export type RecoveryJournalSink = {
  append(entry: RecoveryJournalEntry): void
}

export type RecoveryJournalClock = () => string

export const MAX_IN_MEMORY_RECOVERY_JOURNAL_ENTRIES = 2_048

function cloneEntry(entry: RecoveryJournalEntry): RecoveryJournalEntry {
  return {
    ...entry,
    state: { ...entry.state },
  }
}

export function createRecoveryJournalEntry(input: {
  sequence: number
  event: RecoveryJournalEventType
  snapshot: SupervisedRecoverySnapshot
  recordedAt: string
}): RecoveryJournalEntry {
  if (!Number.isInteger(input.sequence) || input.sequence < 1) {
    throw new Error('recovery journal sequence must be a positive integer')
  }

  if (!input.recordedAt.trim() || !Number.isFinite(Date.parse(input.recordedAt))) {
    throw new Error('recovery journal recordedAt must be a valid timestamp')
  }

  return {
    journalVersion: RECOVERY_JOURNAL_VERSION,
    sequence: input.sequence,
    recordedAt: input.recordedAt,
    event: input.event,
    action: input.snapshot.decision.action,
    reasonCode: input.snapshot.decision.reasonCode,
    requiresHumanApproval: input.snapshot.decision.requiresHumanApproval,
    mayContinueWithoutHuman: input.snapshot.mayContinueWithoutHuman,
    checkpointPersistenceRequired:
      input.snapshot.checkpointPersistenceRequired,
    automatedRollbackAuthorized: false,
    externalActionAuthorized: false,
    state: {
      consecutiveFailures: input.snapshot.state.consecutiveFailures,
      noProgressSteps: input.snapshot.state.noProgressSteps,
      stepsSinceCheckpoint: input.snapshot.state.stepsSinceCheckpoint,
      goalDriftDetected: input.snapshot.state.goalDriftDetected,
      criticalInvariantViolated:
        input.snapshot.state.criticalInvariantViolated,
      unexpectedExternalSideEffect:
        input.snapshot.state.unexpectedExternalSideEffect,
      protectedResourceLost: input.snapshot.state.protectedResourceLost,
    },
  }
}

export class InMemoryRecoveryRunJournal implements RecoveryJournalSink {
  private readonly records: RecoveryJournalEntry[] = []
  private droppedEntries = 0

  constructor(
    private readonly maxEntries = MAX_IN_MEMORY_RECOVERY_JOURNAL_ENTRIES,
  ) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new Error('recovery journal maxEntries must be a positive integer')
    }
  }

  append(entry: RecoveryJournalEntry): void {
    if (this.records.length >= this.maxEntries) {
      this.droppedEntries += 1
      throw new Error('recovery journal capacity exceeded')
    }

    this.records.push(cloneEntry(entry))
  }

  entries(): readonly RecoveryJournalEntry[] {
    return this.records.map(cloneEntry)
  }

  diagnostics(): {
    storedEntries: number
    droppedEntries: number
    maxEntries: number
  } {
    return {
      storedEntries: this.records.length,
      droppedEntries: this.droppedEntries,
      maxEntries: this.maxEntries,
    }
  }
}
