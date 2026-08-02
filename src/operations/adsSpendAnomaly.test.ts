import { describe, expect, test } from 'bun:test'
import { detectSpendAnomalies } from './adsSpendAnomaly'

describe('ads spend anomaly detector', () => {
  test('emits evidence-only notifications and never a budget mutation', () => {
    const anomalies = detectSpendAnomalies([
      { campaignId: 'campaign-a', currentSpend: 180, baselineSpend: 100, hardLimit: 250 },
      { campaignId: 'campaign-b', currentSpend: 320, baselineSpend: 200, hardLimit: 300 },
    ])
    expect(anomalies).toHaveLength(2)
    expect(anomalies[0].action).toBe('notify_only')
    expect(anomalies[1].severity).toBe('critical')
    expect(JSON.stringify(anomalies)).not.toContain('apply')
  })

  test('rejects unsafe campaign identifiers before they reach logs or alerts', () => {
    expect(() => detectSpendAnomalies([
      { campaignId: 'campaign-a\nforged-log', currentSpend: 1, baselineSpend: 1, hardLimit: 2 },
    ])).toThrow('campaignId')
  })
})
