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
  { id: 'qwen3:8b', name: 'Qwen 3 8B', desc: 'Быстрая · основной локальный профиль', endpoint: 'primary', risk: 'standard' },
  { id: 'qwen3:32b', name: 'Qwen 3 32B', desc: 'Мощная · основной локальный профиль', endpoint: 'primary', risk: 'standard' },
  { id: 'llama3:8b', name: 'Llama 3 8B', desc: 'Meta · основной локальный профиль', endpoint: 'primary', risk: 'standard' },
  { id: 'deepseek-coder-v2:16b', name: 'DeepSeek Coder', desc: 'Специализация на коде', endpoint: 'primary', risk: 'standard' },
  {
    id: 'huihui_ai/qwen3.8-abliterated:27b',
    name: 'HuiHui Qwen3.8 27B · Lab',
    desc: 'Экспериментальная · только изолированный чат',
    endpoint: 'lab',
    risk: 'experimental',
  },
  {
    id: 'hf.co/chimingw/Qwen3.8-27B-Uncensored-OrcaRouter-GGUF:Q4_K_M',
    name: 'OrcaRouter Qwen3.8 27B Q4 · Lab',
    desc: 'Research-кандидат · медленный на RTX 4060 Ti',
    endpoint: 'lab',
    risk: 'experimental',
  },
  {
    id: 'qwen3.8-cyber-iq4xs:27b',
    name: 'Qwen3.8 Cyber IQ4_XS · Lab',
    desc: 'Agentic coding GGUF · текстовый эксперимент',
    endpoint: 'lab',
    risk: 'experimental',
  },
] as const;

export type ModelDefinition = (typeof MODELS)[number];
export const VOICE_MODEL_ID = 'qwen3:8b';
export const LAB_MODELS = MODELS.filter((model) => model.endpoint === 'lab');
export const LAB_DEFAULT_MODEL_ID = 'qwen3.8-cyber-iq4xs:27b';

export function getLabModelId(model?: string): string {
  return LAB_MODELS.find((entry) => entry.id === model)?.id || LAB_DEFAULT_MODEL_ID;
}

const VOICE_WARMUP_TIMEOUT_MS = 120_000;
let voiceWarmupInFlight: Promise<void> | null = null;

const OLLAMA_ENDPOINTS = {
  primary: 'http://127.0.0.1:11434',
  lab: 'http://127.0.0.1:11435',
} as const;

export function warmVoiceModel(): Promise<void> {
  if (voiceWarmupInFlight) return voiceWarmupInFlight;

  voiceWarmupInFlight = (async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), VOICE_WARMUP_TIMEOUT_MS);
    try {
      const response = await fetch(`${OLLAMA_ENDPOINTS.primary}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: VOICE_MODEL_ID,
          prompt: '',
          stream: false,
          keep_alive: '2h',
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        return;
      }
      await response.arrayBuffer();
    } catch {
      // The actual chat request provides the user-facing error if Ollama is unavailable.
    } finally {
      window.clearTimeout(timeoutId);
    }
  })().finally(() => {
    voiceWarmupInFlight = null;
  });

  return voiceWarmupInFlight;
}

export function getModelDefinition(model?: string): ModelDefinition {
  const requested = model || getSelectedModel();
  return MODELS.find((entry) => entry.id === requested) || MODELS[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function streamContent(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return null;
  const first = payload.choices[0];
  if (!isRecord(first) || !isRecord(first.delta)) return null;
  return typeof first.delta.content === 'string' ? first.delta.content : null;
}

function providerModelNames(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.models)) return [];
  return payload.models.flatMap((entry) => (
    isRecord(entry) && typeof entry.name === 'string' ? [entry.name] : []
  ));
}

export function getSelectedModel(): string {
  const saved = localStorage.getItem('sentinel-model');
  if (saved && MODELS.some(m => m.id === saved)) return saved;
  return MODELS[0].id;
}

export function setSelectedModel(id: string) {
  if (!MODELS.some((model) => model.id === id)) return;
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
  systemPrompt?: string,
  options?: { maxTokens?: number; reasoningEffort?: 'none' | 'low' | 'medium' | 'high' },
): Promise<void> {
  const selected = getModelDefinition(model);
  const providerUrl = OLLAMA_ENDPOINTS[selected.endpoint];
  const defaultSystemPrompt = selected.risk === 'experimental'
    ? 'Ты — Eclipse Ultron Lab, изолированный локальный исследовательский чат. У тебя нет инструментов, shell, доступа к файлам, сети, секретам, установке или deployment. Не заявляй о выполненных действиях. Отделяй факты от предположений и предупреждай о непроверяемых или опасных утверждениях. Поддерживаешь русский и английский.'
    : 'Ты — Eclipse Ultron, локальный AI-оператор Eclipse Forge для разработки, автоматизации и кодинга. Отвечай чётко, по делу, отделяй факты от предположений и не заявляй о действиях без receipt. Поддерживаешь русский и английский. Используй markdown для форматирования кода.';

  const resp = await fetch(`${providerUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ollama',
    },
    body: JSON.stringify({
      model: selected.id,
      messages: [
        { role: 'system', content: systemPrompt || defaultSystemPrompt },
        ...messages,
      ],
      stream: true,
      max_tokens: options?.maxTokens ?? 4096,
      reasoning_effort: options?.reasoningEffort,
    }),
    signal,
  });

  if (!resp.ok) {
    void resp.body?.cancel();
    throw new Error(`Ollama request failed (${resp.status})`);
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
        const json: unknown = JSON.parse(data);
        const delta = streamContent(json);
        if (delta) onChunk(delta);
      } catch {
        continue;
      }
    }
  }
}

export async function checkProviderStatus(model?: string): Promise<{
  provider: string; model: string; healthy: boolean; latency: number;
}> {
  const m = model || getSelectedModel();
  const selected = getModelDefinition(m);
  const providerUrl = OLLAMA_ENDPOINTS[selected.endpoint];
  const start = performance.now();
  try {
    const resp = await fetch(`${providerUrl}/api/tags`);
    if (!resp.ok) {
      return { provider: selected.endpoint === 'lab' ? 'Ollama Lab (локально)' : 'Ollama (локально)', model: m, healthy: false, latency: Math.round(performance.now() - start) };
    }
    const data: unknown = await resp.json();
    const models = providerModelNames(data);
    const hasModel = models.some((n: string) => n === m);
    return {
      provider: selected.endpoint === 'lab' ? 'Ollama Lab (локально)' : 'Ollama (локально)',
      model: m,
      healthy: resp.ok && hasModel,
      latency: Math.round(performance.now() - start),
    };
  } catch {
    return { provider: selected.endpoint === 'lab' ? 'Ollama Lab (локально)' : 'Ollama (локально)', model: m, healthy: false, latency: -1 };
  }
}
