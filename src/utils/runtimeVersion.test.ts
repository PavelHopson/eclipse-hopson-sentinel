import assert from 'node:assert/strict'
import test from 'node:test'

import { getRuntimeVersion } from './runtimeVersion.ts'

test('runtime version helper is safe in raw script mode', () => {
  const version = getRuntimeVersion()
  assert.equal(typeof version, 'string')
  assert.ok(version.length > 0)
})
