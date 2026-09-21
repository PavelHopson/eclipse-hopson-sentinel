import type { RecoverySignal } from './supervisedRecoverySession.ts'
import { SupervisedRecoverySession } from './supervisedRecoverySession.ts'

export type RecoverySimulationStep = {
  signal: RecoverySignal
  action: string
  reasonCode: string
  requiresHumanApproval: boolean
}

export function simulateSupervisedRecovery(
  signals: readonly RecoverySignal[],
): RecoverySimulationStep[] {
  const session = new SupervisedRecoverySession()
  const steps: RecoverySimulationStep[] = []

  for (const signal of signals) {
    const snapshot = session.record(signal)
    steps.push({
      signal,
      action: snapshot.decision.action,
      reasonCode: snapshot.decision.reasonCode,
      requiresHumanApproval: snapshot.decision.requiresHumanApproval,
    })

    if (snapshot.decision.action === 'stop-for-human') {
      break
    }
  }

  return steps
}
