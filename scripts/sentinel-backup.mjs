#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')
const backupsRoot = resolve(repoRoot, '.sentinel', 'backups')

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

  console.log(JSON.stringify(manifest, null, 2))
}

function listBackups() {
  if (!existsSync(backupsRoot)) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          backups: [],
        },
        null,
        2,
      ),
    )
    return
  }

  const indexFile = resolve(backupsRoot, '..', 'backups-index.json')
  if (existsSync(indexFile)) {
    console.log(readFileSync(indexFile, 'utf8'))
    return
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        backups: [],
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
} else {
  console.error(`Unknown mode: ${mode}`)
  process.exit(1)
}
