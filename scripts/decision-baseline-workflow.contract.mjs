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

test('decision baseline workflow keeps least-privilege model permissions', async () => {
  const text = await workflowText()

  assert.match(text, /permissions:\s*\n\s+contents: read\s*\n\s+models: read/)
  assert.doesNotMatch(text, /contents:\s*write/)
  assert.doesNotMatch(text, /actions:\s*write/)
  assert.doesNotMatch(text, /pull-requests:\s*write/)
  assert.doesNotMatch(text, /issues:\s*write/)
  assert.doesNotMatch(text, /id-token:\s*write/)
})

test('decision baseline workflow uses built-in token and pinned actions only', async () => {
  const text = await workflowText()

  assert.match(text, /GITHUB_TOKEN:\s*\$\{\{ github\.token \}\}/)
  assert.doesNotMatch(text, /secrets\.[A-Za-z0-9_]+/)
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
  assert.match(text, /if-no-files-found: error/)
  assert.match(text, /retention-days: 30/)
})
