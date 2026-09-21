import assert from 'node:assert/strict'
import test from 'node:test'

import { sentinelIncidentSeedCorpus } from './sentinelIncidentSeedCorpus.ts'

test('seed corpus is bounded, unique, and covers every decision route', () => {
  assert.equal(sentinelIncidentSeedCorpus.length, 18)

  const ids = new Set(sentinelIncidentSeedCorpus.map(item => item.id))
  assert.equal(ids.size, sentinelIncidentSeedCorpus.length)

  const decisions = new Set(
    sentinelIncidentSeedCorpus.map(item => item.expected),
  )
  assert.deepEqual([...decisions].sort(), ['escalate', 'ignore', 'review'])

  for (const item of sentinelIncidentSeedCorpus) {
    assert.ok(item.allowedDecisions.includes(item.expected))
    assert.ok(Object.keys(item.context).length > 0)
  }
})
