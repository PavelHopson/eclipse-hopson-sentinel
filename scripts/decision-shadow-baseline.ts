import { mkdir, rename, writeFile } from 'node:fs/promises'

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
import { buildDecisionShadowReport } from '../src/services/decision/shadowReport.ts'
import {
  sentinelIncidentSeedCorpus,
  type SentinelIncidentDecision,
} from '../src/services/decision/sentinelIncidentSeedCorpus.ts'

const EVIDENCE_DIR = 'reports/decision-shadow'

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  return process.argv[index + 1] ?? null
}

function safeTimestamp(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, '')
}

async function persistEvidence(
  report: ReturnType<typeof buildDecisionShadowReport>,
): Promise<string> {
  await mkdir(EVIDENCE_DIR, { recursive: true })

  const filename =
    `baseline-${safeTimestamp(report.generatedAt)}.json`
  const finalPath = `${EVIDENCE_DIR}/${filename}`
  const tempPath =
    `${finalPath}.tmp-${process.pid}-${Date.now()}`
  const json = `${JSON.stringify(report, null, 2)}\n`

  await writeFile(tempPath, json, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  })
  await rename(tempPath, finalPath)
  return finalPath
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

  const engineReport = await evaluateDecisionEngineInShadow(
    engineName,
    engine,
    sentinelIncidentSeedCorpus,
  )

  const report = buildDecisionShadowReport({
    provider,
    model,
    corpus: 'sentinelIncidentSeedCorpus',
    engineReport,
  })

  const evidencePath = await persistEvidence(report)

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.stderr.write(`Decision shadow evidence saved: ${evidencePath}\n`)
}

main().catch(() => {
  process.stderr.write(
    'Decision shadow baseline failed. Check provider profile, credentials, model availability, and reports directory permissions.\n',
  )
  process.exitCode = 1
})
