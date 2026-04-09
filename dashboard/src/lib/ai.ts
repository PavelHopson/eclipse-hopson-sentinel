export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  createdAt: number;
}

export const MODELS = [
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 120B', desc: 'Мощная, бесплатная' },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', name: 'Nemotron 30B', desc: 'Быстрая, бесплатная' },
  { id: 'google/gemma-4-26b-a4b-it:free', name: 'Gemma 4 26B', desc: 'Google, бесплатная' },
  { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B', desc: 'Google, бесплатная' },
  { id: 'minimax/minimax-m2.5:free', name: 'MiniMax M2.5', desc: 'Быстрая, бесплатная' },
  { id: 'arcee-ai/trinity-large-preview:free', name: 'Trinity Large', desc: 'Arcee AI, бесплатная' },
] as const;

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const FALLBACK_KEY = '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';

export function getApiKey(): string {
  return localStorage.getItem('sentinel-api-key') || import.meta.env.VITE_OPENROUTER_KEY || FALLBACK_KEY;
}

export function setApiKey(key: string) {
  localStorage.setItem('sentinel-api-key', key);
}

export function getSelectedModel(): string {
  return localStorage.getItem('sentinel-model') || MODELS[0].id;
}

export function setSelectedModel(id: string) {
  localStorage.setItem('sentinel-model', id);
}

// Chat history
export function loadSessions(): ChatSession[] {
  try {
    return JSON.parse(localStorage.getItem('sentinel-sessions') || '[]');
  } catch { return []; }
}

export function saveSessions(sessions: ChatSession[]) {
  localStorage.setItem('sentinel-sessions', JSON.stringify(sessions));
}

export function createSession(model: string): ChatSession {
  return {
    id: Date.now().toString(36),
    title: 'Новый чат',
    messages: [],
    model,
    createdAt: Date.now(),
  };
}

export async function sendMessage(
  messages: Message[],
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  model?: string,
): Promise<void> {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
      'HTTP-Referer': 'https://eclipse-forge.dev',
      'X-Title': 'Eclipse Sentinel',
    },
    body: JSON.stringify({
      model: model || getSelectedModel(),
      messages: [
        { role: 'system', content: 'Ты — Eclipse Sentinel, AI-оператор для разработки, автоматизации и кодинга. Отвечай чётко, по делу. Поддерживаешь русский и английский. Используй markdown для форматирования кода.' },
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

export async function checkProviderStatus(model?: string): Promise<{
  provider: string; model: string; healthy: boolean; latency: number;
}> {
  const m = model || getSelectedModel();
  const start = performance.now();
  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getApiKey()}`,
      },
      body: JSON.stringify({ model: m, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
    });
    return { provider: 'OpenRouter', model: m, healthy: resp.ok, latency: Math.round(performance.now() - start) };
  } catch {
    return { provider: 'OpenRouter', model: m, healthy: false, latency: -1 };
  }
}
