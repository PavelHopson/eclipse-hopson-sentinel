// Opt-in real smoke for the fast voice model. Fixed loopback only, no microphone,
// no personal files and no external network. The model is unloaded in finally.
import assert from 'node:assert/strict';

const endpoint = 'http://127.0.0.1:11434';
const model = 'qwen3:8b';
const startedAt = Date.now();

async function boundedJson(response, limit = 1024 * 1024) {
  assert.equal(response.ok, true, `Ollama returned HTTP ${response.status}`);
  const reader = response.body?.getReader();
  assert.ok(reader, 'Ollama response body is missing');
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      assert.ok(bytes <= limit, 'Ollama response exceeded the smoke-test limit');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8'));
}

try {
  const response = await fetch(`${endpoint}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(5 * 60_000),
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Ответь по-русски одним коротким предложением без Markdown.' },
        { role: 'user', content: 'Подтверди, что локальный голосовой контур готов.' },
      ],
      stream: false,
      think: false,
      keep_alive: 0,
      options: { num_ctx: 2048, num_predict: 48 },
    }),
  });
  const payload = await boundedJson(response);
  const answer = typeof payload?.message?.content === 'string' ? payload.message.content.trim() : '';
  assert.ok(answer.length > 0 && answer.length <= 400, 'Voice model returned an invalid answer');
  console.log(JSON.stringify({
    ok: true,
    model,
    durationMs: Date.now() - startedAt,
    answer,
    promptTokens: Number(payload.prompt_eval_count || 0),
    responseTokens: Number(payload.eval_count || 0),
  }, null, 2));
} finally {
  await fetch(`${endpoint}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: 0 }),
  }).then((response) => response.body?.cancel()).catch(() => {});
}
