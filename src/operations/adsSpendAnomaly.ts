export interface SpendObservation {
  campaignId: string
  currentSpend: number
  baselineSpend: number
  hardLimit: number
}

export interface SpendAnomaly {
  campaignId: string
  severity: 'warning' | 'critical'
  reason: 'baseline_spike' | 'hard_limit_exceeded'
  evidence: { currentSpend: number; baselineSpend: number; hardLimit: number; ratio: number | null }
  action: 'notify_only'
}

export function detectSpendAnomalies(observations: SpendObservation[], spikeRatio = 1.5): SpendAnomaly[] {
  if (!Number.isFinite(spikeRatio) || spikeRatio <= 1) throw new Error('spikeRatio must be greater than 1')
  if (observations.length > 10_000) throw new Error('too many spend observations')

  return observations.flatMap<SpendAnomaly>(observation => {
    if (typeof observation.campaignId !== 'string'
      || observation.campaignId.trim().length === 0
      || observation.campaignId.length > 160
      || /[\u0000-\u001f\u007f]/.test(observation.campaignId)) {
      throw new Error('campaignId must be a non-empty bounded printable string')
    }
    const values = [observation.currentSpend, observation.baselineSpend, observation.hardLimit]
    if (values.some(value => !Number.isFinite(value) || value < 0)) throw new Error('spend values must be finite and non-negative')
    const ratio = observation.baselineSpend > 0 ? observation.currentSpend / observation.baselineSpend : null
    if (observation.currentSpend > observation.hardLimit) {
      return [{
        campaignId: observation.campaignId,
        severity: 'critical' as const,
        reason: 'hard_limit_exceeded' as const,
        evidence: { ...observation, ratio },
        action: 'notify_only' as const,
      }]
    }
    if (ratio !== null && ratio >= spikeRatio) {
      return [{
        campaignId: observation.campaignId,
        severity: 'warning' as const,
        reason: 'baseline_spike' as const,
        evidence: { ...observation, ratio },
        action: 'notify_only' as const,
      }]
    }
    return []
  })
}
