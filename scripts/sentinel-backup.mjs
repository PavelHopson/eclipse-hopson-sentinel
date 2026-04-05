#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')
const backupsRoot = resolve(repoRoot, '.sentinel', 'backups')
const backupsIndexFile = resolve(repoRoot, '.sentinel', 'backups-index.json')

const trackedPaths = [
  'README.md',
  'SECURITY.md',
  'package.json',
  'docs',
  'scripts/sentinel-tts.ps1',
  'scripts/sentinel-stt.ps1',
  'scripts/sentinel-voice-doctor.ps1',
  'scripts/sentinel-config-health.mjs',
  'bin/sentinel',
  'bin/sentinel-voice',
  '.sentinel/bridge',
]

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function readIndex() {
  if (!existsSync(backupsIndexFile)) {
    return readBackupsFromFilesystem()
  }

  try {
    const parsed = JSON.parse(readFileSync(backupsIndexFile, 'utf8'))
    const fromIndex = Array.isArray(parsed.backups) ? parsed.backups : []
    const fromFilesystem = readBackupsFromFilesystem()
    return normalizeBackups([...fromIndex, ...fromFilesystem])
  } catch {
    return readBackupsFromFilesystem()
  }
}

function readBackupsFromFilesystem() {
  if (!existsSync(backupsRoot)) {
    return []
  }

  return readdirSync(backupsRoot)
    .map(name => {
      const snapshotDir = resolve(backupsRoot, name)
      const manifestFile = resolve(snapshotDir, 'manifest.json')
      if (!statSync(snapshotDir).isDirectory() || !existsSync(manifestFile)) {
        return null
      }

      try {
        const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
        return {
          snapshotId: manifest.snapshotId ?? name,
          createdAt: manifest.createdAt ?? null,
          copiedCount: Array.isArray(manifest.copied) ? manifest.copied.length : 0,
        }
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
}

function normalizeBackups(backups) {
  const deduped = []
  const seen = new Set()

  for (const backup of backups) {
    if (!backup?.snapshotId || seen.has(backup.snapshotId)) {
      continue
    }
    seen.add(backup.snapshotId)
    deduped.push(backup)
  }

  return deduped.sort((a, b) =>
    String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
  )
}

function writeIndex(backups) {
  const deduped = normalizeBackups(backups)

  mkdirSync(dirname(backupsIndexFile), { recursive: true })
  writeFileSync(
    backupsIndexFile,
    JSON.stringify(
      {
        ok: true,
        backups: deduped,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  )
}

function createBackup() {
  const snapshotId = `backup-${timestamp()}`
  const snapshotDir = resolve(backupsRoot, snapshotId)

  mkdirSync(snapshotDir, { recursive: true })

  const copied = []

  for (const relativePath of trackedPaths) {
    const source = resolve(repoRoot, relativePath)
    if (!existsSync(source)) {
      continue
    }

    const target = resolve(snapshotDir, relativePath)
    mkdirSync(dirname(target), { recursive: true })
    cpSync(source, target, { recursive: true })
    copied.push(relativePath)
  }

  const manifest = {
    ok: true,
    snapshotId,
    createdAt: new Date().toISOString(),
    root: repoRoot,
    copied,
  }

  writeFileSync(
    resolve(snapshotDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  )

  const index = readIndex()
  index.unshift({
    snapshotId,
    createdAt: manifest.createdAt,
    copiedCount: copied.length,
  })
  writeIndex(index)

  console.log(JSON.stringify(manifest, null, 2))
}

function listBackups() {
  console.log(
    JSON.stringify(
      {
        ok: true,
        backups: readIndex(),
      },
      null,
      2,
    ),
  )
}

function restoreBackup(snapshotId) {
  if (!snapshotId) {
    console.error('Restore requires a snapshot id')
    process.exit(1)
  }

  const snapshotDir = resolve(backupsRoot, snapshotId)
  const manifestFile = resolve(snapshotDir, 'manifest.json')

  if (!existsSync(snapshotDir) || !existsSync(manifestFile)) {
    console.error(`Backup not found: ${snapshotId}`)
    process.exit(1)
  }

  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  const restored = []

  for (const relativePath of manifest.copied ?? []) {
    const source = resolve(snapshotDir, relativePath)
    if (!existsSync(source)) {
      continue
    }

    const target = resolve(repoRoot, relativePath)
    mkdirSync(dirname(target), { recursive: true })
    cpSync(source, target, { recursive: true })
    restored.push(relativePath)
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        restoredFrom: snapshotId,
        warning:
          'Restore overwrites tracked Sentinel surfaces in the working tree. Use backups carefully.',
        restored,
      },
      null,
      2,
    ),
  )
}

const mode = process.argv[2] || 'create'

if (mode === 'create') {
  createBackup()
} else if (mode === 'list') {
  listBackups()
} else if (mode === 'restore') {
  restoreBackup(process.argv[3])
} else {
  console.error(`Unknown mode: ${mode}`)
  process.exit(1)
}
