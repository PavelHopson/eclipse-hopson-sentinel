import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { randomUUID } from 'crypto'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import { existsSync } from 'fs'

export type SentinelBridgeConfig = {
  host: string
  port: number
  token?: string
}

export type SentinelBridgeAskRequest = {
  prompt: string
  cwd?: string
}

function getCliEntrypointPath(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(moduleDir, '..', 'cli.mjs'),
    join(moduleDir, '..', '..', 'dist', 'cli.mjs'),
    resolve(process.cwd(), 'dist', 'cli.mjs'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return candidates[candidates.length - 1]
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) {
    return {}
  }

  return JSON.parse(raw)
}

function isAuthorized(req: IncomingMessage, token?: string): boolean {
  if (!token) {
    return true
  }

  const authHeader = req.headers.authorization
  return authHeader === `Bearer ${token}`
}

async function runSentinelPrompt(
  request: SentinelBridgeAskRequest,
): Promise<Record<string, unknown>> {
  const prompt = request.prompt?.trim()
  if (!prompt) {
    throw new Error('Missing prompt')
  }

  const cliEntrypoint = getCliEntrypointPath()

  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [cliEntrypoint, '--print', '--output-format', 'json', prompt],
      {
        cwd: request.cwd || process.cwd(),
        env: process.env,
      },
    )

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })

    child.on('error', rejectPromise)

    child.on('close', code => {
      const trimmed = stdout.trim()
      let parsed: unknown = null

      if (trimmed) {
        try {
          parsed = JSON.parse(trimmed)
        } catch {
          parsed = null
        }
      }

      resolvePromise({
        ok: code === 0,
        exitCode: code,
        stdout: trimmed,
        stderr: stderr.trim(),
        parsed,
      })
    })
  })
}

export async function startSentinelBridgeServer(
  config: SentinelBridgeConfig,
): Promise<{ close: () => Promise<void>; token?: string }> {
  const token = config.token || process.env.SENTINEL_BRIDGE_TOKEN || randomUUID()

  const server = createServer(async (req, res) => {
    try {
      if (!isAuthorized(req, token)) {
        sendJson(res, 401, {
          ok: false,
          error: 'Unauthorized',
        })
        return
      }

      const method = req.method || 'GET'
      const url = req.url || '/'

      if (method === 'GET' && url === '/health') {
        sendJson(res, 200, {
          ok: true,
          service: 'sentinel-bridge',
          status: 'healthy',
        })
        return
      }

      if (method === 'POST' && url === '/v1/ask') {
        const body = (await readJsonBody(req)) as Partial<SentinelBridgeAskRequest>
        const result = await runSentinelPrompt({
          prompt: body.prompt || '',
          cwd: body.cwd,
        })
        sendJson(res, 200, result)
        return
      }

      sendJson(res, 404, {
        ok: false,
        error: 'Not found',
      })
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise)
    server.listen(config.port, config.host, () => resolvePromise())
  })

  return {
    token,
    close: async () => {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        server.close(err => (err ? rejectPromise(err) : resolvePromise()))
      })
    },
  }
}
