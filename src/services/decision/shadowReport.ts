import type { ShadowEngineReport } from './shadowEvaluation.ts'

export const DECISION_SHADOW_REPORT_VERSION =
  'sentinel.decision-shadow-report.v1' as const

export type DecisionShadowReportCase = {
  id: string
  expected: string
  actual: string | null
  confidence: number | null
  accepted: boolean
  elapsedMs: number
  errors: readonly string[]
}

export type DecisionShadowReportMetrics = {
  accuracy: number
  valid: number
  correct: number
  invalidRate: number
  meanConfidenceOnCorrect: number | null
  meanConfidenceOnIncorrect: number | null
  meanLatencyMs: number
  p50LatencyMs: number
  p95LatencyMs: number
}

export type DecisionShadowReport = {
  schemaVersion: typeof DECISION_SHADOW_REPORT_VERSION
  generatedAt: string
  engineId: string
  provider: string
  model: string
  corpus: string
  caseCount: number
  metrics: DecisionShadowReportMetrics
  cases: readonly DecisionShadowReportCase[]
}

export type DecisionShadowReportValidation = {
  report: DecisionShadowReport | null
  errors: string[]
}

const MAX_CASES = 10_000
const MAX_ERRORS_PER_CASE = 32
const MAX_ERROR_LENGTH = 200

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRate(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1
}

function isOptionalRate(value: unknown): value is number | null {
  return value === null || isRate(value)
}

function validateMetrics(
  value: unknown,
  caseCount: number,
  errors: string[],
): DecisionShadowReportMetrics | null {
  if (!isRecord(value)) {
    errors.push('metrics must be an object')
    return null
  }

  const {
    accuracy,
    valid,
    correct,
    invalidRate,
    meanConfidenceOnCorrect,
    meanConfidenceOnIncorrect,
    meanLatencyMs,
    p50LatencyMs,
    p95LatencyMs,
  } = value

  if (!isRate(accuracy)) errors.push('metrics.accuracy must be 0..1')
  if (!Number.isInteger(valid) || (valid as number) < 0 || (valid as number) > caseCount) {
    errors.push('metrics.valid must be an integer within caseCount')
  }
  if (
    !Number.isInteger(correct) ||
    (correct as number) < 0 ||
    (correct as number) > caseCount
  ) {
    errors.push('metrics.correct must be an integer within caseCount')
  }
  if (
    Number.isInteger(valid) &&
    Number.isInteger(correct) &&
    (correct as number) > (valid as number)
  ) {
    errors.push('metrics.correct must not exceed metrics.valid')
  }
  if (!isRate(invalidRate)) {
    errors.push('metrics.invalidRate must be 0..1')
  }
  if (!isOptionalRate(meanConfidenceOnCorrect)) {
    errors.push('metrics.meanConfidenceOnCorrect must be null or 0..1')
  }
  if (!isOptionalRate(meanConfidenceOnIncorrect)) {
    errors.push('metrics.meanConfidenceOnIncorrect must be null or 0..1')
  }
  if (!isFiniteNumber(meanLatencyMs) || meanLatencyMs < 0) {
    errors.push('metrics.meanLatencyMs must be a non-negative finite number')
  }
  if (!isFiniteNumber(p50LatencyMs) || p50LatencyMs < 0) {
    errors.push('metrics.p50LatencyMs must be a non-negative finite number')
  }
  if (!isFiniteNumber(p95LatencyMs) || p95LatencyMs < 0) {
    errors.push('metrics.p95LatencyMs must be a non-negative finite number')
  }

  if (errors.length > 0) return null

  return {
    accuracy: accuracy as number,
    valid: valid as number,
    correct: correct as number,
    invalidRate: invalidRate as number,
    meanConfidenceOnCorrect: meanConfidenceOnCorrect as number | null,
    meanConfidenceOnIncorrect: meanConfidenceOnIncorrect as number | null,
    meanLatencyMs: meanLatencyMs as number,
    p50LatencyMs: p50LatencyMs as number,
    p95LatencyMs: p95LatencyMs as number,
  }
}

function validateCases(
  value: unknown,
  caseCount: number,
  errors: string[],
): DecisionShadowReportCase[] | null {
  if (!Array.isArray(value)) {
    errors.push('cases must be an array')
    return null
  }

  if (value.length !== caseCount) {
    errors.push('cases length must equal caseCount')
  }
  if (value.length > MAX_CASES) {
    errors.push(`cases must contain at most ${MAX_CASES} entries`)
  }

  const ids = new Set<string>()
  const parsed: DecisionShadowReportCase[] = []

  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      errors.push(`cases[${index}] must be an object`)
      continue
    }

    const { id, expected, actual, confidence, accepted, elapsedMs, errors: caseErrors } =
      item

    if (!isNonEmptyString(id)) {
      errors.push(`cases[${index}].id must be a non-empty string`)
      continue
    }
    if (ids.has(id)) {
      errors.push(`cases[${index}].id must be unique`)
    }
    ids.add(id)

    if (!isNonEmptyString(expected)) {
      errors.push(`cases[${index}].expected must be a non-empty string`)
    }
    if (actual !== null && !isNonEmptyString(actual)) {
      errors.push(`cases[${index}].actual must be null or a non-empty string`)
    }
    if (confidence !== null && !isRate(confidence)) {
      errors.push(`cases[${index}].confidence must be null or 0..1`)
    }
    if (typeof accepted !== 'boolean') {
      errors.push(`cases[${index}].accepted must be boolean`)
    }
    if (!isFiniteNumber(elapsedMs) || elapsedMs < 0) {
      errors.push(`cases[${index}].elapsedMs must be non-negative`)
    }

    if (!Array.isArray(caseErrors)) {
      errors.push(`cases[${index}].errors must be an array`)
    } else {
      if (caseErrors.length > MAX_ERRORS_PER_CASE) {
        errors.push(
          `cases[${index}].errors must have at most ${MAX_ERRORS_PER_CASE} entries`,
        )
      }
      if (
        caseErrors.some(
          error =>
            typeof error !== 'string' ||
            error.length === 0 ||
            error.length > MAX_ERROR_LENGTH,
        )
      ) {
        errors.push(
          `cases[${index}].errors entries must be 1..${MAX_ERROR_LENGTH} chars`,
        )
      }
    }

    if (accepted === true && (actual === null || confidence === null)) {
      errors.push(
        `cases[${index}] accepted=true requires actual and confidence`,
      )
    }

    parsed.push({
      id,
      expected: typeof expected === 'string' ? expected : '',
      actual: typeof actual === 'string' ? actual : null,
      confidence: typeof confidence === 'number' ? confidence : null,
      accepted: accepted === true,
      elapsedMs: typeof elapsedMs === 'number' ? elapsedMs : 0,
      errors: Array.isArray(caseErrors)
        ? caseErrors.filter((error): error is string => typeof error === 'string')
        : [],
    })
  }

  return errors.length === 0 ? parsed : null
}

export function buildDecisionShadowReport<TDecision extends string>(input: {
  provider: string
  model: string
  corpus: string
  engineReport: ShadowEngineReport<TDecision>
  generatedAt?: string
}): DecisionShadowReport {
  return {
    schemaVersion: DECISION_SHADOW_REPORT_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    engineId: input.engineReport.engineId,
    provider: input.provider,
    model: input.model,
    corpus: input.corpus,
    caseCount: input.engineReport.cases.length,
    metrics: {
      accuracy: input.engineReport.evaluation.accuracy,
      valid: input.engineReport.evaluation.valid,
      correct: input.engineReport.evaluation.correct,
      invalidRate: input.engineReport.invalidRate,
      meanConfidenceOnCorrect:
        input.engineReport.evaluation.meanConfidenceOnCorrect,
      meanConfidenceOnIncorrect:
        input.engineReport.evaluation.meanConfidenceOnIncorrect,
      meanLatencyMs: input.engineReport.meanLatencyMs,
      p50LatencyMs: input.engineReport.p50LatencyMs,
      p95LatencyMs: input.engineReport.p95LatencyMs,
    },
    cases: input.engineReport.cases.map(item => ({
      id: item.id,
      expected: item.expected,
      actual: item.actual,
      confidence: item.confidence,
      accepted: item.accepted,
      elapsedMs: item.elapsedMs,
      errors: item.errors,
    })),
  }
}

export function validateDecisionShadowReport(
  value: unknown,
): DecisionShadowReportValidation {
  const errors: string[] = []

  if (!isRecord(value)) {
    return { report: null, errors: ['report must be an object'] }
  }

  if (value.schemaVersion !== DECISION_SHADOW_REPORT_VERSION) {
    errors.push(
      `schemaVersion must be ${DECISION_SHADOW_REPORT_VERSION}`,
    )
  }

  const generatedAt = value.generatedAt
  if (
    !isNonEmptyString(generatedAt) ||
    !Number.isFinite(Date.parse(generatedAt))
  ) {
    errors.push('generatedAt must be a valid ISO-like timestamp')
  }

  for (const field of ['engineId', 'provider', 'model', 'corpus'] as const) {
    if (!isNonEmptyString(value[field])) {
      errors.push(`${field} must be a non-empty string`)
    }
  }

  const caseCount = value.caseCount
  if (
    !Number.isInteger(caseCount) ||
    (caseCount as number) < 0 ||
    (caseCount as number) > MAX_CASES
  ) {
    errors.push(`caseCount must be an integer from 0 to ${MAX_CASES}`)
  }

  const normalizedCaseCount =
    Number.isInteger(caseCount) && (caseCount as number) >= 0
      ? (caseCount as number)
      : 0

  const metrics = validateMetrics(value.metrics, normalizedCaseCount, errors)
  const cases = validateCases(value.cases, normalizedCaseCount, errors)

  if (errors.length > 0 || !metrics || !cases) {
    return { report: null, errors }
  }

  return {
    report: {
      schemaVersion: DECISION_SHADOW_REPORT_VERSION,
      generatedAt: generatedAt as string,
      engineId: value.engineId as string,
      provider: value.provider as string,
      model: value.model as string,
      corpus: value.corpus as string,
      caseCount: normalizedCaseCount,
      metrics,
      cases,
    },
    errors: [],
  }
}
