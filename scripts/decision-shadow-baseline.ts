import type { SideQueryOptions } from '../src/utils/sideQuery.ts'
import { sideQuery } from '../src/utils/sideQuery.ts'
import {
  applyProfileEnvToProcessEnv,
  buildStartupEnvFromProfile,
} from '../src/utils/providerProfile.ts'
import { getAPIProvider } from '../src/utils/model/providers.ts'
import { getSmallFastModel } from '../src/utils/model/model.ts'
import { createSideQueryStructuredDecisionEngine } from '../src/services/decision/sideQueryDecisionEngine.ts'
import { evaluateDecisionEngineInShadow } from '../src/services/decision/shadowEvaluation.ts'
import {
  sentinelIncidentSeedCorpus,
  type SentinelIncidentDecision,
} from '../src/services/decision/sentinelIncidentSeedCorpus.ts'

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  return process.argv[index + 1] ?? null
}

async function main(): Promise<void> {
  const startupEnv = await buildStartupEnvFromProfile({
    processEnv: process.env,
  })
  applyProfileEnvToProcessEnv(process.env, startupEnv)

  const provider = getAPIProvider()
  const model = readArg('--model')?.trim() || getSmallFastModel()
  const engineName = `sidequery:${provider}`

  const engine = createSideQueryStructuredDecisionEngine<SentinelIncidentDecision>({
    model,
    engineName,
    sideQuery: async options =>
      sideQuery(options as unknown as SideQueryOptions),
  })

  const report = await evaluateDecisionEngineInShadow(
    engineName,
    engine,
    sentinelIncidentSeedCorpus,
  )

  const safeReport = {
    schemaVersion: 'sentinel.decision-shadow-report.v1',
    generatedAt: new Date().toISOString(),
    provider,
    model,
    corpus: 'sentinelIncidentSeedCorpus',
    caseCount: sentinelIncidentSeedCorpus.length,
    metrics: {
      accuracy: report.evaluation.accuracy,
      valid: report.evaluation.valid,
      correct: report.evaluation.correct,
      invalidRate: report.invalidRate,
      meanConfidenceOnCorrect: report.evaluation.meanConfidenceOnCorrect,
      meanConfidenceOnIncorrect:
        report.evaluation.meanConfidenceOnIncorrect,
      meanLatencyMs: report.meanLatencyMs,
      p50LatencyMs: report.p50LatencyMs,
      p95LatencyMs: report.p95LatencyMs,
    },
    cases: report.cases.map(item => ({
      id: item.id,
      expected: item.expected,
      actual: item.actual,
      confidence: item.confidence,
      accepted: item.accepted,
      elapsedMs: item.elapsedMs,
      errors: item.errors,
    })),
  }

  process.stdout.write(`${JSON.stringify(safeReport, null, 2)}\n`)
}

main().catch(() => {
  process.stderr.write(
    'Decision shadow baseline failed. Check provider profile, credentials, and model availability.\n',
  )
  process.exitCode = 1
})
