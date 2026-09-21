import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from 'node:fs'
import { dirname } from 'node:path'

import { getTranscriptPath } from '../../utils/sessionStorage.ts'
import {
  type RecoveryJournalEntry,
  type RecoveryJournalSink,
  validateRecoveryJournalEntry,
} from './recoveryRunJournal.ts'

export const MAX_PERSISTED_RECOVERY_ENTRY_BYTES = 8 * 1024
export const MAX_PERSISTED_RECOVERY_JOURNAL_BYTES = 2 * 1024 * 1024
export const MAX_PERSISTED_RECOVERY_JOURNAL_ENTRIES = 2_048

export type SessionRecoveryJournalDiagnostics = {
  filePath: string
  totalLines: number
  validEntries: number
  invalidLines: number
  truncatedEntries: number
}

export type SessionRecoveryJournalReadResult = {
  entries: readonly RecoveryJournalEntry[]
  diagnostics: SessionRecoveryJournalDiagnostics
}

export type SessionRecoveryJournalSinkOptions = {
  filePath?: string
  maxEntryBytes?: number
}

export type ReadSessionRecoveryJournalOptions = {
  filePath?: string
  maxFileBytes?: number
  maxEntries?: number
}

function recoveryPathFromTranscriptPath(transcriptPath: string): string {
  return transcriptPath.endsWith('.jsonl')
    ? transcriptPath.slice(0, -'.jsonl'.length) + '.recovery.jsonl'
    : transcriptPath + '.recovery.jsonl'
}

export function getSessionRecoveryJournalPath(
  transcriptPath = getTranscriptPath(),
): string {
  return recoveryPathFromTranscriptPath(transcriptPath)
}

function ensurePositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`)
  }
}

function rejectWindowsSymlink(path: string): void {
  if (process.platform !== 'win32' || !existsSync(path)) {
    return
  }

  if (lstatSync(path).isSymbolicLink()) {
    throw new Error('recovery journal path must not be a symbolic link')
  }
}

function openAppendOnlyPrivate(path: string): number {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  rejectWindowsSymlink(path)

  const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0
  const fd =
    process.platform === 'win32'
      ? openSync(path, 'a', 0o600)
      : openSync(
          path,
          fsConstants.O_WRONLY |
            fsConstants.O_CREAT |
            fsConstants.O_APPEND |
            O_NOFOLLOW,
          0o600,
        )

  if (process.platform !== 'win32') {
    fchmodSync(fd, 0o600)
  }

  return fd
}

function openReadOnlyNoFollow(path: string): number {
  rejectWindowsSymlink(path)

  const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0
  return process.platform === 'win32'
    ? openSync(path, 'r')
    : openSync(path, fsConstants.O_RDONLY | O_NOFOLLOW)
}

export class SessionRecoveryJournalSink implements RecoveryJournalSink {
  private readonly filePath: string
  private readonly maxEntryBytes: number

  constructor(options: SessionRecoveryJournalSinkOptions = {}) {
    this.filePath =
      options.filePath ?? getSessionRecoveryJournalPath()
    this.maxEntryBytes =
      options.maxEntryBytes ?? MAX_PERSISTED_RECOVERY_ENTRY_BYTES
    ensurePositiveInteger('maxEntryBytes', this.maxEntryBytes)
  }

  path(): string {
    return this.filePath
  }

  append(entry: RecoveryJournalEntry): void {
    const validation = validateRecoveryJournalEntry(entry)
    if (!validation.entry) {
      throw new Error(
        `invalid recovery journal entry: ${validation.errors.join('; ')}`,
      )
    }

    const line = `${JSON.stringify(validation.entry)}\n`
    const sizeBytes = Buffer.byteLength(line, 'utf8')
    if (sizeBytes > this.maxEntryBytes) {
      throw new Error('recovery journal entry exceeds size limit')
    }

    const fd = openAppendOnlyPrivate(this.filePath)
    try {
      writeSync(fd, line, null, 'utf8')
    } finally {
      closeSync(fd)
    }
  }
}

export function readSessionRecoveryJournal(
  options: ReadSessionRecoveryJournalOptions = {},
): SessionRecoveryJournalReadResult {
  const filePath =
    options.filePath ?? getSessionRecoveryJournalPath()
  const maxFileBytes =
    options.maxFileBytes ?? MAX_PERSISTED_RECOVERY_JOURNAL_BYTES
  const maxEntries =
    options.maxEntries ?? MAX_PERSISTED_RECOVERY_JOURNAL_ENTRIES

  ensurePositiveInteger('maxFileBytes', maxFileBytes)
  ensurePositiveInteger('maxEntries', maxEntries)

  if (!existsSync(filePath)) {
    return {
      entries: [],
      diagnostics: {
        filePath,
        totalLines: 0,
        validEntries: 0,
        invalidLines: 0,
        truncatedEntries: 0,
      },
    }
  }

  const fd = openReadOnlyNoFollow(filePath)
  try {
    const stat = fstatSync(fd)
    if (stat.size > maxFileBytes) {
      throw new Error('recovery journal exceeds read size limit')
    }

    const raw = readFileSync(fd, 'utf8')
    const lines = raw.split('\n').filter(line => line.trim().length > 0)
    const truncatedEntries = Math.max(0, lines.length - maxEntries)
    const selected =
      truncatedEntries > 0 ? lines.slice(-maxEntries) : lines

    const entries: RecoveryJournalEntry[] = []
    let invalidLines = 0

    for (const line of selected) {
      if (
        Buffer.byteLength(line, 'utf8') >
        MAX_PERSISTED_RECOVERY_ENTRY_BYTES
      ) {
        invalidLines += 1
        continue
      }

      try {
        const parsed = JSON.parse(line) as unknown
        const validation = validateRecoveryJournalEntry(parsed)
        if (!validation.entry) {
          invalidLines += 1
          continue
        }
        entries.push(validation.entry)
      } catch {
        invalidLines += 1
      }
    }

    return {
      entries,
      diagnostics: {
        filePath,
        totalLines: lines.length,
        validEntries: entries.length,
        invalidLines,
        truncatedEntries,
      },
    }
  } finally {
    closeSync(fd)
  }
}
