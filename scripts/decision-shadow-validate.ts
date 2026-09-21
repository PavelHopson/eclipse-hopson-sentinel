import { readFile } from 'node:fs/promises'

import { validateDecisionShadowReport } from '../src/services/decision/shadowReport.ts'

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  return process.argv[index + 1] ?? null
}

async function main(): Promise<void> {
  const reportPath = readArg('--report')
  const requireLiveEngine = process.argv.includes('--require-live-engine')
  if (!reportPath) {
    process.stderr.write(
      'Usage: bun run decision:shadow:validate -- --report <file>\n',
    )
    process.exitCode = 1
    return
  }

  const parsed = JSON.parse(await readFile(reportPath, 'utf8')) as unknown
  const validation = validateDecisionShadowReport(parsed)

  if (!validation.report) {
    process.stderr.write(
      `Invalid decision shadow report: ${validation.errors.join('; ')}\n`,
    )
    process.exitCode = 2
    return
  }

  const { report } = validation

  if (requireLiveEngine && report.metrics.valid === 0) {
    process.stderr.write(
      'Decision shadow report has zero valid decisions; live engine was not established.\n',
    )
    process.exitCode = 3
    return
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        valid: true,
        schemaVersion: report.schemaVersion,
        generatedAt: report.generatedAt,
        engineId: report.engineId,
        provider: report.provider,
        model: report.model,
        corpus: report.corpus,
        caseCount: report.caseCount,
        metrics: report.metrics,
      },
      null,
      2,
    )}\n`,
  )
}

main().catch(error => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Decision report validation failed'}\n`,
  )
  process.exitCode = 1
})
