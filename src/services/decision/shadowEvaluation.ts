import {
  runDecisionSafely,
  summarizeDecisionEvaluations,
  type DecisionEngine,
  type DecisionEvaluationSummary,
} from './decisionLayer.ts'

export type DecisionCorpusCase<TDecision extends string> = {
  id: string
  expected: TDecision
  allowedDecisions: readonly TDecision[]
  context: Readonly<Record<string, unknown>>
}

export type ShadowCaseResult<TDecision extends string> = {
  id: string
  expected: TDecision
  actual: TDecision | null
  confidence: number | null
  accepted: boolean
  elapsedMs: number
  errors: readonly string[]
}

export type ShadowEngineReport<TDecision extends string> = {
  engineId: string
  cases: readonly ShadowCaseResult<TDecision>[]
  evaluation: DecisionEvaluationSummary
  invalidRate: number
  meanLatencyMs: number
  p50LatencyMs: number
  p95LatencyMs: number
}

export type ShadowComparison = {
  baselineEngineId: string
  candidateEngineId: string
  accuracyDelta: number
  invalidRateDelta: number
  meanLatencyDeltaMs: number
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(percentileValue * sorted.length) - 1),
  )
  return sorted[index] ?? 0
}

export async function evaluateDecisionEngineInShadow<TDecision extends string>(
  engineId: string,
  engine: DecisionEngine<TDecision>,
  corpus: readonly DecisionCorpusCase<TDecision>[],
  now: () => number = () => performance.now(),
): Promise<ShadowEngineReport<TDecision>> {
  const cases: ShadowCaseResult<TDecision>[] = []

  for (const item of corpus) {
    const startedAt = now()
    const run = await runDecisionSafely(
      engine,
      {
        decisionId: item.id,
        allowedDecisions: item.allowedDecisions,
        context: item.context,
      },
      'shadow',
    )
    const elapsedMs = Math.max(0, now() - startedAt)

    cases.push({
      id: item.id,
      expected: item.expected,
      actual: run.envelope?.decision ?? null,
      confidence: run.envelope?.confidence ?? null,
      accepted: run.accepted,
      elapsedMs,
      errors: run.errors,
    })
  }

  const evaluation = summarizeDecisionEvaluations(
    cases.map(item => ({
      expected: item.expected,
      actual: item.actual,
      confidence: item.confidence,
    })),
  )
  const latencies = cases.map(item => item.elapsedMs)
  const invalid = cases.filter(item => !item.accepted).length

  return {
    engineId,
    cases,
    evaluation,
    invalidRate: cases.length === 0 ? 0 : round(invalid / cases.length),
    meanLatencyMs:
      latencies.length === 0
        ? 0
        : round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length, 2),
    p50LatencyMs: round(percentile(latencies, 0.5), 2),
    p95LatencyMs: round(percentile(latencies, 0.95), 2),
  }
}

export function compareShadowReports<TDecision extends string>(
  baseline: ShadowEngineReport<TDecision>,
  candidate: ShadowEngineReport<TDecision>,
): ShadowComparison {
  return {
    baselineEngineId: baseline.engineId,
    candidateEngineId: candidate.engineId,
    accuracyDelta: round(
      candidate.evaluation.accuracy - baseline.evaluation.accuracy,
    ),
    invalidRateDelta: round(candidate.invalidRate - baseline.invalidRate),
    meanLatencyDeltaMs: round(
      candidate.meanLatencyMs - baseline.meanLatencyMs,
      2,
    ),
  }
}
