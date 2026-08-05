import { describe, expect, test } from 'bun:test'
import { decideBrowserCapability, safeCamofoxEnvironment } from './browserCapabilityPolicy'

describe('browser capability policy', () => {
  test('allows only read-only HTTPS navigation to an allowlisted public domain', () => {
    expect(decideBrowserCapability({
      url: 'https://docs.example.com/releases',
      intent: 'read_public_page',
      allowedDomains: ['example.com'],
    })).toMatchObject({ allowed: true, reason: 'allowed_read_only', contentTrust: 'untrusted' })
  })

  test('blocks private destinations, lookalike domains, cookies and telemetry', () => {
    expect(decideBrowserCapability({ url: 'https://127.0.0.1/admin', intent: 'read_public_page', allowedDomains: ['127.0.0.1'] }).reason).toBe('private_destination')
    expect(decideBrowserCapability({ url: 'https://[fd00::1]/admin', intent: 'read_public_page', allowedDomains: ['fd00::1'] }).reason).toBe('private_destination')
    expect(decideBrowserCapability({ url: 'https://[fe80::1]/admin', intent: 'read_public_page', allowedDomains: ['fe80::1'] }).reason).toBe('private_destination')
    expect(decideBrowserCapability({ url: 'https://user:secret@example.com', intent: 'read_public_page', allowedDomains: ['example.com'] }).reason).toBe('invalid_url')
    expect(decideBrowserCapability({ url: 'https://example.com.attacker.test', intent: 'read_public_page', allowedDomains: ['example.com'] }).reason).toBe('domain_not_allowlisted')
    expect(decideBrowserCapability({ url: 'https://example.com', intent: 'read_public_page', allowedDomains: ['example.com'], importCookies: true }).reason).toBe('cookie_import_forbidden')
    expect(decideBrowserCapability({ url: 'https://example.com', intent: 'read_public_page', allowedDomains: ['example.com'], externalTelemetry: true }).reason).toBe('external_telemetry_forbidden')
  })

  test('never turns an approval into authority for a browser mutation', () => {
    expect(decideBrowserCapability({ url: 'https://example.com', intent: 'payment', allowedDomains: ['example.com'] }).reason).toBe('human_approval_required')
    expect(decideBrowserCapability({ url: 'https://example.com', intent: 'publish', allowedDomains: ['example.com'], approvedByHuman: true }).reason).toBe('mutation_forbidden')
  })

  test('builds telemetry-off loopback environment and rejects weak keys', () => {
    expect(safeCamofoxEnvironment('0123456789abcdef0123456789abcdef')).toEqual({
      CAMOFOX_BIND_HOST: '127.0.0.1',
      CAMOFOX_ACCESS_KEY: '0123456789abcdef0123456789abcdef',
      CAMOFOX_CRASH_REPORT_ENABLED: 'false',
    })
    expect(() => safeCamofoxEnvironment('short')).toThrow()
  })
})
