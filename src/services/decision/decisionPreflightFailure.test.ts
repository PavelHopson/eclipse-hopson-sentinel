import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyDecisionPreflightFailure } from './decisionPreflightFailure.ts'

test('classifies runtime and HTTP failures without exposing raw messages', () => {
  assert.equal(
    classifyDecisionPreflightFailure(new ReferenceError('secret value')),
    'reference-error',
  )
  assert.equal(
    classifyDecisionPreflightFailure(new TypeError('sensitive body')),
    'type-error',
  )
  assert.equal(classifyDecisionPreflightFailure({ status: 401 }), 'http-401')
  assert.equal(classifyDecisionPreflightFailure({ statusCode: 403 }), 'http-403')
  assert.equal(classifyDecisionPreflightFailure({ status: 404 }), 'http-404')
  assert.equal(classifyDecisionPreflightFailure({ status: 429 }), 'http-429')
  assert.equal(classifyDecisionPreflightFailure({ status: 503 }), 'http-5xx')
  assert.equal(classifyDecisionPreflightFailure({ status: 422 }), 'http-error')
  assert.equal(
    classifyDecisionPreflightFailure({ response: { status: 403 } }),
    'http-403',
  )
  assert.equal(
    classifyDecisionPreflightFailure({ cause: { statusCode: 429 } }),
    'http-429',
  )
  assert.equal(
    classifyDecisionPreflightFailure({ name: 'AuthenticationError' }),
    'http-401',
  )
  assert.equal(
    classifyDecisionPreflightFailure({ name: 'PermissionDeniedError' }),
    'http-403',
  )
  assert.equal(
    classifyDecisionPreflightFailure({ name: 'APIConnectionError' }),
    'network',
  )
  assert.equal(
    classifyDecisionPreflightFailure({ code: 'ECONNRESET' }),
    'network',
  )
})

test('recognizes bounded tool-response failure only by exact internal message', () => {
  assert.equal(
    classifyDecisionPreflightFailure(
      new Error('structured decision tool was not returned'),
    ),
    'tool-response-missing',
  )
  assert.equal(
    classifyDecisionPreflightFailure(new Error('token=do-not-print')),
    'unknown',
  )
})
