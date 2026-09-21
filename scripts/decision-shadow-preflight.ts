import type { SideQueryOptions } from '../src/utils/sideQuery.ts'
import { sideQuery } from '../src/utils/sideQuery.ts'
import {
  applyProfileEnvToProcessEnv,
  buildStartupEnvFromProfile,
} from '../src/utils/providerProfile.ts'
import { getAPIProvider } from '../src/utils/model/providers.ts'
import { getSmallFastModel } from '../src/utils/model/model.ts'
import { createSideQueryStructuredDecisionEngine } from '../src/services/decision/sideQueryDecisionEngine.ts'
import { validateDecisionEnvelope } from '../src/services/decision/decisionLayer.ts'
import { classifyDecisionPreflightFailure } from '../src/services/decision/decisionPreflightFailure.ts'
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
  const firstCase = sentinelIncidentSeedCorpus[0]

  if (!firstCase) {
    process.stderr.write('Decision shadow preflight failed: empty-corpus\n')
    process.exitCode = 4
    return
  }

  const engine = createSideQueryStructuredDecisionEngine<SentinelIncidentDecision>({
    model,
    engineName: `sidequery:${provider}`,
    sideQuery: async options =>
      sideQuery(options as unknown as SideQueryOptions),
  })

  try {
    const raw = await engine.decide({
      decisionId: firstCase.id,
      allowedDecisions: firstCase.allowedDecisions,
      context: firstCase.context,
    })
    const validation = validateDecisionEnvelope(
      raw,
      firstCase.allowedDecisions,
    )

    if (!validation.envelope) {
      process.stderr.write(
        'Decision shadow preflight failed: invalid-envelope\n',
      )
      process.exitCode = 4
      return
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          provider,
          model,
          schemaVersion: validation.envelope.schemaVersion,
        },
        null,
        2,
      )}\n`,
    )
  } catch (error) {
    const category = classifyDecisionPreflightFailure(error)
    process.stderr.write(
      `Decision shadow preflight failed: ${category}\n`,
    )
    process.exitCode = 4
  }
}

main().catch(() => {
  process.stderr.write('Decision shadow preflight failed: setup-error\n')
  process.exitCode = 4
})
