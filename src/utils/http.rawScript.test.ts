import assert from 'node:assert/strict'
import test from 'node:test'

import { getMCPUserAgent, getUserAgent } from './http.ts'

test('HTTP user agents are safe when build-time MACRO is absent', () => {
  const userAgent = getUserAgent()
  const mcpUserAgent = getMCPUserAgent()

  assert.match(userAgent, /^claude-cli\/unknown \(/)
  assert.match(mcpUserAgent, /^claude-code\/unknown/)
})

test('HTTP user agents preserve runtime entrypoint metadata in raw scripts', () => {
  const previousEntrypoint = process.env.CLAUDE_CODE_ENTRYPOINT
  const previousSdk = process.env.CLAUDE_AGENT_SDK_VERSION
  const previousClient = process.env.CLAUDE_AGENT_SDK_CLIENT_APP

  process.env.CLAUDE_CODE_ENTRYPOINT = 'decision-baseline'
  process.env.CLAUDE_AGENT_SDK_VERSION = 'test-sdk'
  process.env.CLAUDE_AGENT_SDK_CLIENT_APP = 'sentinel-test'

  try {
    const userAgent = getUserAgent()
    const mcpUserAgent = getMCPUserAgent()

    assert.match(userAgent, /decision-baseline/)
    assert.match(userAgent, /agent-sdk\/test-sdk/)
    assert.match(userAgent, /client-app\/sentinel-test/)
    assert.match(mcpUserAgent, /decision-baseline/)
    assert.match(mcpUserAgent, /agent-sdk\/test-sdk/)
    assert.match(mcpUserAgent, /client-app\/sentinel-test/)
  } finally {
    if (previousEntrypoint === undefined) delete process.env.CLAUDE_CODE_ENTRYPOINT
    else process.env.CLAUDE_CODE_ENTRYPOINT = previousEntrypoint

    if (previousSdk === undefined) delete process.env.CLAUDE_AGENT_SDK_VERSION
    else process.env.CLAUDE_AGENT_SDK_VERSION = previousSdk

    if (previousClient === undefined) delete process.env.CLAUDE_AGENT_SDK_CLIENT_APP
    else process.env.CLAUDE_AGENT_SDK_CLIENT_APP = previousClient
  }
})
