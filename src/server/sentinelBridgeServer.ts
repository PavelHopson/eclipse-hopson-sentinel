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

type SentinelCliResultMessage = {
  type?: string
  subtype?: string
  result?: string
  session_id?: string
  total_cost_usd?: number
  duration_ms?: number
  duration_api_ms?: number
  num_turns?: number
  is_error?: boolean
  errors?: string[]
  usage?: Record<string, unknown>
  modelUsage?: Record<string, unknown>
}

type SentinelBridgeAskResponse = {
  ok: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  parsed: SentinelCliResultMessage | null
  response: {
    format: 'voice-v1'
    reply: string
    summary: string
    errors: string[]
    session: {
      id: string | null
      turns: number | null
    }
    metrics: {
      durationMs: number | null
      apiDurationMs: number | null
      totalCostUsd: number | null
    }
    rawResultType: string | null
    rawResultSubtype: string | null
  }
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
): Promise<SentinelBridgeAskResponse> {
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
      let parsed: SentinelCliResultMessage | null = null

      if (trimmed) {
        try {
          parsed = JSON.parse(trimmed) as SentinelCliResultMessage
        } catch {
          parsed = null
        }
      }

      const errors = Array.isArray(parsed?.errors)
        ? parsed.errors.filter(
            (entry): entry is string => typeof entry === 'string' && entry.length > 0,
          )
        : stderr
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)

      const reply =
        typeof parsed?.result === 'string' && parsed.result.trim()
          ? parsed.result.trim()
          : trimmed || stderr.trim()

      resolvePromise({
        ok: code === 0,
        exitCode: code,
        stdout: trimmed,
        stderr: stderr.trim(),
        parsed,
        response: {
          format: 'voice-v1',
          reply,
          summary: reply.slice(0, 280),
          errors,
          session: {
            id: parsed?.session_id ?? null,
            turns: parsed?.num_turns ?? null,
          },
          metrics: {
            durationMs: parsed?.duration_ms ?? null,
            apiDurationMs: parsed?.duration_api_ms ?? null,
            totalCostUsd: parsed?.total_cost_usd ?? null,
          },
          rawResultType: parsed?.type ?? null,
          rawResultSubtype: parsed?.subtype ?? null,
        },
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
          responseFormat: 'voice-v1',
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
