import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const policy = require('../dashboard/electron/developer-mode-policy.cjs');
const { createDeveloperModeRuntime, selectDeveloperModel } = require('../dashboard/electron/developer-mode-runtime.cjs');

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'ultron-developer-'));
  await mkdir(path.join(root, '.git'));
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'README.md'), '# Safe fixture\n');
  await writeFile(path.join(root, 'src', 'app.js'), 'export const answer = 41;\n');
  await writeFile(path.join(root, 'src', 'secret.js'), "export const apiKey = 'sk_secretvalue123456789';\n");
  return root;
}

test('path allowlist rejects traversal, secrets, dependencies and binary surfaces', () => {
  assert.equal(policy.normalizeRelativePath('../outside.ts'), null);
  assert.equal(policy.normalizeRelativePath('node_modules/pkg/index.js'), null);
  assert.equal(policy.normalizeRelativePath('.env'), null);
  assert.equal(policy.normalizeRelativePath('assets/photo.png'), null);
  assert.equal(policy.normalizeRelativePath('src/app.ts'), 'src/app.ts');
  assert.equal(policy.redactSecrets('password=supersecretvalue'), 'password=<redacted>');
});

test('read-only context, exact approval, atomic apply, receipt and conflict-safe rollback', async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = await policy.openDeveloperWorkspace(root, { idFactory: () => 'workspace-1', now: 1 });
  const context = await policy.prepareDeveloperContext(workspace, 'Измени src/app.js и увеличь answer');
  assert.ok(context.files.some((file) => file.path === 'src/app.js'));
  assert.ok(!context.files.some((file) => file.path === 'src/secret.js'));

  const raw = JSON.stringify({
    schemaVersion: 'eclipse.ultron.developer-proposal.v1', summary: 'Увеличивает тестовое значение.', assumptions: [], risks: [],
    changes: [{ path: 'src/app.js', content: 'export const answer = 42;\n' }],
  });
  const proposal = policy.createDeveloperProposal(workspace, context, raw, { idFactory: () => 'proposal-1', now: 2 });
  const publicView = policy.publicProposal(proposal);
  assert.equal('before' in publicView.changes[0], false);
  assert.equal('after' in publicView.changes[0], false);
  assert.equal(policy.approveDeveloperProposal(proposal, { schemaVersion: 'wrong', requestId: 'proposal-1', workspaceId: 'workspace-1', confirmed: true }, 3), false);
  assert.equal(policy.approveDeveloperProposal(proposal, { schemaVersion: 'eclipse.ultron.developer-approval.v1', requestId: 'proposal-1', workspaceId: 'workspace-1', confirmed: true }, 3), true);

  const applied = await policy.applyDeveloperProposal(workspace, proposal, { idFactory: () => 'receipt-1', now: 4 });
  assert.equal(await readFile(path.join(root, 'src', 'app.js'), 'utf8'), 'export const answer = 42;\n');
  assert.equal(applied.receipt.status, 'applied');
  const preview = policy.createRollbackPreview(applied.rollback, { idFactory: () => 'rollback-1', now: 5 });
  const rolledBack = await policy.executeRollback(workspace, applied.rollback, preview,
    { schemaVersion: 'eclipse.ultron.developer-approval.v1', requestId: 'rollback-1', workspaceId: 'workspace-1', confirmed: true }, 6);
  assert.equal(rolledBack.status, 'rolled-back');
  assert.equal(await readFile(path.join(root, 'src', 'app.js'), 'utf8'), 'export const answer = 41;\n');
});

test('proposal cannot add paths, overwrite a changed file or introduce a secret', async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = await policy.openDeveloperWorkspace(root);
  const context = await policy.prepareDeveloperContext(workspace, 'Измени src/app.js');
  assert.throws(() => policy.createDeveloperProposal(workspace, context, JSON.stringify({
    schemaVersion: 'eclipse.ultron.developer-proposal.v1', summary: 'bad', assumptions: [], risks: [],
    changes: [{ path: 'src/new.js', content: 'export default true;\n' }],
  })), { code: 'DEVELOPER_CONTEXT_VIOLATION' });
  assert.throws(() => policy.createDeveloperProposal(workspace, context, JSON.stringify({
    schemaVersion: 'eclipse.ultron.developer-proposal.v1', summary: 'bad', assumptions: [], risks: [],
    changes: [{ path: 'src/app.js', content: "export const token = 'ghp_secretvalue123456789';\n" }],
  })), { code: 'DEVELOPER_SECRET_REJECTED' });
});

test('model selection prefers an installed 27B Qwen3.8 candidate and rejects unrelated tags', () => {
  assert.equal(selectDeveloperModel([{ name: 'qwen3:8b' }, { name: 'hf.co/chimingw/Qwen3.8-27B-Uncensored-OrcaRouter-GGUF:Q4_K_M' }]),
    'hf.co/chimingw/Qwen3.8-27B-Uncensored-OrcaRouter-GGUF:Q4_K_M');
  assert.throws(() => selectDeveloperModel([{ name: 'qwen3:8b' }]), { code: 'DEVELOPER_MODEL_MISSING' });
});

test('model admission uses exact approved tags; marketing substrings cannot select weights', () => {
  const huihui = 'huihui_ai/qwen3.8-abliterated:27b';
  const authorHuihui = 'hf.co/huihui-ai/Huihui-Qwen3.8-27B-abliterated-GGUF:UD-DW-Q4_K_M';
  const orca = 'hf.co/chimingw/Qwen3.8-27B-Uncensored-OrcaRouter-GGUF:Q4_K_M';
  assert.equal(selectDeveloperModel([{ name: orca }, { name: huihui }]), huihui);
  assert.equal(selectDeveloperModel([{ name: orca }, { name: huihui }, { name: authorHuihui }]), authorHuihui);
  assert.equal(selectDeveloperModel([{ name: 'evil/qwen3.8-27b-huihui-aeon-uncensored:q4_k_m' }, { name: orca }]), orca);
  for (const name of ['huihui_ai/qwen3.8-abliterated:latest', 'huihui_ai/qwen3.8-abliterated:27b-fp16',
    'evil/qwen3.8-27b-huihui-aeon-uncensored:q4_k_m',
    'hf.co/huihui-ai/Huihui-Qwen3.8-27B-abliterated-GGUF:UD-Q4_K_XL']) {
    assert.throws(() => selectDeveloperModel([{ name }]), { code: 'DEVELOPER_MODEL_MISSING' });
  }
});

test('runtime is loopback-only, CPU-only, schema-bound and unloads the model after proposal', async () => {
  const calls = [];
  const model = 'hf.co/chimingw/Qwen3.8-27B-Uncensored-OrcaRouter-GGUF:Q4_K_M';
  const content = JSON.stringify({ schemaVersion: 'eclipse.ultron.developer-proposal.v1', summary: 'ok', assumptions: [], risks: [], changes: [{ path: 'src/app.js', content: 'ok' }] });
  const runtime = createDeveloperModeRuntime({ fetchImpl: async (url, options = {}) => {
    calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith('/api/tags')) return new Response(JSON.stringify({ models: [{ name: model }] }));
    if (url.endsWith('/api/chat')) return new Response(JSON.stringify({ message: { content } }));
    return new Response('{}');
  } });
  const result = await runtime.propose({ task: 'safe task', files: [{ path: 'src/app.js', sha256: 'abc', modelContent: 'untrusted data' }] });
  assert.equal(result.model, model);
  assert.equal(calls.length, 3);
  assert.equal(calls[1].url, 'http://127.0.0.1:11435/api/chat');
  assert.equal(calls[1].body.options.num_gpu, 0);
  assert.equal(calls[1].body.think, false);
  assert.equal(calls[1].body.options.num_ctx, 8192);
  assert.equal(calls[1].body.keep_alive, 0);
  assert.equal(calls[1].body.format.additionalProperties, false);
  assert.match(calls[1].body.messages[0].content, /недоверенные данные/);
  assert.equal(calls[2].body.keep_alive, 0);
});

test('operator cancellation aborts only the active proposal and still runs unload', async () => {
  const model = 'hf.co/chimingw/Qwen3.8-27B-Uncensored-OrcaRouter-GGUF:Q4_K_M';
  let chatStarted = false;
  let unloads = 0;
  const runtime = createDeveloperModeRuntime({ fetchImpl: async (url, options = {}) => {
    if (url.endsWith('/api/tags')) return new Response(JSON.stringify({ models: [{ name: model }] }));
    if (url.endsWith('/api/generate')) { unloads += 1; return new Response('{}'); }
    chatStarted = true;
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    });
  } });
  const pending = runtime.propose({ task: 'safe task', files: [{ path: 'src/app.js', sha256: 'abc', modelContent: 'safe' }] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(chatStarted, true);
  assert.equal(runtime.cancel(), true);
  await assert.rejects(pending, { code: 'DEVELOPER_CANCELLED' });
  assert.equal(unloads, 1);
  assert.equal(runtime.cancel(), false);
});

test('native transport rejects every non-fixed loopback origin before a request', async () => {
  const runtime = createDeveloperModeRuntime({ baseUrl: 'http://localhost:11435' });
  await assert.rejects(runtime.propose({ task: 'safe', files: [{ path: 'a.js', sha256: 'a', modelContent: 'safe' }] }),
    { code: 'DEVELOPER_TRANSPORT_REJECTED' });
});

test('renderer cannot supply a rollback preview or bypass the stored approval boundary', async () => {
  const [main, preload] = await Promise.all([
    readFile(new URL('../dashboard/electron/main.cjs', import.meta.url), 'utf8'),
    readFile(new URL('../dashboard/electron/preload.cjs', import.meta.url), 'utf8'),
  ]);
  assert.match(main, /developerRollbackPreview = createRollbackPreview/);
  assert.match(main, /args\.length !== 1 \|\| !developerApplied \|\| !developerRollbackPreview/);
  assert.match(preload, /rollback\(approval\) \{\s*return ipcRenderer\.invoke\(DEVELOPER_ROLLBACK_CHANNEL, approval\)/);
  assert.match(preload, /cancel\(\) \{\s*return ipcRenderer\.invoke\(DEVELOPER_CANCEL_CHANNEL\)/);
  assert.doesNotMatch(preload, /DEVELOPER_ROLLBACK_CHANNEL, preview/);
});
