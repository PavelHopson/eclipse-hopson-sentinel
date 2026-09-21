import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflowPath = new URL(
  '../.github/workflows/decision-baseline.yml',
  import.meta.url,
)

async function workflowText() {
  return readFile(workflowPath, 'utf8')
}

test('decision baseline workflow remains manual-only', async () => {
  const text = await workflowText()

  assert.match(text, /workflow_dispatch:/)
  assert.doesNotMatch(text, /^\s*push:/m)
  assert.doesNotMatch(text, /^\s*pull_request:/m)
  assert.doesNotMatch(text, /^\s*schedule:/m)
  assert.doesNotMatch(text, /^\s*workflow_run:/m)
})

test('decision baseline workflow keeps least-privilege repository permissions', async () => {
  const text = await workflowText()

  assert.match(text, /permissions:\s*\n\s+contents: read/)
  assert.doesNotMatch(text, /models:\s*read/)
  assert.doesNotMatch(text, /contents:\s*write/)
  assert.doesNotMatch(text, /actions:\s*write/)
  assert.doesNotMatch(text, /pull-requests:\s*write/)
  assert.doesNotMatch(text, /issues:\s*write/)
  assert.doesNotMatch(text, /id-token:\s*write/)
})

test('decision baseline workflow uses only OPENAI_API_KEY for inference auth', async () => {
  const text = await workflowText()
  const secrets = [...text.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map(
    match => match[1],
  )

  assert.deepEqual([...new Set(secrets)], ['OPENAI_API_KEY'])
  assert.match(
    text,
    /OPENAI_API_KEY:\s*\$\{\{ secrets\.OPENAI_API_KEY \}\}/,
  )
  assert.match(text, /CLAUDE_CODE_USE_OPENAI:\s*'1'/)
  assert.doesNotMatch(text, /CLAUDE_CODE_USE_GITHUB/)
  assert.doesNotMatch(text, /models\.github\.ai/)
})

test('decision baseline workflow fails before inference when the OpenAI secret is missing', async () => {
  const text = await workflowText()
  const credentialIndex = text.indexOf('Verify OpenAI API credential')
  const preflightIndex = text.indexOf('Preflight live decision engine')

  assert.ok(credentialIndex >= 0)
  assert.ok(preflightIndex > credentialIndex)
  assert.match(
    text,
    /OPENAI_API_KEY repository secret is required for Decision Baseline Evidence/,
  )
})

test('decision baseline workflow pins third-party actions', async () => {
  const text = await workflowText()

  assert.match(
    text,
    /actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803/,
  )
  assert.match(
    text,
    /oven-sh\/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6/,
  )
  assert.match(
    text,
    /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/,
  )
})

test('decision baseline workflow validates evidence before artifact upload', async () => {
  const text = await workflowText()
  const validateIndex = text.indexOf('decision:shadow:validate')
  const uploadIndex = text.indexOf('Upload baseline evidence')

  assert.ok(validateIndex >= 0)
  assert.ok(uploadIndex > validateIndex)
  assert.match(
    text,
    /decision:shadow:validate -- --report "\$report" --require-live-engine/,
  )
  assert.match(text, /if-no-files-found: error/)
  assert.match(text, /retention-days: 30/)
})

test('decision baseline workflow rejects stale revisions and stamps artifact provenance', async () => {
  const text = await workflowText()

  assert.match(text, /git fetch --no-tags --depth=1 origin main/)
  assert.match(text, /checked_out="\$\(git rev-parse HEAD\)"/)
  assert.match(text, /current_main="\$\(git rev-parse origin\/main\)"/)
  assert.match(text, /if \[ "\$checked_out" != "\$current_main" \]/)
  assert.match(text, /SHORT_SHA=\$short_sha/)
  assert.match(
    text,
    /name: decision-baseline-\$\{\{ github\.run_id \}\}-\$\{\{ env\.SHORT_SHA \}\}/,
  )
  assert.match(text, /do not use Re-run jobs on an older run/)
})

test('decision baseline workflow preflights one live decision before the full corpus', async () => {
  const text = await workflowText()
  const preflightIndex = text.indexOf('decision:shadow:preflight')
  const baselineIndex = text.indexOf('decision:shadow:baseline')

  assert.ok(preflightIndex >= 0)
  assert.ok(baselineIndex > preflightIndex)
  assert.match(
    text,
    /bun run decision:shadow:preflight -- --model "\$OPENAI_MODEL"/,
  )
})

test('decision baseline defaults to the low-cost GPT-5.6 Luna model', async () => {
  const text = await workflowText()

  assert.match(text, /default: gpt-5\.6-luna/)
  assert.match(text, /OPENAI_MODEL:\s*\$\{\{ inputs\.model \}\}/)
})
