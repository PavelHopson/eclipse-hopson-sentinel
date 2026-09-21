export type DecisionPreflightFailureCategory =
  | 'reference-error'
  | 'type-error'
  | 'abort'
  | 'http-401'
  | 'http-403'
  | 'http-404'
  | 'http-429'
  | 'http-5xx'
  | 'http-error'
  | 'network'
  | 'tool-response-missing'
  | 'unknown'

function readStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null

  const record = error as Record<string, unknown>
  for (const key of ['status', 'statusCode'] as const) {
    const value = record[key]
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value
    }
  }

  for (const key of ['response', 'cause'] as const) {
    const nested = record[key]
    if (typeof nested !== 'object' || nested === null) continue
    for (const statusKey of ['status', 'statusCode'] as const) {
      const value = (nested as Record<string, unknown>)[statusKey]
      if (typeof value === 'number' && Number.isInteger(value)) {
        return value
      }
    }
  }

  return null
}

function readCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const value = (error as Record<string, unknown>).code
  return typeof value === 'string' ? value : null
}

export function classifyDecisionPreflightFailure(
  error: unknown,
): DecisionPreflightFailureCategory {
  if (error instanceof ReferenceError) return 'reference-error'
  if (error instanceof TypeError) return 'type-error'

  if (typeof error === 'object' && error !== null) {
    const name = (error as Record<string, unknown>).name
    if (name === 'AbortError') return 'abort'
    if (name === 'AuthenticationError') return 'http-401'
    if (name === 'PermissionDeniedError') return 'http-403'
    if (name === 'NotFoundError') return 'http-404'
    if (name === 'RateLimitError') return 'http-429'
    if (name === 'InternalServerError') return 'http-5xx'
    if (
      name === 'APIConnectionError' ||
      name === 'APIConnectionTimeoutError'
    ) {
      return 'network'
    }
  }

  const status = readStatus(error)
  if (status === 401) return 'http-401'
  if (status === 403) return 'http-403'
  if (status === 404) return 'http-404'
  if (status === 429) return 'http-429'
  if (status !== null && status >= 500 && status <= 599) return 'http-5xx'
  if (status !== null && status >= 400 && status <= 499) return 'http-error'

  const code = readCode(error)
  if (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ETIMEDOUT'
  ) {
    return 'network'
  }

  if (
    error instanceof Error &&
    error.message === 'structured decision tool was not returned'
  ) {
    return 'tool-response-missing'
  }

  return 'unknown'
}
