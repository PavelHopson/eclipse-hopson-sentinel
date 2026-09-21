import type { DecisionShadowReport } from './shadowReport.ts'

export const DECISION_PROMOTION_GATE_VERSION =
  'sentinel.decision-promotion-gate.v1' as const

export type DecisionPromotionGateOptions = {
  criticalExpectedDecisions?: readonly string[]
  maxBaselineCorrectRegressions?: number
  latencyWarningMultiplier?: number
  latencyWarningAbsoluteIncreaseMs?: number
}

export type DecisionPromotionGateResult = {
  gateVersion: typeof DECISION_PROMOTION_GATE_VERSION
  eligibleForCanaryReview: boolean
  canaryAuthorized: false
  blockingReasons: readonly string[]
  warnings: readonly string[]
  baselineCorrectRegressions: readonly string[]
  criticalRegressions: readonly string[]
  deltas: {
    accuracy: number
    invalidRate: number
    meanLatencyMs: number
    p95LatencyMs: number
  }
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function indexCases(report: DecisionShadowReport) {
  return new Map(report.cases.map(item => [item.id, item] as const))
}

export function assessCandidateForCanaryReview(
  baseline: DecisionShadowReport,
  candidate: DecisionShadowReport,
  options: DecisionPromotionGateOptions = {},
): DecisionPromotionGateResult {
  const blockingReasons: string[] = []
  const warnings: string[] = []
  const baselineCorrectRegressions: string[] = []
  const criticalRegressions: string[] = []
  const criticalExpectedDecisions = new Set(
    options.criticalExpectedDecisions ?? [],
  )
  const maxBaselineCorrectRegressions =
    options.maxBaselineCorrectRegressions ?? 0
  const latencyWarningMultiplier = options.latencyWarningMultiplier ?? 2
  const latencyWarningAbsoluteIncreaseMs =
    options.latencyWarningAbsoluteIncreaseMs ?? 1_000

  if (baseline.corpus !== candidate.corpus) {
    blockingReasons.push('baseline and candidate must use the same corpus')
  }

  if (baseline.caseCount !== candidate.caseCount) {
    blockingReasons.push('baseline and candidate must have the same caseCount')
  }

  const baselineCases = indexCases(baseline)
  const candidateCases = indexCases(candidate)

  for (const baselineCase of baseline.cases) {
    const candidateCase = candidateCases.get(baselineCase.id)
    if (!candidateCase) {
      blockingReasons.push(`candidate is missing case: ${baselineCase.id}`)
      continue
    }

    if (candidateCase.expected !== baselineCase.expected) {
      blockingReasons.push(
        `expected label mismatch for case: ${baselineCase.id}`,
      )
      continue
    }

    const baselineWasCorrect =
      baselineCase.accepted && baselineCase.actual === baselineCase.expected
    const candidateIsCorrect =
      candidateCase.accepted && candidateCase.actual === candidateCase.expected

    if (baselineWasCorrect && !candidateIsCorrect) {
      baselineCorrectRegressions.push(baselineCase.id)
      if (criticalExpectedDecisions.has(baselineCase.expected)) {
        criticalRegressions.push(baselineCase.id)
      }
    }
  }

  for (const candidateCase of candidate.cases) {
    if (!baselineCases.has(candidateCase.id)) {
      blockingReasons.push(
        `candidate contains unexpected case: ${candidateCase.id}`,
      )
    }
  }

  if (candidate.metrics.accuracy < baseline.metrics.accuracy) {
    blockingReasons.push('candidate accuracy is below baseline')
  }

  if (candidate.metrics.invalidRate > baseline.metrics.invalidRate) {
    blockingReasons.push('candidate invalid rate is above baseline')
  }

  if (
    baselineCorrectRegressions.length > maxBaselineCorrectRegressions
  ) {
    blockingReasons.push(
      'candidate regresses cases that baseline classified correctly',
    )
  }

  if (criticalRegressions.length > 0) {
    blockingReasons.push('candidate has critical decision regressions')
  }

  const latencyWarningThreshold = Math.max(
    baseline.metrics.p95LatencyMs * latencyWarningMultiplier,
    baseline.metrics.p95LatencyMs + latencyWarningAbsoluteIncreaseMs,
  )
  if (candidate.metrics.p95LatencyMs > latencyWarningThreshold) {
    warnings.push('candidate p95 latency materially exceeds baseline')
  }

  if (candidate.metrics.invalidRate > 0) {
    warnings.push('candidate still has invalid decision envelopes')
  }

  const candidateWrongConfidence =
    candidate.metrics.meanConfidenceOnIncorrect
  const candidateCorrectConfidence =
    candidate.metrics.meanConfidenceOnCorrect
  if (
    candidateWrongConfidence !== null &&
    candidateCorrectConfidence !== null &&
    candidateWrongConfidence >= candidateCorrectConfidence
  ) {
    warnings.push(
      'candidate confidence is not better calibrated on correct decisions',
    )
  }

  return {
    gateVersion: DECISION_PROMOTION_GATE_VERSION,
    eligibleForCanaryReview: blockingReasons.length === 0,
    canaryAuthorized: false,
    blockingReasons,
    warnings,
    baselineCorrectRegressions,
    criticalRegressions,
    deltas: {
      accuracy: round(
        candidate.metrics.accuracy - baseline.metrics.accuracy,
      ),
      invalidRate: round(
        candidate.metrics.invalidRate - baseline.metrics.invalidRate,
      ),
      meanLatencyMs: round(
        candidate.metrics.meanLatencyMs - baseline.metrics.meanLatencyMs,
        2,
      ),
      p95LatencyMs: round(
        candidate.metrics.p95LatencyMs - baseline.metrics.p95LatencyMs,
        2,
      ),
    },
  }
}
