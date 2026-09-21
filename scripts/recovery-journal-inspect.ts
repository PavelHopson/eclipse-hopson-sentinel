import {
  readSessionRecoveryJournal,
} from '../src/services/recovery/sessionRecoveryJournal.ts'
import {
  summarizeRecoveryJournal,
} from '../src/services/recovery/recoveryJournalDiagnostics.ts'

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  return process.argv[index + 1] ?? null
}

function usage(): string {
  return [
    'Usage:',
    '  bun run recovery:journal:inspect -- --transcript <session.jsonl>',
    '  bun run recovery:journal:inspect -- --journal <session.recovery.jsonl>',
  ].join('\n')
}

function main(): void {
  const transcriptPath = readArg('--transcript')
  const filePath = readArg('--journal')

  if ((!transcriptPath && !filePath) || (transcriptPath && filePath)) {
    process.stderr.write(`${usage()}\n`)
    process.exitCode = 1
    return
  }

  const readResult = readSessionRecoveryJournal({
    ...(transcriptPath ? { transcriptPath } : {}),
    ...(filePath ? { filePath } : {}),
  })
  const summary = summarizeRecoveryJournal(readResult)

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Recovery journal inspection failed'}\n`,
  )
  process.exitCode = 1
}
