import { describe, expect, test } from 'bun:test'
import { ECLIPSE_FORGE_VISUAL } from './eclipseForgeVisual.js'

describe('Eclipse Forge visual contract', () => {
  test('stays versioned and operational', () => {
    expect(ECLIPSE_FORGE_VISUAL.schema).toBe('eclipse-forge.visual-system.v1')
    expect(ECLIPSE_FORGE_VISUAL.profile).toBe('operational')
    expect(ECLIPSE_FORGE_VISUAL.colors.signal).toEqual([107, 163, 255])
    expect(ECLIPSE_FORGE_VISUAL.colors.gold).toEqual([212, 175, 55])
  })
})