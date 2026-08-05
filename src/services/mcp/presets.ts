import { resolve } from 'path'
import type { McpStdioServerConfig } from './types.js'

export const MCP_PRESET_NAMES = ['github-readonly', 'filesystem', 'context7'] as const

export type McpPresetName = (typeof MCP_PRESET_NAMES)[number]

const FILESYSTEM_PACKAGE = '@modelcontextprotocol/server-filesystem@2026.7.10'
const CONTEXT7_PACKAGE = '@upstash/context7-mcp@3.2.5'
const GITHUB_IMAGE = 'ghcr.io/github/github-mcp-server:0.31.0'

function npxConfig(packageName: string, args: string[] = []): McpStdioServerConfig {
  return process.platform === 'win32'
    ? { type: 'stdio', command: 'cmd', args: ['/c', 'npx', '-y', packageName, ...args] }
    : { type: 'stdio', command: 'npx', args: ['-y', packageName, ...args] }
}
export function isMcpPresetName(value: string): value is McpPresetName {
  return MCP_PRESET_NAMES.includes(value as McpPresetName)
}

export function buildMcpPreset(
  preset: McpPresetName,
  options: { allowedDirectory?: string } = {},
): McpStdioServerConfig {
  if (preset === 'filesystem') {
    if (!options.allowedDirectory) {
      throw new Error('Filesystem preset requires --path <directory>.')
    }
    return npxConfig(FILESYSTEM_PACKAGE, [resolve(options.allowedDirectory)])
  }

  if (preset === 'context7') {
    return npxConfig(CONTEXT7_PACKAGE)
  }

  return {
    type: 'stdio',
    command: 'docker',
    args: [
      'run',
      '-i',
      '--rm',
      '-e',
      'GITHUB_PERSONAL_ACCESS_TOKEN',
      '-e',
      'GITHUB_READ_ONLY',
      '-e',
      'GITHUB_LOCKDOWN_MODE',
      '-e',
      'GITHUB_TOOLSETS',
      GITHUB_IMAGE,
    ],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: '${GITHUB_PERSONAL_ACCESS_TOKEN}',
      GITHUB_READ_ONLY: '1',
      GITHUB_LOCKDOWN_MODE: '1',
      GITHUB_TOOLSETS: 'context,repos,pull_requests',
    },
  }
}
