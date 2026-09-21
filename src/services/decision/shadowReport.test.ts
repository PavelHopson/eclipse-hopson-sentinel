import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDecisionShadowReport,
  DECISION_SHADOW_REPORT_VERSION,
  validateDecisionShadowReport,
} from './shadowReport.ts'
import type { ShadowEngineReport } from './shadowEvaluation.ts'

type Route = 'ignore' | 'review' | 'escalate'

function fixtureReport(): ShadowEngineReport<Route> {
  return {
    engineId: 'sidequery:test',
    cases: [
      {
        id: 'case-1',
        expected: 'review',
        actual: 'review',
        confidence: 0.8,
        accepted: true,
        elapsedMs: 10,
        errors: [],
      },
      {
        id: 'case-2',
        expected: 'ignore',
        actual: null,
        confidence: null,
        accepted: false,
        elapsedMs: 20,
        errors: ['decision engine failed'],
      },
    ],
    evaluation: {
      total: 2,
      valid: 1,
      correct: 1,
      accuracy: 0.5,
      meanConfidenceOnCorrect: 0.8,
      meanConfidenceOnIncorrect: null,
    },
    invalidRate: 0.5,
    meanLatencyMs: 15,
    p50LatencyMs: 10,
    p95LatencyMs: 20,
  }
}

test('builds and validates a safe persisted shadow report', () => {
  const report = buildDecisionShadowReport({
    provider: 'openai',
    model: 'fixture-model',
    corpus: 'fixture-corpus',
    engineReport: fixtureReport(),
    generatedAt: '2026-09-21T12:00:00.000Z',
  })

  assert.equal(report.schemaVersion, DECISION_SHADOW_REPORT_VERSION)
  const validation = validateDecisionShadowReport(report)
  assert.deepEqual(validation.errors, [])
  assert.equal(validation.report?.caseCount, 2)
})

test('rejects duplicate case ids and inconsistent case count', () => {
  const report = buildDecisionShadowReport({
    provider: 'openai',
    model: 'fixture-model',
    corpus: 'fixture-corpus',
    engineReport: fixtureReport(),
  })

  const malformed = {
    ...report,
    caseCount: 3,
    cases: [
      report.cases[0],
      { ...report.cases[1], id: report.cases[0]?.id },
    ],
  }

  const validation = validateDecisionShadowReport(malformed)
  assert.equal(validation.report, null)
  assert.ok(validation.errors.includes('cases length must equal caseCount'))
  assert.ok(validation.errors.some(error => error.includes('id must be unique')))
})

test('rejects accepted cases without actual/confidence', () => {
  const report = buildDecisionShadowReport({
    provider: 'openai',
    model: 'fixture-model',
    corpus: 'fixture-corpus',
    engineReport: fixtureReport(),
  })

  const malformed = {
    ...report,
    cases: [
      {
        ...report.cases[0],
        actual: null,
        confidence: null,
        accepted: true,
      },
      report.cases[1],
    ],
  }

  const validation = validateDecisionShadowReport(malformed)
  assert.equal(validation.report, null)
  assert.ok(
    validation.errors.some(error =>
      error.includes('accepted=true requires actual and confidence'),
    ),
  )
})
