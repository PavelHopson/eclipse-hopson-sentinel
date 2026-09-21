import assert from 'node:assert/strict'
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  createRecoveryJournalEntry,
  type RecoveryJournalEntry,
} from './recoveryRunJournal.ts'
import {
  getSessionRecoveryJournalPath,
  MAX_PERSISTED_RECOVERY_ENTRY_BYTES,
  readSessionRecoveryJournal,
  SessionRecoveryJournalSink,
} from './sessionRecoveryJournal.ts'
import { SupervisedRecoverySession } from './supervisedRecoverySession.ts'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'sentinel-recovery-journal-'))
}

function fixtureEntry(sequence = 1): RecoveryJournalEntry {
  const session = new SupervisedRecoverySession()
  const snapshot = session.record({ type: 'failure' })
  return createRecoveryJournalEntry({
    sequence,
    event: 'failure',
    snapshot,
    recordedAt: '2026-09-21T12:00:00.000Z',
  })
}

test('derives a recovery sidecar path without touching transcript JSONL', () => {
  assert.equal(
    getSessionRecoveryJournalPath('/tmp/session-123.jsonl'),
    '/tmp/session-123.recovery.jsonl',
  )
  assert.equal(
    getSessionRecoveryJournalPath('/tmp/session-123'),
    '/tmp/session-123.recovery.jsonl',
  )
  assert.throws(() => getSessionRecoveryJournalPath(''), /non-empty/)
})

test('sink resolves transcriptPath explicitly and rejects ambiguous configuration', t => {
  const dir = tempDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const transcriptPath = join(dir, 'session.jsonl')
  const expected = join(dir, 'session.recovery.jsonl')
  const sink = new SessionRecoveryJournalSink({ transcriptPath })

  assert.equal(sink.path(), expected)
  assert.throws(
    () =>
      new SessionRecoveryJournalSink({
        transcriptPath,
        filePath: expected,
      }),
    /either filePath or transcriptPath/,
  )
  assert.throws(
    () => new SessionRecoveryJournalSink(),
    /filePath or transcriptPath is required/,
  )
})

test('persists and reloads validated append-only recovery entries', t => {
  const dir = tempDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const filePath = join(dir, 'session.recovery.jsonl')
  const sink = new SessionRecoveryJournalSink({ filePath })

  sink.append(fixtureEntry(1))
  sink.append(fixtureEntry(2))

  const raw = readFileSync(filePath, 'utf8')
  assert.equal(raw.trim().split('\n').length, 2)

  const result = readSessionRecoveryJournal({ filePath })
  assert.equal(result.entries.length, 2)
  assert.equal(result.entries[0]?.sequence, 1)
  assert.equal(result.entries[1]?.sequence, 2)
  assert.deepEqual(result.diagnostics, {
    filePath,
    totalLines: 2,
    validEntries: 2,
    invalidLines: 0,
    truncatedEntries: 0,
  })

  if (process.platform !== 'win32') {
    assert.equal(lstatSync(filePath).mode & 0o777, 0o600)
  }
})

test('reader skips malformed or authority-escalating lines', t => {
  const dir = tempDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const filePath = join(dir, 'session.recovery.jsonl')
  const valid = fixtureEntry(1)
  const unsafe = {
    ...fixtureEntry(2),
    externalActionAuthorized: true,
  }

  writeFileSync(
    filePath,
    [
      JSON.stringify(valid),
      '{bad-json',
      JSON.stringify(unsafe),
      '',
    ].join('\n'),
    { mode: 0o600 },
  )

  const result = readSessionRecoveryJournal({ filePath })
  assert.equal(result.entries.length, 1)
  assert.equal(result.entries[0]?.sequence, 1)
  assert.equal(result.diagnostics.invalidLines, 2)
})

test('reader remains bounded and reports dropped historical lines', t => {
  const dir = tempDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const filePath = join(dir, 'session.recovery.jsonl')
  writeFileSync(
    filePath,
    [1, 2, 3, 4]
      .map(sequence => JSON.stringify(fixtureEntry(sequence)))
      .join('\n') + '\n',
    { mode: 0o600 },
  )

  const result = readSessionRecoveryJournal({
    filePath,
    maxEntries: 2,
  })

  assert.deepEqual(
    result.entries.map(entry => entry.sequence),
    [3, 4],
  )
  assert.equal(result.diagnostics.truncatedEntries, 2)
  assert.equal(result.diagnostics.totalLines, 4)
})

test('sink rejects oversized entries before opening the sidecar', t => {
  const dir = tempDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const filePath = join(dir, 'session.recovery.jsonl')
  const sink = new SessionRecoveryJournalSink({
    filePath,
    maxEntryBytes: 32,
  })

  assert.throws(
    () => sink.append(fixtureEntry()),
    /exceeds size limit/,
  )
  assert.throws(
    () =>
      new SessionRecoveryJournalSink({
        filePath,
        maxEntryBytes: 0,
      }),
    /positive integer/,
  )

  assert.ok(MAX_PERSISTED_RECOVERY_ENTRY_BYTES > 32)
})

test('reader rejects a file larger than configured bound', t => {
  const dir = tempDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const filePath = join(dir, 'session.recovery.jsonl')
  writeFileSync(filePath, JSON.stringify(fixtureEntry()) + '\n', {
    mode: 0o600,
  })

  assert.throws(
    () =>
      readSessionRecoveryJournal({
        filePath,
        maxFileBytes: 8,
      }),
    /exceeds read size limit/,
  )
})

test('POSIX sink refuses symbolic-link sidecars', t => {
  if (process.platform === 'win32') {
    t.skip('POSIX O_NOFOLLOW contract')
    return
  }

  const dir = tempDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const target = join(dir, 'target.jsonl')
  const link = join(dir, 'session.recovery.jsonl')
  writeFileSync(target, '', { mode: 0o600 })
  symlinkSync(target, link)

  const sink = new SessionRecoveryJournalSink({ filePath: link })
  assert.throws(() => sink.append(fixtureEntry()))
  assert.equal(readFileSync(target, 'utf8'), '')
})

test('existing POSIX sidecar permissions are tightened on append', t => {
  if (process.platform === 'win32') {
    t.skip('POSIX mode contract')
    return
  }

  const dir = tempDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const filePath = join(dir, 'session.recovery.jsonl')
  writeFileSync(filePath, '', { mode: 0o666 })
  chmodSync(filePath, 0o666)

  new SessionRecoveryJournalSink({ filePath }).append(fixtureEntry())

  assert.equal(lstatSync(filePath).mode & 0o777, 0o600)
})
