import type { BetaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

/**
 * Usage after the API response has been normalized by the runtime.
 * Nullable SDK fields become required so accounting code can add values
 * without repeating fallback branches.
 */
export type NonNullableUsage = {
  [Key in keyof BetaUsage]-?: Exclude<BetaUsage[Key], null | undefined>
}
