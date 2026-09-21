import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const clientPath = new URL('./client.ts', import.meta.url)

test('OpenAI-compatible providers route before Anthropic auth preflight', async () => {
  const source = await readFile(clientPath, 'utf8')

  const shimIndex = source.indexOf(
    "const { createOpenAIShimClient } = await import('./openaiShim.js')",
  )
  const oauthIndex = source.indexOf(
    "await checkAndRefreshOAuthTokenIfNeeded()",
  )
  const apiKeyHelperIndex = source.indexOf(
    "await configureApiKeyHeaders(defaultHeaders, getIsNonInteractiveSession())",
  )

  assert.ok(shimIndex >= 0)
  assert.ok(oauthIndex > shimIndex)
  assert.ok(apiKeyHelperIndex > shimIndex)
})
