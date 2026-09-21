import {
  RecoveryToolBatchObserver,
} from './recoveryToolBatchObserver.ts'
import { SessionRecoveryJournalSink } from './sessionRecoveryJournal.ts'
import { SupervisedRecoverySession } from './supervisedRecoverySession.ts'

export type CreateRuntimeRecoveryObserverOptions = {
  transcriptPath: string
  now?: () => string
}

export function createRuntimeRecoveryObserver(
  options: CreateRuntimeRecoveryObserverOptions,
): RecoveryToolBatchObserver {
  const journal = new SessionRecoveryJournalSink({
    transcriptPath: options.transcriptPath,
  })

  const session = new SupervisedRecoverySession(
    undefined,
    undefined,
    {
      journal,
      now: options.now,
    },
  )

  return new RecoveryToolBatchObserver(session)
}
