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

export type RecoveryJournalValidation = {
  entry: RecoveryJournalEntry | null
  errors: readonly string[]
}

export const MAX_IN_MEMORY_RECOVERY_JOURNAL_ENTRIES = 2_048

const EVENTS = new Set<RecoveryJournalEventType>([
  'progress',
  'no-progress',
  'failure',
  'checkpoint-persisted',
  'goal-drift',
  'critical-invariant',
  'unexpected-external-side-effect',
  'protected-resource-lost',
  'supervisor-reset',
])

const ACTIONS = new Set<RecoveryDecision['action']>([
  'continue',
  'checkpoint',
  'replan',
  'stop-for-human',
])

const REASONS = new Set<RecoveryDecision['reasonCode']>([
  'healthy',
  'checkpoint-due',
  'failure-threshold',
  'no-progress-threshold',
  'goal-drift',
  'critical-invariant',
  'unexpected-side-effect',
  'protected-resource-lost',
])

const ACTION_BY_REASON: Record<
  RecoveryDecision['reasonCode'],
  RecoveryDecision['action']
> = {
  healthy: 'continue',
  'checkpoint-due': 'checkpoint',
  'failure-threshold': 'replan',
  'no-progress-threshold': 'replan',
  'goal-drift': 'replan',
  'critical-invariant': 'stop-for-human',
  'unexpected-side-effect': 'stop-for-human',
  'protected-resource-lost': 'stop-for-human',
}

function cloneEntry(entry: RecoveryJournalEntry): RecoveryJournalEntry {
  return {
    ...entry,
    state: { ...entry.state },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export function validateRecoveryJournalEntry(
  value: unknown,
): RecoveryJournalValidation {
  const errors: string[] = []

  if (!isRecord(value)) {
    return { entry: null, errors: ['journal entry must be an object'] }
  }

  if (value.journalVersion !== RECOVERY_JOURNAL_VERSION) {
    errors.push(`journalVersion must be ${RECOVERY_JOURNAL_VERSION}`)
  }

  if (
    typeof value.sequence !== 'number' ||
    !Number.isInteger(value.sequence) ||
    value.sequence < 1
  ) {
    errors.push('sequence must be a positive integer')
  }

  if (
    typeof value.recordedAt !== 'string' ||
    !value.recordedAt.trim() ||
    !Number.isFinite(Date.parse(value.recordedAt))
  ) {
    errors.push('recordedAt must be a valid timestamp')
  }

  if (
    typeof value.event !== 'string' ||
    !EVENTS.has(value.event as RecoveryJournalEventType)
  ) {
    errors.push('event must be a known recovery journal event')
  }

  if (
    typeof value.action !== 'string' ||
    !ACTIONS.has(value.action as RecoveryDecision['action'])
  ) {
    errors.push('action must be a known recovery action')
  }

  if (
    typeof value.reasonCode !== 'string' ||
    !REASONS.has(value.reasonCode as RecoveryDecision['reasonCode'])
  ) {
    errors.push('reasonCode must be a known recovery reason')
  }

  if (
    typeof value.reasonCode === 'string' &&
    REASONS.has(value.reasonCode as RecoveryDecision['reasonCode']) &&
    typeof value.action === 'string' &&
    ACTIONS.has(value.action as RecoveryDecision['action']) &&
    ACTION_BY_REASON[value.reasonCode as RecoveryDecision['reasonCode']] !==
      value.action
  ) {
    errors.push('action must match reasonCode')
  }

  for (const field of [
    'requiresHumanApproval',
    'mayContinueWithoutHuman',
    'checkpointPersistenceRequired',
  ] as const) {
    if (typeof value[field] !== 'boolean') {
      errors.push(`${field} must be boolean`)
    }
  }

  if (value.automatedRollbackAuthorized !== false) {
    errors.push('automatedRollbackAuthorized must be false')
  }

  if (value.externalActionAuthorized !== false) {
    errors.push('externalActionAuthorized must be false')
  }

  if (
    typeof value.action === 'string' &&
    ACTIONS.has(value.action as RecoveryDecision['action'])
  ) {
    const action = value.action as RecoveryDecision['action']
    const shouldRequireHuman = action === 'stop-for-human'
    const mayContinue = action === 'continue' || action === 'checkpoint'
    const checkpointRequired = action === 'checkpoint'

    if (value.requiresHumanApproval !== shouldRequireHuman) {
      errors.push('requiresHumanApproval is inconsistent with action')
    }
    if (value.mayContinueWithoutHuman !== mayContinue) {
      errors.push('mayContinueWithoutHuman is inconsistent with action')
    }
    if (value.checkpointPersistenceRequired !== checkpointRequired) {
      errors.push('checkpointPersistenceRequired is inconsistent with action')
    }
  }

  if (!isRecord(value.state)) {
    errors.push('state must be an object')
  } else {
    for (const field of [
      'consecutiveFailures',
      'noProgressSteps',
      'stepsSinceCheckpoint',
    ] as const) {
      if (!isNonNegativeInteger(value.state[field])) {
        errors.push(`state.${field} must be a non-negative integer`)
      }
    }

    for (const field of [
      'goalDriftDetected',
      'criticalInvariantViolated',
      'unexpectedExternalSideEffect',
      'protectedResourceLost',
    ] as const) {
      if (typeof value.state[field] !== 'boolean') {
        errors.push(`state.${field} must be boolean`)
      }
    }
  }

  if (errors.length > 0) {
    return { entry: null, errors }
  }

  return {
    entry: cloneEntry(value as unknown as RecoveryJournalEntry),
    errors: [],
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

  const entry: RecoveryJournalEntry = {
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

  const validation = validateRecoveryJournalEntry(entry)
  if (!validation.entry) {
    throw new Error(
      `invalid recovery journal entry: ${validation.errors.join('; ')}`,
    )
  }

  return entry
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
    const validation = validateRecoveryJournalEntry(entry)
    if (!validation.entry) {
      throw new Error(
        `invalid recovery journal entry: ${validation.errors.join('; ')}`,
      )
    }

    if (this.records.length >= this.maxEntries) {
      this.droppedEntries += 1
      throw new Error('recovery journal capacity exceeded')
    }

    this.records.push(cloneEntry(validation.entry))
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
