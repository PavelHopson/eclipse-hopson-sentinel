export type EclipseRgb = readonly [number, number, number]

/** Local, dependency-free snapshot of eclipse-forge.visual-system.v1. */
export const ECLIPSE_FORGE_VISUAL = Object.freeze({
  schema: 'eclipse-forge.visual-system.v1',
  profile: 'operational',
  colors: Object.freeze({
    signal: [107, 163, 255] as EclipseRgb,
    gold: [212, 175, 55] as EclipseRgb,
    text: [242, 245, 249] as EclipseRgb,
    secondary: [196, 206, 216] as EclipseRgb,
    muted: [148, 163, 184] as EclipseRgb,
    line: [28, 37, 54] as EclipseRgb,
    success: [74, 230, 160] as EclipseRgb,
    danger: [248, 113, 113] as EclipseRgb,
  }),
})