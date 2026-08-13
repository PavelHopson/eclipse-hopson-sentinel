import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { getDistImportSpecifier } from './import-specifier.mjs'

test('builds a file URL import specifier for dist/cli.mjs', () => {
  const baseDir = resolve('fixtures', 'bin')
  const specifier = getDistImportSpecifier(baseDir)

  assert.equal(
    fileURLToPath(specifier),
    resolve('fixtures', 'dist', 'cli.mjs'),
  )
})
