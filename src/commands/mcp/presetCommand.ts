import { stat } from 'fs/promises'
import { type Command } from '@commander-js/extra-typings'
import { cliError, cliOk } from '../../cli/exit.js'
import { addMcpConfig } from '../../services/mcp/config.js'
import {
  buildMcpPreset,
  isMcpPresetName,
  MCP_PRESET_NAMES,
} from '../../services/mcp/presets.js'
import { describeMcpConfigFilePath, ensureConfigScope } from '../../services/mcp/utils.js'

export function registerMcpPresetCommand(mcp: Command): void {
  mcp
    .command('add-preset <preset>')
    .description('Add a version-pinned Eclipse MCP preset with least-privilege defaults')
    .option('-s, --scope <scope>', 'Configuration scope (local, user, or project)', 'local')
    .option('--path <directory>', 'Single allowed directory for the filesystem preset')
    .action(async (preset, options) => {
      if (!isMcpPresetName(preset)) {
        cliError(`Unknown preset "${preset}". Choose: ${MCP_PRESET_NAMES.join(', ')}`)
      }

      if (preset === 'filesystem') {
        if (!options.path) {
          cliError('Filesystem preset requires --path <directory>.')
        }
        const info = await stat(options.path).catch(() => undefined)
        if (!info?.isDirectory()) {
          cliError(`Filesystem path is not an existing directory: ${options.path}`)
        }
      }

      const scope = ensureConfigScope(options.scope)
      const config = buildMcpPreset(preset, { allowedDirectory: options.path })
      await addMcpConfig(preset, config, scope)

      process.stdout.write(`Added secure MCP preset ${preset} to ${scope} config.\n`)
      if (preset === 'github-readonly') {
        process.stdout.write('Set GITHUB_PERSONAL_ACCESS_TOKEN before starting Sentinel; use a fine-grained read-only token.\n')
      }
      process.stdout.write('Run `sentinel mcp doctor` and inspect tool descriptions before first use.\n')
      cliOk(`File modified: ${describeMcpConfigFilePath(scope)}`)
    })
}
