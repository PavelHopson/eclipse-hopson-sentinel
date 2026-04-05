#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')

const checks = [
  {
    category: 'Core Files',
    points: 20,
    id: 'readme',
    description: 'README exists',
    pass: existsSync(resolve(repoRoot, 'README.md')),
  },
  {
    category: 'Core Files',
    points: 10,
    id: 'license',
    description: 'LICENSE exists',
    pass: existsSync(resolve(repoRoot, 'LICENSE')),
  },
  {
    category: 'Core Files',
    points: 10,
    id: 'security',
    description: 'SECURITY.md exists',
    pass: existsSync(resolve(repoRoot, 'SECURITY.md')),
  },
  {
    category: 'Bridge',
    points: 10,
    id: 'bridge-docs',
    description: 'Sentinel Bridge docs exist',
    pass: existsSync(resolve(repoRoot, 'docs', 'sentinel-bridge.md')),
  },
  {
    category: 'Voice',
    points: 10,
    id: 'voice-docs',
    description: 'Sentinel Voice MVP docs exist',
    pass: existsSync(resolve(repoRoot, 'docs', 'sentinel-voice-mvp.md')),
  },
  {
    category: 'Voice',
    points: 10,
    id: 'voice-doctor',
    description: 'Voice doctor script exists',
    pass: existsSync(resolve(repoRoot, 'scripts', 'sentinel-voice-doctor.ps1')),
  },
  {
    category: 'Voice',
    points: 10,
    id: 'tts-script',
    description: 'TTS script exists',
    pass: existsSync(resolve(repoRoot, 'scripts', 'sentinel-tts.ps1')),
  },
  {
    category: 'Voice',
    points: 10,
    id: 'stt-script',
    description: 'STT script exists',
    pass: existsSync(resolve(repoRoot, 'scripts', 'sentinel-stt.ps1')),
  },
  {
    category: 'Launchers',
    points: 10,
    id: 'sentinel-bin',
    description: 'Sentinel launcher exists',
    pass: existsSync(resolve(repoRoot, 'bin', 'sentinel')),
  },
  {
    category: 'Launchers',
    points: 10,
    id: 'sentinel-voice-bin',
    description: 'Sentinel Voice launcher exists',
    pass: existsSync(resolve(repoRoot, 'bin', 'sentinel-voice')),
  },
]

function safeRead(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

const readme = safeRead(resolve(repoRoot, 'README.md'))
const packageJsonRaw = safeRead(resolve(repoRoot, 'package.json'))

const bonusChecks = [
  {
    category: 'Bonus',
    points: 5,
    id: 'roadmap',
    description: 'Master roadmap exists',
    pass: existsSync(resolve(repoRoot, 'docs', 'sentinel-roadmap.md')),
  },
  {
    category: 'Bonus',
    points: 5,
    id: 'engineering-log',
    description: 'Engineering log exists',
    pass: existsSync(resolve(repoRoot, 'docs', 'sentinel-engineering-log.md')),
  },
  {
    category: 'Bonus',
    points: 5,
    id: 'voice-mentioned',
    description: 'README mentions Sentinel Voice',
    pass: readme.includes('Sentinel Voice'),
  },
  {
    category: 'Bonus',
    points: 5,
    id: 'package-bins',
    description: 'package.json exposes sentinel and sentinel-voice launchers',
    pass:
      packageJsonRaw.includes('"sentinel"') &&
      packageJsonRaw.includes('"sentinel-voice"'),
  },
]

const allChecks = [...checks, ...bonusChecks]

const categoryScores = new Map()
let totalPoints = 0
let earnedPoints = 0

for (const check of allChecks) {
  totalPoints += check.points
  if (!categoryScores.has(check.category)) {
    categoryScores.set(check.category, { earned: 0, total: 0 })
  }

  const category = categoryScores.get(check.category)
  category.total += check.points

  if (check.pass) {
    earnedPoints += check.points
    category.earned += check.points
  }
}

function grade(score) {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

const result = {
  ok: true,
  tool: 'sentinel-config-health',
  score: {
    earned: earnedPoints,
    total: totalPoints,
    percent: Math.round((earnedPoints / totalPoints) * 100),
    grade: grade(Math.round((earnedPoints / totalPoints) * 100)),
  },
  categories: [...categoryScores.entries()].map(([name, values]) => ({
    name,
    earned: values.earned,
    total: values.total,
  })),
  checks: allChecks.map(check => ({
    id: check.id,
    category: check.category,
    points: check.points,
    description: check.description,
    pass: check.pass,
  })),
}

console.log(JSON.stringify(result, null, 2))
