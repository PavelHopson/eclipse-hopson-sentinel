export const RECOVERY_POLICY_VERSION = 'sentinel.recovery.v1' as const

export type RecoveryAction =
  | 'continue'
  | 'checkpoint'
  | 'replan'
  | 'stop-for-human'

export type RecoveryState = {
  consecutiveFailures: number
  noProgressSteps: number
  stepsSinceCheckpoint: number
  goalDriftDetected: boolean
  criticalInvariantViolated: boolean
  unexpectedExternalSideEffect: boolean
  protectedResourceLost: boolean
}

export type RecoveryPolicy = {
  maxConsecutiveFailures: number
  maxNoProgressSteps: number
  maxStepsBetweenCheckpoints: number
}

export type RecoveryDecision = {
  policyVersion: typeof RECOVERY_POLICY_VERSION
  action: RecoveryAction
  reasonCode:
    | 'healthy'
    | 'checkpoint-due'
    | 'failure-threshold'
    | 'no-progress-threshold'
    | 'goal-drift'
    | 'critical-invariant'
    | 'unexpected-side-effect'
    | 'protected-resource-lost'
  requiresHumanApproval: boolean
}

export const DEFAULT_RECOVERY_POLICY: RecoveryPolicy = {
  maxConsecutiveFailures: 3,
  maxNoProgressSteps: 5,
  maxStepsBetweenCheckpoints: 8,
}

function nonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

export function validateRecoveryState(state: RecoveryState): string[] {
  const errors: string[] = []

  if (!nonNegativeInteger(state.consecutiveFailures)) {
    errors.push('consecutiveFailures must be a non-negative integer')
  }
  if (!nonNegativeInteger(state.noProgressSteps)) {
    errors.push('noProgressSteps must be a non-negative integer')
  }
  if (!nonNegativeInteger(state.stepsSinceCheckpoint)) {
    errors.push('stepsSinceCheckpoint must be a non-negative integer')
  }

  return errors
}

export function decideRecovery(
  state: RecoveryState,
  policy: RecoveryPolicy = DEFAULT_RECOVERY_POLICY,
): RecoveryDecision {
  const validationErrors = validateRecoveryState(state)
  if (validationErrors.length > 0) {
    return {
      policyVersion: RECOVERY_POLICY_VERSION,
      action: 'stop-for-human',
      reasonCode: 'critical-invariant',
      requiresHumanApproval: true,
    }
  }

  if (state.unexpectedExternalSideEffect) {
    return {
      policyVersion: RECOVERY_POLICY_VERSION,
      action: 'stop-for-human',
      reasonCode: 'unexpected-side-effect',
      requiresHumanApproval: true,
    }
  }

  if (state.protectedResourceLost) {
    return {
      policyVersion: RECOVERY_POLICY_VERSION,
      action: 'stop-for-human',
      reasonCode: 'protected-resource-lost',
      requiresHumanApproval: true,
    }
  }

  if (state.criticalInvariantViolated) {
    return {
      policyVersion: RECOVERY_POLICY_VERSION,
      action: 'stop-for-human',
      reasonCode: 'critical-invariant',
      requiresHumanApproval: true,
    }
  }

  if (state.goalDriftDetected) {
    return {
      policyVersion: RECOVERY_POLICY_VERSION,
      action: 'replan',
      reasonCode: 'goal-drift',
      requiresHumanApproval: false,
    }
  }

  if (state.consecutiveFailures >= policy.maxConsecutiveFailures) {
    return {
      policyVersion: RECOVERY_POLICY_VERSION,
      action: 'replan',
      reasonCode: 'failure-threshold',
      requiresHumanApproval: false,
    }
  }

  if (state.noProgressSteps >= policy.maxNoProgressSteps) {
    return {
      policyVersion: RECOVERY_POLICY_VERSION,
      action: 'replan',
      reasonCode: 'no-progress-threshold',
      requiresHumanApproval: false,
    }
  }

  if (state.stepsSinceCheckpoint >= policy.maxStepsBetweenCheckpoints) {
    return {
      policyVersion: RECOVERY_POLICY_VERSION,
      action: 'checkpoint',
      reasonCode: 'checkpoint-due',
      requiresHumanApproval: false,
    }
  }

  return {
    policyVersion: RECOVERY_POLICY_VERSION,
    action: 'continue',
    reasonCode: 'healthy',
    requiresHumanApproval: false,
  }
}
