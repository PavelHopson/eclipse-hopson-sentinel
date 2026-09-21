import {
  runRecoveryShadowScenario,
  type RecoveryShadowScenario,
} from '../src/services/recovery/recoveryShadowHarness.ts'

const SCENARIOS: readonly RecoveryShadowScenario[] = [
  'healthy',
  'checkpoint',
  'replan',
]

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  return process.argv[index + 1] ?? null
}

function isScenario(value: string): value is RecoveryShadowScenario {
  return SCENARIOS.includes(value as RecoveryShadowScenario)
}

function main(): void {
  const rawScenario = readArg('--scenario') ?? 'replan'

  if (!isScenario(rawScenario)) {
    process.stderr.write(
      `Unknown scenario "${rawScenario}". Allowed: ${SCENARIOS.join(', ')}\n`,
    )
    process.exitCode = 1
    return
  }

  const report = runRecoveryShadowScenario(rawScenario)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

main()
