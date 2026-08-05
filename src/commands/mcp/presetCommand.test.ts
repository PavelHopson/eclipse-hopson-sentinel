import assert from 'node:assert/strict'
import test from 'node:test'
import { Command } from '@commander-js/extra-typings'
import { registerMcpPresetCommand } from './presetCommand.js'

test('registerMcpPresetCommand exposes the curated preset command', () => {
  const mcp = new Command('mcp')
  registerMcpPresetCommand(mcp)
  const preset = mcp.commands.find(command => command.name() === 'add-preset')
  assert.ok(preset)
  assert.deepEqual(preset?.options.map(option => option.long), ['--scope', '--path'])
})
