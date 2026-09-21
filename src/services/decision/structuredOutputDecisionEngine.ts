import {
  DECISION_SCHEMA_VERSION,
  type DecisionEngine,
  type DecisionRequest,
} from './decisionLayer.ts'

export type StructuredDecisionInvokerInput<TDecision extends string> = {
  decisionId: string
  allowedDecisions: readonly TDecision[]
  context: Readonly<Record<string, unknown>>
  instruction: string
}

export type StructuredDecisionInvoker<TDecision extends string> = (
  input: StructuredDecisionInvokerInput<TDecision>,
) => Promise<unknown>

export type StructuredOutputDecisionEngineOptions = {
  engineName?: string
  model?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class StructuredOutputDecisionEngine<TDecision extends string>
  implements DecisionEngine<TDecision>
{
  private readonly engineName: string
  private readonly model: string | null

  constructor(
    private readonly invoke: StructuredDecisionInvoker<TDecision>,
    options: StructuredOutputDecisionEngineOptions = {},
  ) {
    this.engineName = options.engineName?.trim() || 'structured-output-baseline'
    this.model = options.model?.trim() || null
  }

  async decide(request: DecisionRequest<TDecision>): Promise<unknown> {
    const raw = await this.invoke({
      decisionId: request.decisionId,
      allowedDecisions: request.allowedDecisions,
      context: request.context,
      instruction:
        'Return only decision, confidence, and reasonCodes. ' +
        'decision must be one allowed value; confidence must be 0..1; ' +
        'reasonCodes must be short stable identifiers. Do not execute tools.',
    })

    if (!isRecord(raw)) {
      return raw
    }

    return {
      schemaVersion: DECISION_SCHEMA_VERSION,
      decision: raw.decision,
      confidence: raw.confidence,
      reasonCodes: raw.reasonCodes,
      engine: this.engineName,
      model: this.model,
    }
  }
}
