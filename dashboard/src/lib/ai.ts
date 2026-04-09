export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const API_KEY = import.meta.env.VITE_OPENROUTER_KEY || '';
const MODEL = 'qwen/qwen3.6-plus-preview:free';

export async function sendMessage(
  messages: Message[],
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'HTTP-Referer': 'https://eclipse-forge.dev',
      'X-Title': 'Eclipse Sentinel Dashboard',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: 'Ты — Eclipse Sentinel, AI-оператор для разработки, автоматизации и кодинга. Отвечай чётко, по делу. Поддерживаешь русский и английский.' },
        ...messages,
      ],
      stream: true,
      max_tokens: 4096,
    }),
    signal,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`API error ${resp.status}: ${err}`);
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;

      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      } catch {}
    }
  }
}

export async function checkProviderStatus(): Promise<{
  provider: string;
  model: string;
  healthy: boolean;
  latency: number;
}> {
  const start = performance.now();
  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
    });
    const latency = Math.round(performance.now() - start);
    return { provider: 'OpenRouter', model: MODEL, healthy: resp.ok, latency };
  } catch {
    return { provider: 'OpenRouter', model: MODEL, healthy: false, latency: -1 };
  }
}
