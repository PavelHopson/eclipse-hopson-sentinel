import type { Message } from './ai';

// A failed/new question must never inherit the answer to an older question.
export function latestVoiceExchange(messages: readonly Message[]) {
  let questionIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') { questionIndex = index; break; }
  }
  if (questionIndex < 0) return { question: '', answer: '' };
  const answer = messages.slice(questionIndex + 1).findLast((message) => message.role === 'assistant');
  return { question: messages[questionIndex].content, answer: answer?.content || '' };
}
