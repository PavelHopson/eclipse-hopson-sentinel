import type { Command } from '../../commands.js'

const sentinelBridge = {
  type: 'local',
  name: 'sentinel-bridge',
  aliases: ['voice-bridge'],
  description: 'Start a localhost JSON bridge for Sentinel Voice and external clients',
  supportsNonInteractive: true,
  immediate: true,
  load: () => import('./sentinel-bridge.js'),
} satisfies Command

export default sentinelBridge
