import type { Message } from './ai';

// Voice has a fixed local model, no tools, bounded context and no thinking trace.
// Keep this separate from the developer/chat model settings.
export async function sendVoiceMessage(messages: Message[], systemPrompt: string,
  onChunk: (text: string) => void, signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw new DOMException('Отменено', 'AbortError');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const expire = () => { timedOut = true; controller.abort(); };
  let progressTimer = setTimeout(expire, 30_000);
  const deadline = setTimeout(expire, 60_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'qwen3:8b',
        messages: [{ role: 'system', content: systemPrompt.slice(0, 2000) },
          ...messages.filter(m => m.role === 'user' || m.role === 'assistant').slice(-8)
            .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))],
        stream: true, think: false, keep_alive: '5m',
        options: { num_ctx: 2048, num_predict: 120, temperature: 0.6 },
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Ollama request failed (${response.status})`);
    }
    reader = response.body?.getReader();
    if (!reader) throw new Error('Локальная модель не вернула поток ответа.');
    const decoder = new TextDecoder();
    let buffer = '', bytes = 0, received = false, complete = false;
    const consume = (line: string) => {
      if (!line.trim()) return;
      const item = JSON.parse(line);
      if (!item || typeof item !== 'object' || item.error) throw new Error('Локальная модель прервала ответ.');
      const content = item.message?.content;
      if (typeof content === 'string' && content) {
        received = true;
        clearTimeout(progressTimer);
        progressTimer = setTimeout(expire, 8_000);
        if (!controller.signal.aborted) onChunk(content);
      }
      if (item.done === true) complete = true;
    };
    while (!complete) {
      const { done, value } = await reader.read();
      if (done) { buffer += decoder.decode(); if (buffer) consume(buffer); break; }
      bytes += value.byteLength;
      if (bytes > 512 * 1024) throw new Error('Ответ модели превысил безопасный размер.');
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      if (buffer.length > 64 * 1024) throw new Error('Некорректный поток локальной модели.');
      for (const line of lines) { consume(line); if (complete) break; }
    }
    if (controller.signal.aborted) throw new DOMException('Отменено', 'AbortError');
    if (!received || !complete) throw new Error('Модель не завершила ответ. Повторите фразу.');
  } catch (error) {
    if (timedOut && !signal.aborted) throw new Error('Модель отвечает слишком долго. Запрос остановлен; попробуйте ещё раз.');
    throw error;
  } finally {
    clearTimeout(progressTimer);
    clearTimeout(deadline);
    signal.removeEventListener('abort', cancel);
    controller.abort();
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }
}
