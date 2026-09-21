import { readFile } from 'node:fs/promises'

import { assessCandidateForCanaryReview } from '../src/services/decision/decisionPromotionGate.ts'
import { validateDecisionShadowReport } from '../src/services/decision/shadowReport.ts'

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  return process.argv[index + 1] ?? null
}

async function loadReport(path: string) {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown
  const validation = validateDecisionShadowReport(parsed)
  if (!validation.report) {
    throw new Error(
      `Invalid decision shadow report at ${path}: ${validation.errors.join('; ')}`,
    )
  }
  return validation.report
}

async function main(): Promise<void> {
  const baselinePath = readArg('--baseline')
  const candidatePath = readArg('--candidate')

  if (!baselinePath || !candidatePath) {
    process.stderr.write(
      'Usage: bun run decision:shadow:compare -- --baseline <file> --candidate <file>\n',
    )
    process.exitCode = 1
    return
  }

  const [baseline, candidate] = await Promise.all([
    loadReport(baselinePath),
    loadReport(candidatePath),
  ])

  const result = assessCandidateForCanaryReview(baseline, candidate, {
    criticalExpectedDecisions: ['escalate'],
    maxBaselineCorrectRegressions: 0,
  })

  process.stdout.write(
    `${JSON.stringify(
      {
        baseline: {
          engineId: baseline.engineId,
          provider: baseline.provider,
          model: baseline.model,
          generatedAt: baseline.generatedAt,
        },
        candidate: {
          engineId: candidate.engineId,
          provider: candidate.provider,
          model: candidate.model,
          generatedAt: candidate.generatedAt,
        },
        result,
      },
      null,
      2,
    )}\n`,
  )

  if (!result.eligibleForCanaryReview) {
    process.exitCode = 2
  }
}

main().catch(error => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Decision comparison failed'}\n`,
  )
  process.exitCode = 1
})
