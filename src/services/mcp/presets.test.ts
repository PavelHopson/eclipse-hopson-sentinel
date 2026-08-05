import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMcpPreset, isMcpPresetName } from './presets.js'

test('GitHub preset is pinned, read-only, lockdown, and keeps the token out of config', () => {
  const config = buildMcpPreset('github-readonly')
  assert.ok(config.args.includes('ghcr.io/github/github-mcp-server:0.31.0'))
  assert.equal(config.env?.GITHUB_READ_ONLY, '1')
  assert.equal(config.env?.GITHUB_LOCKDOWN_MODE, '1')
  assert.equal(config.env?.GITHUB_PERSONAL_ACCESS_TOKEN, '${GITHUB_PERSONAL_ACCESS_TOKEN}')
  assert.doesNotMatch(JSON.stringify(config), /github_pat_|ghp_/)
})
test('Filesystem preset pins the package and resolves exactly one allowed directory', () => {
  const config = buildMcpPreset('filesystem', { allowedDirectory: '.' })
  assert.ok(config.args.includes('@modelcontextprotocol/server-filesystem@2026.7.10'))
  assert.equal(config.args.at(-1), process.cwd())
})

test('Filesystem preset fails closed without an allowed directory', () => {
  assert.throws(() => buildMcpPreset('filesystem'), /requires --path/)
})

test('Context7 preset is version-pinned and does not persist an API key', () => {
  const config = buildMcpPreset('context7')
  assert.ok(config.args.includes('@upstash/context7-mcp@3.2.5'))
  assert.equal(config.env, undefined)
})

test('Preset names are allowlisted', () => {
  assert.equal(isMcpPresetName('github-readonly'), true)
  assert.equal(isMcpPresetName('postgres'), false)
})
