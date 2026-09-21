import {
  DEFAULT_RECOVERY_POLICY,
  decideRecovery,
  type RecoveryDecision,
  type RecoveryPolicy,
  type RecoveryState,
} from './recoveryPolicy.ts'
import {
  createRecoveryJournalEntry,
  type RecoveryJournalClock,
  type RecoveryJournalEventType,
  type RecoveryJournalSink,
} from './recoveryRunJournal.ts'

export type RecoverySignal =
  | { type: 'progress' }
  | { type: 'no-progress' }
  | { type: 'failure' }
  | { type: 'checkpoint-persisted' }
  | { type: 'goal-drift' }
  | { type: 'critical-invariant' }
  | { type: 'unexpected-external-side-effect' }
  | { type: 'protected-resource-lost' }

export type SupervisedRecoverySnapshot = {
  state: RecoveryState
  decision: RecoveryDecision
  mayContinueWithoutHuman: boolean
  checkpointPersistenceRequired: boolean
  automatedRollbackAuthorized: false
  externalActionAuthorized: false
  journalRecorded: boolean
}

export type SupervisedRecoverySessionOptions = {
  journal?: RecoveryJournalSink
  now?: RecoveryJournalClock
}

const INITIAL_STATE: RecoveryState = {
  consecutiveFailures: 0,
  noProgressSteps: 0,
  stepsSinceCheckpoint: 0,
  goalDriftDetected: false,
  criticalInvariantViolated: false,
  unexpectedExternalSideEffect: false,
  protectedResourceLost: false,
}

function cloneState(state: RecoveryState): RecoveryState {
  return { ...state }
}

export class SupervisedRecoverySession {
  private state: RecoveryState
  private journalSequence = 0

  constructor(
    private readonly policy: RecoveryPolicy = DEFAULT_RECOVERY_POLICY,
    initialState: RecoveryState = INITIAL_STATE,
    private readonly options: SupervisedRecoverySessionOptions = {},
  ) {
    this.state = cloneState(initialState)
  }

  snapshot(): SupervisedRecoverySnapshot {
    const decision = decideRecovery(this.state, this.policy)
    return this.buildSnapshot(decision)
  }

  record(signal: RecoverySignal): SupervisedRecoverySnapshot {
    switch (signal.type) {
      case 'progress':
        this.state = {
          ...this.state,
          consecutiveFailures: 0,
          noProgressSteps: 0,
          stepsSinceCheckpoint: this.state.stepsSinceCheckpoint + 1,
        }
        break

      case 'no-progress':
        this.state = {
          ...this.state,
          consecutiveFailures: 0,
          noProgressSteps: this.state.noProgressSteps + 1,
          stepsSinceCheckpoint: this.state.stepsSinceCheckpoint + 1,
        }
        break

      case 'failure':
        this.state = {
          ...this.state,
          consecutiveFailures: this.state.consecutiveFailures + 1,
          noProgressSteps: this.state.noProgressSteps + 1,
          stepsSinceCheckpoint: this.state.stepsSinceCheckpoint + 1,
        }
        break

      case 'checkpoint-persisted':
        this.state = {
          ...this.state,
          stepsSinceCheckpoint: 0,
        }
        break

      case 'goal-drift':
        this.state = {
          ...this.state,
          goalDriftDetected: true,
        }
        break

      case 'critical-invariant':
        this.state = {
          ...this.state,
          criticalInvariantViolated: true,
        }
        break

      case 'unexpected-external-side-effect':
        this.state = {
          ...this.state,
          unexpectedExternalSideEffect: true,
        }
        break

      case 'protected-resource-lost':
        this.state = {
          ...this.state,
          protectedResourceLost: true,
        }
        break
    }

    const decision = decideRecovery(this.state, this.policy)
    return this.recordJournal(signal.type, this.buildSnapshot(decision))
  }

  clearReplanFlags(): SupervisedRecoverySnapshot {
    this.state = {
      ...this.state,
      goalDriftDetected: false,
      consecutiveFailures: 0,
      noProgressSteps: 0,
    }
    const decision = decideRecovery(this.state, this.policy)
    return this.recordJournal(
      'supervisor-reset',
      this.buildSnapshot(decision),
    )
  }

  private recordJournal(
    event: RecoveryJournalEventType,
    snapshot: SupervisedRecoverySnapshot,
  ): SupervisedRecoverySnapshot {
    const journal = this.options.journal
    if (!journal) {
      return snapshot
    }

    this.journalSequence += 1

    try {
      journal.append(
        createRecoveryJournalEntry({
          sequence: this.journalSequence,
          event,
          snapshot,
          recordedAt:
            this.options.now?.() ?? new Date().toISOString(),
        }),
      )
      return { ...snapshot, journalRecorded: true }
    } catch {
      return { ...snapshot, journalRecorded: false }
    }
  }

  private buildSnapshot(
    decision: RecoveryDecision,
  ): SupervisedRecoverySnapshot {
    return {
      state: cloneState(this.state),
      decision,
      mayContinueWithoutHuman:
        decision.action === 'continue' || decision.action === 'checkpoint',
      checkpointPersistenceRequired: decision.action === 'checkpoint',
      automatedRollbackAuthorized: false,
      externalActionAuthorized: false,
      journalRecorded: false,
    }
  }
}
