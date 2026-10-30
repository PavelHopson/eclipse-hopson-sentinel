const { createHash, randomUUID } = require('node:crypto');
const { lstat, mkdir, readFile, readdir, realpath, rename, stat, unlink, writeFile } = require('node:fs/promises');
const path = require('node:path');

const WORKSPACE_SCHEMA = 'eclipse.ultron.developer-workspace.v1';
const PROPOSAL_SCHEMA = 'eclipse.ultron.developer-proposal.v1';
const APPROVAL_SCHEMA = 'eclipse.ultron.developer-approval.v1';
const RECEIPT_SCHEMA = 'eclipse.ultron.developer-receipt.v1';
const ROLLBACK_SCHEMA = 'eclipse.ultron.developer-rollback.v1';
const PROPOSAL_TTL_MS = 10 * 60 * 1_000;
const MAX_TASK_CHARS = 2_000;
const MAX_INVENTORY_FILES = 800;
const MAX_CONTEXT_FILES = 24;
const MAX_FILE_BYTES = 24 * 1_024;
const MAX_CONTEXT_BYTES = 24 * 1_024;
const MAX_CHANGE_FILES = 8;
const MAX_CHANGE_BYTES = 128 * 1_024;

const EXCLUDED_DIRECTORIES = new Set([
  '.git', '.idea', '.next', '.nuxt', '.turbo', '.venv', '.vscode',
  'build', 'coverage', 'dist', 'node_modules', 'out', 'release', 'target', 'vendor', 'venv',
]);
const ALLOWED_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.cs', '.css', '.go', '.h', '.html', '.java', '.js', '.jsx',
  '.json', '.md', '.mjs', '.cjs', '.php', '.prisma', '.ps1', '.py', '.rs', '.scss',
  '.sh', '.sql', '.svelte', '.toml', '.ts', '.tsx', '.vue', '.xml', '.yaml', '.yml',
]);
const ALLOWED_FILENAMES = new Set([
  'agents.md', 'claude.md', 'dockerfile', 'license', 'makefile', 'readme', 'readme.md',
]);
const SENSITIVE_FILENAMES = /^(?:\.env(?:\..+)?|\.npmrc|\.pypirc|credentials(?:\..+)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|secrets?(?:\..+)?|token(?:s)?(?:\..+)?)$/i;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const fail = (code, message) => Object.assign(new Error(message), { code });

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return keys.length === sortedExpected.length && keys.every((key, index) => key === sortedExpected[index]);
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function normalizeRelativePath(input) {
  if (typeof input !== 'string' || input.length === 0 || input.length > 220 || CONTROL_CHARACTERS.test(input)) return null;
  const portable = input.replaceAll('\\', '/');
  if (portable.startsWith('/') || /^[a-z]:/i.test(portable)) return null;
  const normalized = path.posix.normalize(portable).replace(/^\.\//, '');
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) return null;
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || EXCLUDED_DIRECTORIES.has(segment.toLowerCase()))) return null;
  const filename = segments.at(-1).toLowerCase();
  if (SENSITIVE_FILENAMES.test(filename)) return null;
  const extension = path.posix.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension) && !ALLOWED_FILENAMES.has(filename)) return null;
  return normalized;
}

function redactSecrets(content) {
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) return null;
  return content
    .replace(/\b(?:sk|ghp|github_pat|hf)_[A-Za-z0-9_-]{16,}\b/g, '<redacted-token>')
    .replace(/\b((?:api[_-]?key|access[_-]?token|client[_-]?secret|password|secret)\s*[:=]\s*)(["']?)[^\s,"']{8,}\2/gi, '$1<redacted>');
}

async function inspectTextFile(root, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) throw fail('DEVELOPER_PATH_REJECTED', 'Файл не входит в безопасный текстовый allowlist.');
  const target = path.resolve(root, ...normalized.split('/'));
  if (!isContained(root, target)) throw fail('DEVELOPER_PATH_REJECTED', 'Файл находится вне выбранного репозитория.');
  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_FILE_BYTES) {
    throw fail('DEVELOPER_FILE_REJECTED', 'Файл является ссылкой, не является обычным файлом или превышает лимит.');
  }
  const canonical = await realpath(target);
  if (!isContained(root, canonical)) throw fail('DEVELOPER_PATH_REJECTED', 'Файл разрешается за пределы выбранного репозитория.');
  const buffer = await readFile(canonical);
  if (buffer.includes(0)) throw fail('DEVELOPER_BINARY_REJECTED', 'Бинарные файлы не передаются модели.');
  const content = buffer.toString('utf8');
  const redacted = redactSecrets(content);
  if (redacted === null) throw fail('DEVELOPER_SECRET_REJECTED', 'Файл похож на закрытый ключ и исключён из контекста.');
  if (redacted !== content) throw fail('DEVELOPER_SECRET_REJECTED', 'Файл содержит похожие на секреты значения и исключён из AI-контекста.');
  return { path: normalized, content, modelContent: redacted, sha256: sha256(buffer), bytes: buffer.length };
}

async function inventoryWorkspace(root) {
  const files = [];
  const queue = [{ absolute: root, relative: '', depth: 0 }];
  while (queue.length && files.length < MAX_INVENTORY_FILES) {
    const current = queue.shift();
    const entries = await readdir(current.absolute, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (files.length >= MAX_INVENTORY_FILES) break;
      if (entry.isSymbolicLink()) continue;
      const relative = current.relative ? `${current.relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (current.depth < 8 && !EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase())) {
          queue.push({ absolute: path.join(current.absolute, entry.name), relative, depth: current.depth + 1 });
        }
        continue;
      }
      if (!entry.isFile()) continue;
      const normalized = normalizeRelativePath(relative);
      if (!normalized) continue;
      const info = await stat(path.join(current.absolute, entry.name));
      if (info.size <= MAX_FILE_BYTES) files.push({ path: normalized, bytes: info.size });
    }
  }
  return files;
}

async function openDeveloperWorkspace(selectedPath, options = {}) {
  if (typeof selectedPath !== 'string' || !path.isAbsolute(selectedPath)) throw fail('DEVELOPER_WORKSPACE_REJECTED', 'Нужен абсолютный путь к репозиторию.');
  const selectedInfo = await lstat(selectedPath);
  if (!selectedInfo.isDirectory() || selectedInfo.isSymbolicLink()) throw fail('DEVELOPER_WORKSPACE_REJECTED', 'Выберите обычную папку Git-репозитория.');
  const root = await realpath(selectedPath);
  const gitInfo = await lstat(path.join(root, '.git')).catch(() => null);
  if (!gitInfo || (!gitInfo.isDirectory() && !gitInfo.isFile()) || gitInfo.isSymbolicLink()) {
    throw fail('DEVELOPER_GIT_REQUIRED', 'Developer Mode работает только с выбранным Git-репозиторием.');
  }
  const files = await inventoryWorkspace(root);
  return Object.freeze({
    schemaVersion: WORKSPACE_SCHEMA,
    workspaceId: (options.idFactory ?? randomUUID)(),
    root,
    name: path.basename(root),
    files,
    truncated: files.length >= MAX_INVENTORY_FILES,
    openedAt: new Date(options.now ?? Date.now()).toISOString(),
  });
}

function taskTokens(task) {
  return [...new Set(task.toLocaleLowerCase('ru-RU').match(/[\p{L}\p{N}_-]{3,}/gu) ?? [])].slice(0, 24);
}

function scoreFile(relativePath, tokens) {
  const lower = relativePath.toLocaleLowerCase('ru-RU');
  const filename = path.posix.basename(lower);
  let score = tokens.reduce((total, token) => total + (lower.includes(token) ? 8 : 0), 0);
  if (['agents.md', 'claude.md', 'readme.md', 'package.json', 'tsconfig.json'].includes(filename)) score += 18;
  if (/(?:src|app|lib|electron|components)\//.test(lower)) score += 3;
  score -= lower.split('/').length * 0.1;
  return score;
}

async function prepareDeveloperContext(workspace, task) {
  if (!workspace || workspace.schemaVersion !== WORKSPACE_SCHEMA) throw fail('DEVELOPER_WORKSPACE_INVALID', 'Сессия репозитория недействительна.');
  if (typeof task !== 'string' || !task.trim() || [...task].length > MAX_TASK_CHARS || CONTROL_CHARACTERS.test(task)) {
    throw fail('DEVELOPER_TASK_REJECTED', `Опишите задачу текстом до ${MAX_TASK_CHARS} символов.`);
  }
  const tokens = taskTokens(task);
  const ranked = [...workspace.files].sort((left, right) => scoreFile(right.path, tokens) - scoreFile(left.path, tokens));
  const files = [];
  let bytes = 0;
  let excluded = 0;
  for (const candidate of ranked) {
    if (files.length >= MAX_CONTEXT_FILES || bytes >= MAX_CONTEXT_BYTES) break;
    try {
      const inspected = await inspectTextFile(workspace.root, candidate.path);
      if (bytes + inspected.bytes > MAX_CONTEXT_BYTES) continue;
      files.push(inspected);
      bytes += inspected.bytes;
    } catch {
      excluded += 1;
    }
  }
  if (files.length === 0) throw fail('DEVELOPER_CONTEXT_EMPTY', 'В репозитории не найден безопасный текстовый контекст.');
  return Object.freeze({ task: task.trim(), files, bytes, excluded });
}

function extractJson(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2 * 1_024 * 1_024) throw fail('DEVELOPER_MODEL_OUTPUT_REJECTED', 'Ответ модели пуст или превышает лимит.');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced ?? raw).trim();
  try { return JSON.parse(candidate); } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) throw fail('DEVELOPER_MODEL_OUTPUT_REJECTED', 'Модель не вернула структурированный proposal.');
    try { return JSON.parse(candidate.slice(start, end + 1)); }
    catch { throw fail('DEVELOPER_MODEL_OUTPUT_REJECTED', 'JSON proposal модели повреждён. Повторите запрос.'); }
  }
}

function boundedStringArray(value, maximum) {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const normalized = value.map((entry) => typeof entry === 'string' ? entry.trim().slice(0, 500) : null);
  return normalized.every((entry) => entry !== null) ? normalized : null;
}

function simpleUnifiedDiff(relativePath, before, after) {
  const oldLines = before.split('\n');
  const newLines = after.split('\n');
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix
    && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix += 1;
  const contextStart = Math.max(0, prefix - 3);
  const oldEnd = oldLines.length - suffix;
  const newEnd = newLines.length - suffix;
  const contextEndOld = Math.min(oldLines.length, oldEnd + 3);
  const contextEndNew = Math.min(newLines.length, newEnd + 3);
  const lines = [`--- a/${relativePath}`, `+++ b/${relativePath}`,
    `@@ -${contextStart + 1},${contextEndOld - contextStart} +${contextStart + 1},${contextEndNew - contextStart} @@`];
  for (let index = contextStart; index < prefix; index += 1) lines.push(` ${oldLines[index]}`);
  for (let index = prefix; index < oldEnd; index += 1) lines.push(`-${oldLines[index]}`);
  for (let index = prefix; index < newEnd; index += 1) lines.push(`+${newLines[index]}`);
  for (let index = oldEnd; index < contextEndOld; index += 1) lines.push(` ${oldLines[index]}`);
  return lines.join('\n');
}

function createDeveloperProposal(workspace, context, rawOutput, options = {}) {
  const parsed = extractJson(rawOutput);
  if (!exactKeys(parsed, ['schemaVersion', 'summary', 'assumptions', 'risks', 'changes']) || parsed.schemaVersion !== PROPOSAL_SCHEMA) {
    throw fail('DEVELOPER_MODEL_OUTPUT_REJECTED', 'Proposal не соответствует утверждённой схеме.');
  }
  if (typeof parsed.summary !== 'string' || !parsed.summary.trim() || [...parsed.summary].length > 1_000) {
    throw fail('DEVELOPER_MODEL_OUTPUT_REJECTED', 'В proposal отсутствует корректное резюме.');
  }
  const assumptions = boundedStringArray(parsed.assumptions, 12);
  const risks = boundedStringArray(parsed.risks, 12);
  if (!assumptions || !risks || !Array.isArray(parsed.changes) || parsed.changes.length === 0 || parsed.changes.length > MAX_CHANGE_FILES) {
    throw fail('DEVELOPER_MODEL_OUTPUT_REJECTED', 'Proposal содержит некорректные допущения, риски или количество файлов.');
  }
  const contextByPath = new Map(context.files.map((file) => [file.path, file]));
  const seen = new Set();
  let changeBytes = 0;
  const changes = parsed.changes.map((change) => {
    if (!exactKeys(change, ['path', 'content']) || typeof change.content !== 'string' || CONTROL_CHARACTERS.test(change.content)) {
      throw fail('DEVELOPER_MODEL_OUTPUT_REJECTED', 'Изменение файла не соответствует схеме.');
    }
    const relativePath = normalizeRelativePath(change.path);
    if (!relativePath || seen.has(relativePath)) throw fail('DEVELOPER_PATH_REJECTED', 'Proposal содержит запрещённый или повторяющийся путь.');
    seen.add(relativePath);
    const original = contextByPath.get(relativePath);
    if (!original) throw fail('DEVELOPER_CONTEXT_VIOLATION', 'Модель попыталась изменить файл, который не входил в подтверждённый read-only context.');
    const contentBytes = Buffer.byteLength(change.content, 'utf8');
    changeBytes += contentBytes;
    if (contentBytes > MAX_FILE_BYTES || changeBytes > MAX_CHANGE_BYTES) throw fail('DEVELOPER_CHANGE_LIMIT', 'Изменения превышают безопасный лимит.');
    const secretChecked = redactSecrets(change.content);
    if (secretChecked === null || secretChecked !== change.content) throw fail('DEVELOPER_SECRET_REJECTED', 'Proposal модели содержит значение, похожее на секрет.');
    if (change.content === original.content) throw fail('DEVELOPER_NO_CHANGES', 'Proposal не изменяет содержимое файла.');
    return Object.freeze({
      path: relativePath,
      expectedSha256: original.sha256,
      before: original.content,
      after: change.content,
      afterSha256: sha256(Buffer.from(change.content, 'utf8')),
      diff: simpleUnifiedDiff(relativePath, original.content, change.content),
    });
  });
  const now = options.now ?? Date.now();
  const requestId = (options.idFactory ?? randomUUID)();
  return Object.freeze({
    schemaVersion: PROPOSAL_SCHEMA,
    requestId,
    workspaceId: workspace.workspaceId,
    workspaceName: workspace.name,
    summary: parsed.summary.trim(),
    assumptions,
    risks,
    changes,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PROPOSAL_TTL_MS).toISOString(),
  });
}

function publicProposal(proposal) {
  return Object.freeze({
    schemaVersion: proposal.schemaVersion,
    requestId: proposal.requestId,
    workspaceId: proposal.workspaceId,
    workspaceName: proposal.workspaceName,
    summary: proposal.summary,
    assumptions: proposal.assumptions,
    risks: proposal.risks,
    changes: proposal.changes.map(({ path: filePath, expectedSha256, afterSha256, diff }) => ({ path: filePath, expectedSha256, afterSha256, diff })),
    createdAt: proposal.createdAt,
    expiresAt: proposal.expiresAt,
  });
}

function approveDeveloperProposal(proposal, approval, now = Date.now()) {
  if (!proposal || !exactKeys(approval, ['schemaVersion', 'requestId', 'workspaceId', 'confirmed'])) return false;
  if (approval.schemaVersion !== APPROVAL_SCHEMA || approval.confirmed !== true) return false;
  if (approval.requestId !== proposal.requestId || approval.workspaceId !== proposal.workspaceId) return false;
  const expiresAt = Date.parse(proposal.expiresAt);
  return Number.isFinite(expiresAt) && now <= expiresAt;
}

async function applyDeveloperProposal(workspace, proposal, options = {}) {
  const snapshots = [];
  for (const change of proposal.changes) {
    const current = await inspectTextFile(workspace.root, change.path);
    if (current.sha256 !== change.expectedSha256) throw fail('DEVELOPER_WORKSPACE_CHANGED', `${change.path} изменён после preview. Сформируйте proposal заново.`);
    snapshots.push({ ...change, target: path.resolve(workspace.root, ...change.path.split('/')), mode: (await stat(path.resolve(workspace.root, ...change.path.split('/')))).mode });
  }
  const applied = [];
  try {
    for (const snapshot of snapshots) {
      const temporary = `${snapshot.target}.ultron-${randomUUID()}.tmp`;
      const backup = `${snapshot.target}.ultron-${randomUUID()}.bak`;
      await mkdir(path.dirname(snapshot.target), { recursive: true });
      await writeFile(temporary, snapshot.after, { encoding: 'utf8', flag: 'wx', mode: snapshot.mode });
      await rename(snapshot.target, backup);
      try {
        await rename(temporary, snapshot.target);
      } catch (error) {
        await rename(backup, snapshot.target).catch(() => {});
        await unlink(temporary).catch(() => {});
        throw error;
      }
      applied.push({ ...snapshot, backup });
    }
    for (const snapshot of applied) await unlink(snapshot.backup).catch(() => {});
  } catch (error) {
    for (const snapshot of [...applied].reverse()) {
      await unlink(snapshot.target).catch(() => {});
      await rename(snapshot.backup, snapshot.target).catch(() => {});
    }
    throw fail('DEVELOPER_APPLY_FAILED', 'Не удалось применить все файлы; выполнен автоматический откат текущей операции.');
  }
  const appliedAt = new Date(options.now ?? Date.now()).toISOString();
  const receiptId = (options.idFactory ?? randomUUID)();
  return Object.freeze({
    receipt: Object.freeze({
      schemaVersion: RECEIPT_SCHEMA,
      receiptId,
      requestId: proposal.requestId,
      workspaceId: workspace.workspaceId,
      workspaceName: workspace.name,
      status: 'applied',
      files: snapshots.map(({ path: filePath, expectedSha256, afterSha256 }) => ({ path: filePath, beforeSha256: expectedSha256, afterSha256 })),
      appliedAt,
      rollbackAvailable: true,
    }),
    rollback: Object.freeze({ receiptId, workspaceId: workspace.workspaceId, snapshots }),
  });
}

function createRollbackPreview(applied, options = {}) {
  if (!applied) throw fail('DEVELOPER_ROLLBACK_UNAVAILABLE', 'Откат для этой операции недоступен.');
  return Object.freeze({
    schemaVersion: ROLLBACK_SCHEMA,
    requestId: (options.idFactory ?? randomUUID)(),
    receiptId: applied.receiptId,
    workspaceId: applied.workspaceId,
    files: applied.snapshots.map(({ path: filePath, expectedSha256, afterSha256 }) => ({ path: filePath, restoreSha256: expectedSha256, currentSha256: afterSha256 })),
    expiresAt: new Date((options.now ?? Date.now()) + PROPOSAL_TTL_MS).toISOString(),
  });
}

async function executeRollback(workspace, applied, preview, approval, now = Date.now()) {
  if (!preview || !exactKeys(approval, ['schemaVersion', 'requestId', 'workspaceId', 'confirmed'])) throw fail('DEVELOPER_ROLLBACK_INVALID', 'Подтверждение отката недействительно.');
  if (approval.schemaVersion !== APPROVAL_SCHEMA || approval.confirmed !== true || approval.requestId !== preview.requestId
    || approval.workspaceId !== preview.workspaceId || Date.parse(preview.expiresAt) < now) throw fail('DEVELOPER_ROLLBACK_INVALID', 'Подтверждение отката истекло или не совпадает.');
  for (const snapshot of applied.snapshots) {
    const current = await inspectTextFile(workspace.root, snapshot.path);
    if (current.sha256 !== snapshot.afterSha256) throw fail('DEVELOPER_WORKSPACE_CHANGED', `${snapshot.path} изменён после применения; автоматический откат остановлен.`);
  }
  for (const snapshot of applied.snapshots) await writeFile(snapshot.target, snapshot.before, { encoding: 'utf8', mode: snapshot.mode });
  return Object.freeze({ schemaVersion: RECEIPT_SCHEMA, receiptId: applied.receiptId, workspaceId: workspace.workspaceId,
    workspaceName: workspace.name, status: 'rolled-back', files: applied.snapshots.map(({ path: filePath }) => filePath), rolledBackAt: new Date(now).toISOString() });
}

module.exports = {
  APPROVAL_SCHEMA,
  PROPOSAL_SCHEMA,
  WORKSPACE_SCHEMA,
  applyDeveloperProposal,
  approveDeveloperProposal,
  createDeveloperProposal,
  createRollbackPreview,
  executeRollback,
  normalizeRelativePath,
  openDeveloperWorkspace,
  prepareDeveloperContext,
  publicProposal,
  redactSecrets,
};
