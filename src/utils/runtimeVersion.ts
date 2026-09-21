declare const MACRO:
  | Readonly<{
      VERSION: string
    }>
  | undefined

export function getRuntimeVersion(): string {
  return typeof MACRO !== 'undefined' &&
    typeof MACRO.VERSION === 'string' &&
    MACRO.VERSION.trim()
    ? MACRO.VERSION
    : 'unknown'
}
