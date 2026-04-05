import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { randomUUID } from 'crypto'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

export type SentinelBridgeConfig = {
  host: string
  port: number
  token?: string
}

export type SentinelBridgeAskRequest = {
  prompt: string
  cwd?: string
}

type SentinelBridgeSessionRecord = {
  id: string
  cwd: string
  sentinelSessionId: string | null
  createdAt: string
  updatedAt: string
}

type SentinelBridgeSessionCreateRequest = {
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

type SentinelBridgeSessionResponse = {
  ok: true
  session: {
    id: string
    cwd: string
    sentinelSessionId: string | null
    createdAt: string
    updatedAt: string
  }
}

function getBridgeStateFilePath(): string {
  return resolve(process.cwd(), '.sentinel', 'bridge', 'sessions.json')
}

function loadPersistedSessions(): Map<string, SentinelBridgeSessionRecord> {
  const stateFile = getBridgeStateFilePath()

  if (!existsSync(stateFile)) {
    return new Map()
  }

  try {
    const raw = readFileSync(stateFile, 'utf8').trim()
    if (!raw) {
      return new Map()
    }

    const parsed = JSON.parse(raw) as { sessions?: SentinelBridgeSessionRecord[] }
    const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : []

    return new Map(sessions.map(session => [session.id, session]))
  } catch {
    return new Map()
  }
}

function persistSessions(sessions: Map<string, SentinelBridgeSessionRecord>): void {
  const stateFile = getBridgeStateFilePath()
  const stateDir = dirname(stateFile)

  mkdirSync(stateDir, { recursive: true })
  writeFileSync(
    stateFile,
    JSON.stringify(
      {
        sessions: [...sessions.values()],
      },
      null,
      2,
    ) + '\n',
    'utf8',
  )
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
  resumeSessionId?: string | null,
): Promise<SentinelBridgeAskResponse> {
  const prompt = request.prompt?.trim()
  if (!prompt) {
    throw new Error('Missing prompt')
  }

  const cliEntrypoint = getCliEntrypointPath()

  return await new Promise((resolvePromise, rejectPromise) => {
    const childArgs = [cliEntrypoint, '--print', '--output-format', 'json']
    if (resumeSessionId) {
      childArgs.push('--resume', resumeSessionId)
    }
    childArgs.push(prompt)

    const child = spawn(
      process.execPath,
      childArgs,
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

function toSessionPayload(
  session: SentinelBridgeSessionRecord,
): SentinelBridgeSessionResponse {
  return {
    ok: true,
    session: {
      id: session.id,
      cwd: session.cwd,
      sentinelSessionId: session.sentinelSessionId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
  }
}

export async function startSentinelBridgeServer(
  config: SentinelBridgeConfig,
): Promise<{ close: () => Promise<void>; token?: string }> {
  const token = config.token || process.env.SENTINEL_BRIDGE_TOKEN || randomUUID()
  const sessions = loadPersistedSessions()

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
      const requestUrl = new URL(req.url || '/', `http://${config.host}:${config.port}`)
      const pathname = requestUrl.pathname

      if (method === 'GET' && pathname === '/health') {
        sendJson(res, 200, {
          ok: true,
          service: 'sentinel-bridge',
          status: 'healthy',
          responseFormat: 'voice-v1',
          persistedSessions: sessions.size,
        })
        return
      }

      if (method === 'POST' && pathname === '/v1/ask') {
        const body = (await readJsonBody(req)) as Partial<SentinelBridgeAskRequest>
        const result = await runSentinelPrompt({
          prompt: body.prompt || '',
          cwd: body.cwd,
        })
        sendJson(res, 200, result)
        return
      }

      if (method === 'POST' && pathname === '/v1/sessions') {
        const body =
          (await readJsonBody(req)) as Partial<SentinelBridgeSessionCreateRequest>
        const now = new Date().toISOString()
        const session: SentinelBridgeSessionRecord = {
          id: randomUUID(),
          cwd: body.cwd || process.cwd(),
          sentinelSessionId: null,
          createdAt: now,
          updatedAt: now,
        }
        sessions.set(session.id, session)
        persistSessions(sessions)
        sendJson(res, 201, toSessionPayload(session))
        return
      }

      const askMatch = pathname.match(/^\/v1\/sessions\/([0-9a-fA-F-]+)\/ask$/)
      if (method === 'POST' && askMatch) {
        const session = sessions.get(askMatch[1])
        if (!session) {
          sendJson(res, 404, {
            ok: false,
            error: 'Session not found',
          })
          return
        }

        const body = (await readJsonBody(req)) as Partial<SentinelBridgeAskRequest>
        const effectiveCwd = body.cwd || session.cwd
        const result = await runSentinelPrompt(
          {
            prompt: body.prompt || '',
            cwd: effectiveCwd,
          },
          session.sentinelSessionId,
        )

        const nextSentinelSessionId =
          result.response.session.id || result.parsed?.session_id || null
        session.cwd = effectiveCwd
        session.sentinelSessionId = nextSentinelSessionId
        session.updatedAt = new Date().toISOString()
        sessions.set(session.id, session)
        persistSessions(sessions)

        sendJson(res, 200, {
          ...result,
          bridgeSession: {
            id: session.id,
            cwd: session.cwd,
            sentinelSessionId: session.sentinelSessionId,
            updatedAt: session.updatedAt,
          },
        })
        return
      }

      const sessionMatch = pathname.match(/^\/v1\/sessions\/([0-9a-fA-F-]+)$/)
      if (sessionMatch) {
        const session = sessions.get(sessionMatch[1])
        if (!session) {
          sendJson(res, 404, {
            ok: false,
            error: 'Session not found',
          })
          return
        }

        if (method === 'GET') {
          sendJson(res, 200, toSessionPayload(session))
          return
        }

        if (method === 'DELETE') {
          sessions.delete(session.id)
          persistSessions(sessions)
          sendJson(res, 200, {
            ok: true,
            deleted: true,
            sessionId: session.id,
          })
          return
        }
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
