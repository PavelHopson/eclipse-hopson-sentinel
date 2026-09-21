import type { RecoverySignal, SupervisedRecoverySnapshot } from './supervisedRecoverySession.ts'
import { SupervisedRecoverySession } from './supervisedRecoverySession.ts'

type ToolResultLike = {
  type?: unknown
  is_error?: unknown
}

type ToolResultMessageLike = {
  type?: unknown
  message?: {
    content?: unknown
  }
}

export function classifyToolBatchRecoverySignal(
  messages: readonly ToolResultMessageLike[],
): RecoverySignal | null {
  const blocks: ToolResultLike[] = []

  for (const message of messages) {
    if (message.type !== 'user') continue

    const content = message.message?.content
    if (!Array.isArray(content)) continue

    for (const block of content) {
      if (
        typeof block === 'object' &&
        block !== null &&
        'type' in block &&
        (block as { type?: unknown }).type === 'tool_result'
      ) {
        blocks.push(block as ToolResultLike)
      }
    }
  }

  if (blocks.length === 0) {
    return null
  }

  return blocks.some(block => block.is_error === true)
    ? { type: 'failure' }
    : { type: 'progress' }
}

export class RecoveryToolBatchObserver {
  constructor(
    private readonly session: SupervisedRecoverySession,
  ) {}

  observe(
    messages: readonly ToolResultMessageLike[],
  ): SupervisedRecoverySnapshot | null {
    const signal = classifyToolBatchRecoverySignal(messages)
    if (!signal) {
      return null
    }

    return this.session.record(signal)
  }
}
