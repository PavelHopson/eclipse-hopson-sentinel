import type { LocalCommandCall } from '../../types/command.js'
import { startSentinelBridgeServer } from '../../server/sentinelBridgeServer.js'

function parseArgs(args: string): { host: string; port: number; token?: string } {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  let host = '127.0.0.1'
  let port = 8765
  let token: string | undefined

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]
    const next = parts[i + 1]

    if (part === '--host' && next) {
      host = next
      i += 1
      continue
    }

    if (part === '--port' && next) {
      const parsed = Number(next)
      if (!Number.isNaN(parsed) && parsed > 0) {
        port = parsed
      }
      i += 1
      continue
    }

    if (part === '--token' && next) {
      token = next
      i += 1
    }
  }

  return { host, port, token }
}

export const call: LocalCommandCall = async args => {
  const config = parseArgs(args)
  const bridge = await startSentinelBridgeServer(config)

  const lines = [
    'Sentinel Bridge is running.',
    `Host: ${config.host}`,
    `Port: ${config.port}`,
    `Health: http://${config.host}:${config.port}/health`,
    `Ask endpoint: http://${config.host}:${config.port}/v1/ask`,
    `Token: ${bridge.token}`,
    '',
    'Press Ctrl+C to stop the bridge.',
  ]

  process.stdout.write(`${lines.join('\n')}\n`)

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const cleanup = async () => {
      process.off('SIGINT', onSigint)
      process.off('SIGTERM', onSigterm)
      try {
        await bridge.close()
        resolvePromise()
      } catch (error) {
        rejectPromise(error)
      }
    }

    const onSigint = () => {
      void cleanup()
    }

    const onSigterm = () => {
      void cleanup()
    }

    process.on('SIGINT', onSigint)
    process.on('SIGTERM', onSigterm)
  })

  return {
    type: 'text',
    value: 'Sentinel Bridge stopped.',
  }
}

export default { call }
