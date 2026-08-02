import { isIP } from 'node:net'

export type BrowserIntent =
  | 'read_public_page'
  | 'form_input'
  | 'payment'
  | 'publish'
  | 'account_change'

export interface BrowserCapabilityRequest {
  url: string
  intent: BrowserIntent
  allowedDomains: string[]
  importCookies?: boolean
  externalTelemetry?: boolean
  approvedByHuman?: boolean
}

export interface BrowserCapabilityDecision {
  allowed: boolean
  reason:
    | 'allowed_read_only'
    | 'invalid_url'
    | 'https_required'
    | 'private_destination'
    | 'domain_not_allowlisted'
    | 'cookie_import_forbidden'
    | 'external_telemetry_forbidden'
    | 'human_approval_required'
    | 'mutation_forbidden'
  executionBoundary: 'isolated_browser_worker'
  contentTrust: 'untrusted'
}

function isPrivateIpv4(hostname: string): boolean {
  if (isIP(hostname) !== 4) return false
  const [a, b] = hostname.split('.').map(Number)
  return a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a === 0
}

function isPrivateHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  const ipv6 = isIP(normalized) === 6
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized === '::'
    || normalized === '::1'
    || (ipv6 && (normalized.startsWith('fc') || normalized.startsWith('fd')))
    || (ipv6 && /^fe[89ab]/.test(normalized))
    || (ipv6 && normalized.startsWith('::ffff:') && isPrivateIpv4(normalized.slice(7)))
    || isPrivateIpv4(normalized)
}

function domainAllowed(hostname: string, allowlist: string[]): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  return allowlist.some(domain => {
    const allowed = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
    return allowed.length > 0 && (normalized === allowed || normalized.endsWith(`.${allowed}`))
  })
}

export function decideBrowserCapability(request: BrowserCapabilityRequest): BrowserCapabilityDecision {
  const base = { executionBoundary: 'isolated_browser_worker', contentTrust: 'untrusted' } as const
  let target: URL
  try {
    target = new URL(request.url)
  } catch {
    return { ...base, allowed: false, reason: 'invalid_url' }
  }

  if (target.protocol !== 'https:') return { ...base, allowed: false, reason: 'https_required' }
  if (target.username || target.password) return { ...base, allowed: false, reason: 'invalid_url' }
  if (isPrivateHost(target.hostname)) return { ...base, allowed: false, reason: 'private_destination' }
  if (!domainAllowed(target.hostname, request.allowedDomains)) return { ...base, allowed: false, reason: 'domain_not_allowlisted' }
  if (request.importCookies) return { ...base, allowed: false, reason: 'cookie_import_forbidden' }
  if (request.externalTelemetry) return { ...base, allowed: false, reason: 'external_telemetry_forbidden' }

  if (request.intent !== 'read_public_page') {
    if (!request.approvedByHuman) return { ...base, allowed: false, reason: 'human_approval_required' }
    return { ...base, allowed: false, reason: 'mutation_forbidden' }
  }
  return { ...base, allowed: true, reason: 'allowed_read_only' }
}

export function safeCamofoxEnvironment(accessKey: string): Record<string, string> {
  if (accessKey.length < 32 || /\s/.test(accessKey)) {
    throw new Error('Camofox access key must contain at least 32 non-whitespace characters')
  }
  return {
    CAMOFOX_BIND_HOST: '127.0.0.1',
    CAMOFOX_ACCESS_KEY: accessKey,
    CAMOFOX_CRASH_REPORT_ENABLED: 'false',
  }
}
