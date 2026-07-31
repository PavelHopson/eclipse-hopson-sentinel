import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

assert.equal(packageJson.private, true, 'npm package must remain private')
assert.equal(
  packageJson.license,
  'SEE LICENSE FILE',
  'package metadata must not claim repository-wide MIT licensing',
)
assert.equal(
  Object.hasOwn(packageJson, 'publishConfig'),
  false,
  'private distribution must not expose npm publish configuration',
)

const updateResult = spawnSync(process.execPath, ['dist/cli.mjs', 'update'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  timeout: 15_000,
  env: { ...process.env, DISABLE_AUTOUPDATER: '0' },
})

assert.equal(
  updateResult.error,
  undefined,
  updateResult.error?.message ?? 'update command failed to start',
)
assert.equal(updateResult.signal, null, 'update command must not time out')
assert.equal(updateResult.status, 0, updateResult.stderr)
assert.match(
  updateResult.stdout,
  /Auto-update is disabled for this private Sentinel build/,
)

console.log('Private distribution guard passed.')
