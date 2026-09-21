export const DECISION_SCHEMA_VERSION = 'sentinel.decision.v1' as const

export type DecisionMode = 'shadow' | 'recommendation'

export type DecisionRequest<TDecision extends string> = {
  decisionId: string
  allowedDecisions: readonly TDecision[]
  context: Readonly<Record<string, unknown>>
}

export type DecisionEnvelope<TDecision extends string> = {
  schemaVersion: typeof DECISION_SCHEMA_VERSION
  decision: TDecision
  confidence: number
  reasonCodes: readonly string[]
  engine: string
  model?: string | null
}

export type DecisionEngine<TDecision extends string> = {
  decide(request: DecisionRequest<TDecision>): Promise<unknown>
}

export type DecisionRun<TDecision extends string> = {
  mode: DecisionMode
  accepted: boolean
  envelope: DecisionEnvelope<TDecision> | null
  errors: readonly string[]
  executionAuthorized: false
}

export type DecisionEvaluationCase<TDecision extends string> = {
  expected: TDecision
  actual: TDecision | null
  confidence: number | null
}

export type DecisionEvaluationSummary = {
  total: number
  valid: number
  correct: number
  accuracy: number
  meanConfidenceOnCorrect: number | null
  meanConfidenceOnIncorrect: number | null
}

const MAX_REASON_CODES = 16
const MAX_REASON_CODE_LENGTH = 80

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function validateDecisionEnvelope<TDecision extends string>(
  value: unknown,
  allowedDecisions: readonly TDecision[],
): { envelope: DecisionEnvelope<TDecision> | null; errors: string[] } {
  const errors: string[] = []

  if (!isRecord(value)) {
    return { envelope: null, errors: ['decision envelope must be an object'] }
  }

  const schemaVersion = value.schemaVersion
  const decision = value.decision
  const confidence = value.confidence
  const reasonCodes = value.reasonCodes
  const engine = value.engine
  const model = value.model

  if (schemaVersion !== DECISION_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${DECISION_SCHEMA_VERSION}`)
  }

  if (
    typeof decision !== 'string' ||
    !allowedDecisions.includes(decision as TDecision)
  ) {
    errors.push('decision must be one of the allowed decisions')
  }

  if (
    typeof confidence !== 'number' ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    errors.push('confidence must be a finite number between 0 and 1')
  }

  if (!Array.isArray(reasonCodes)) {
    errors.push('reasonCodes must be an array')
  } else {
    if (reasonCodes.length > MAX_REASON_CODES) {
      errors.push(`reasonCodes must contain at most ${MAX_REASON_CODES} items`)
    }

    if (
      reasonCodes.some(
        code =>
          typeof code !== 'string' ||
          code.length === 0 ||
          code.length > MAX_REASON_CODE_LENGTH,
      )
    ) {
      errors.push(
        `each reasonCode must be a non-empty string up to ${MAX_REASON_CODE_LENGTH} characters`,
      )
    }
  }

  if (typeof engine !== 'string' || engine.trim().length === 0) {
    errors.push('engine must be a non-empty string')
  }

  if (
    model !== undefined &&
    model !== null &&
    (typeof model !== 'string' || model.trim().length === 0)
  ) {
    errors.push('model must be null, undefined, or a non-empty string')
  }

  if (errors.length > 0) {
    return { envelope: null, errors }
  }

  return {
    envelope: {
      schemaVersion: DECISION_SCHEMA_VERSION,
      decision: decision as TDecision,
      confidence: confidence as number,
      reasonCodes: reasonCodes as string[],
      engine: engine as string,
      model: model as string | null | undefined,
    },
    errors: [],
  }
}

export async function runDecisionSafely<TDecision extends string>(
  engine: DecisionEngine<TDecision>,
  request: DecisionRequest<TDecision>,
  mode: DecisionMode = 'shadow',
): Promise<DecisionRun<TDecision>> {
  if (request.allowedDecisions.length === 0) {
    return {
      mode,
      accepted: false,
      envelope: null,
      errors: ['allowedDecisions must not be empty'],
      executionAuthorized: false,
    }
  }

  try {
    const raw = await engine.decide(request)
    const validated = validateDecisionEnvelope(raw, request.allowedDecisions)

    return {
      mode,
      accepted: validated.envelope !== null,
      envelope: validated.envelope,
      errors: validated.errors,
      executionAuthorized: false,
    }
  } catch {
    return {
      mode,
      accepted: false,
      envelope: null,
      errors: ['decision engine failed'],
      executionAuthorized: false,
    }
  }
}

export function summarizeDecisionEvaluations<TDecision extends string>(
  cases: readonly DecisionEvaluationCase<TDecision>[],
): DecisionEvaluationSummary {
  const validCases = cases.filter(
    item => item.actual !== null && item.confidence !== null,
  )
  const correctCases = validCases.filter(item => item.actual === item.expected)
  const incorrectCases = validCases.filter(item => item.actual !== item.expected)

  return {
    total: cases.length,
    valid: validCases.length,
    correct: correctCases.length,
    accuracy:
      cases.length === 0 ? 0 : Number((correctCases.length / cases.length).toFixed(4)),
    meanConfidenceOnCorrect: mean(
      correctCases.map(item => item.confidence as number),
    ),
    meanConfidenceOnIncorrect: mean(
      incorrectCases.map(item => item.confidence as number),
    ),
  }
}
