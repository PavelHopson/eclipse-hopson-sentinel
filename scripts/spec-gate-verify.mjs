#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_SPEC_BYTES = 96 * 1024;
const STAGES = ['constitution', 'specify', 'clarify', 'plan', 'tasks', 'implement'];
const CHECKS = ['typecheck', 'tests', 'build', 'desktop-qa', 'mobile-qa', 'security-review'];
const POLICY_KEYS = ['externalActions', 'toolsAllowed', 'sourceContentTrusted', 'generatedCodeExecuted', 'githubConnected', 'deployAllowed', 'paymentsAllowed', 'implementationAllowed'];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const TOP_KEYS = ['approval', 'createdAt', 'id', 'input', 'policy', 'schemaVersion', 'stages', 'status', 'tasks', 'updatedAt', 'verification'];
const INPUT_KEYS = ['acceptanceCriteria', 'clarifications', 'constraints', 'evidencePaths', 'inScope', 'outOfScope', 'problem', 'projectName', 'repository', 'rollbackPlan', 'userOutcome'];
const SECRET = /(?:AKIA[0-9A-Z]{16}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;

function parseArgs(argv) {
  const options = { spec: '', workspace: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--json') options.json = true;
    else if (value === '--spec' && argv[index + 1]) options.spec = argv[++index];
    else if (value === '--workspace' && argv[index + 1]) options.workspace = argv[++index];
    else throw new Error(`Неизвестный аргумент: ${value}`);
  }
  if (!options.spec || !options.workspace) throw new Error('Использование: sentinel spec verify --spec <file.json> --workspace <repo> [--json]');
  return options;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, expected, label) {
  assert(isObject(value), `${label} должен быть объектом`);
  assert(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()), `${label} содержит неизвестные или пропущенные поля`);
}

function safeText(value, label, min, max) {
  assert(typeof value === 'string' && value.trim().length >= min && value.trim().length <= max, `${label}: недопустимая длина`);
  assert(!CONTROL.test(value) && !SECRET.test(value), `${label}: управляющие символы или секреты запрещены`);
  return value;
}

function safeTextList(value, label, min, max) {
  assert(Array.isArray(value) && value.length >= min && value.length <= max, `${label}: недопустимое число элементов`);
  value.forEach((item) => safeText(item, label, 3, 320));
  assert(new Set(value).size === value.length, `${label}: элементы должны быть уникальными`);
}

function isoDate(value, label) {
  assert(typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value)), `${label}: нужна ISO-дата с timezone`);
}

export function validateSpecGateArtifact(artifact) {
  exactKeys(artifact, TOP_KEYS, 'Spec Gate');
  assert(artifact.schemaVersion === 'eclipse.spec-gate.v1', 'Поддерживается только eclipse.spec-gate.v1');
  assert(typeof artifact.id === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(artifact.id), 'Некорректный ID спецификации');
  assert(artifact.status === 'approved', 'Sentinel проверяет только утверждённую спецификацию');
  isoDate(artifact.createdAt, 'createdAt');
  isoDate(artifact.updatedAt, 'updatedAt');
  assert(Date.parse(artifact.updatedAt) >= Date.parse(artifact.createdAt), 'updatedAt не может быть раньше createdAt');

  exactKeys(artifact.approval, ['approvedAt', 'risksConfirmed', 'rollbackConfirmed', 'scopeConfirmed'], 'approval');
  assert(artifact.approval.scopeConfirmed === true && artifact.approval.risksConfirmed === true && artifact.approval.rollbackConfirmed === true, 'Approval checklist должен быть полностью подтверждён');
  isoDate(artifact.approval.approvedAt, 'approval.approvedAt');

  exactKeys(artifact.input, INPUT_KEYS, 'input');
  safeText(artifact.input.projectName, 'projectName', 3, 80);
  safeText(artifact.input.repository, 'repository', 3, 200);
  assert(/^(?:https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/.test(artifact.input.repository), 'Некорректный GitHub repository');
  safeText(artifact.input.problem, 'problem', 20, 800);
  safeText(artifact.input.userOutcome, 'userOutcome', 10, 320);
  safeText(artifact.input.rollbackPlan, 'rollbackPlan', 10, 600);
  safeTextList(artifact.input.inScope, 'inScope', 1, 10);
  safeTextList(artifact.input.outOfScope, 'outOfScope', 1, 10);
  safeTextList(artifact.input.constraints, 'constraints', 1, 10);
  safeTextList(artifact.input.acceptanceCriteria, 'acceptanceCriteria', 2, 12);
  assert(Array.isArray(artifact.input.clarifications) && artifact.input.clarifications.length <= 10, 'clarifications: максимум 10');
  artifact.input.clarifications.forEach((item) => {
    exactKeys(item, ['answer', 'question'], 'clarification');
    safeText(item.question, 'clarification.question', 5, 240);
    safeText(item.answer, 'clarification.answer', 2, 400);
  });
  assert(Array.isArray(artifact.input.evidencePaths) && artifact.input.evidencePaths.length >= 1 && artifact.input.evidencePaths.length <= 20, 'Нужны 1–20 evidence paths');
  artifact.input.evidencePaths.forEach(safeRelativePath);
  assert(new Set(artifact.input.evidencePaths).size === artifact.input.evidencePaths.length, 'Evidence paths должны быть уникальными');

  assert(Array.isArray(artifact.stages) && artifact.stages.length === STAGES.length, 'Spec Gate должен содержать шесть стадий');
  artifact.stages.forEach((stage, index) => {
    exactKeys(stage, ['command', 'id', 'status', 'summary'], `stage ${index + 1}`);
    assert(stage.id === STAGES[index] && stage.command === `/${STAGES[index]}`, 'Нарушен порядок Spec Gate stages');
    assert(stage.status === (index === 5 ? 'blocked' : 'complete'), '/implement обязан оставаться заблокированным');
    safeText(stage.summary, `stage ${stage.id} summary`, 3, 400);
  });

  assert(Array.isArray(artifact.tasks) && artifact.tasks.length === artifact.input.acceptanceCriteria.length, 'Tasks не соответствуют критериям приёмки');
  artifact.tasks.forEach((task, index) => {
    exactKeys(task, ['acceptanceCriterion', 'id', 'status', 'title'], `task ${index + 1}`);
    assert(task.id === `task-${String(index + 1).padStart(2, '0')}`, 'Некорректный task ID');
    safeText(task.title, `task ${index + 1} title`, 3, 120);
    assert(task.status === 'pending' && task.acceptanceCriterion === artifact.input.acceptanceCriteria[index], 'Task не соответствует критерию приёмки');
  });

  exactKeys(artifact.verification, ['evidencePaths', 'requiredChecks'], 'verification');
  assert(JSON.stringify(artifact.verification.evidencePaths) === JSON.stringify(artifact.input.evidencePaths), 'Evidence paths расходятся между input и verification');
  assert(JSON.stringify(artifact.verification.requiredChecks) === JSON.stringify(CHECKS), 'Нарушен список обязательных проверок');

  exactKeys(artifact.policy, POLICY_KEYS, 'policy');
  assert(POLICY_KEYS.every((key) => artifact.policy[key] === false), 'Policy пытается разрешить внешнее действие');
  return artifact;
}
function safeRelativePath(value) {
  assert(typeof value === 'string' && value.length > 0 && value.length <= 240, 'Некорректный evidence path');
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
  assert(!normalized.startsWith('/') && !/^[A-Za-z]:\//.test(normalized), 'Evidence path должен быть относительным');
  const parts = normalized.split('/');
  assert(parts.every((part) => part && part !== '.' && part !== '..') && !parts.includes('.git'), 'Evidence path выходит из workspace или указывает на .git');
  return normalized;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

export async function verifySpecGate({ specPath, workspacePath }) {
  const resolvedSpec = path.resolve(specPath);
  const resolvedWorkspace = path.resolve(workspacePath);
  const workspaceInfo = await stat(resolvedWorkspace);
  assert(workspaceInfo.isDirectory(), 'Workspace должен быть директорией');
  const workspaceReal = await realpath(resolvedWorkspace);
  const raw = await readFile(resolvedSpec);
  assert(raw.byteLength <= MAX_SPEC_BYTES, 'Spec Gate JSON превышает лимит 96 КБ');
  let parsed;
  try { parsed = JSON.parse(raw.toString('utf8')); } catch { throw new Error('Spec Gate файл не является корректным JSON'); }
  const artifact = validateSpecGateArtifact(parsed);
  const evidence = [];
  for (const declaredPath of artifact.verification.evidencePaths) {
    const relativePath = safeRelativePath(declaredPath);
    const candidate = path.resolve(resolvedWorkspace, relativePath);
    assert(isInside(resolvedWorkspace, candidate), `Evidence path выходит из workspace: ${relativePath}`);
    const info = await lstat(candidate);
    assert(!info.isSymbolicLink() && info.isFile(), `Evidence должен быть обычным файлом: ${relativePath}`);
    const candidateReal = await realpath(candidate);
    assert(isInside(workspaceReal, candidateReal), `Evidence path разрешается за пределами workspace: ${relativePath}`);
    const bytes = await readFile(candidateReal);
    evidence.push({ path: relativePath, bytes: bytes.byteLength, sha256: sha256(bytes) });
  }
  return {
    schemaVersion: 'eclipse.spec-verification.v1',
    specId: artifact.id,
    specSha256: sha256(raw),
    status: 'pass',
    mode: 'offline-read-only',
    checkedAt: new Date().toISOString(),
    evidence,
    limitations: ['Проверка подтверждает наличие и hash файлов, но не доказывает корректность поведения.', 'Команды из artifact не выполняются.'],
  };
}

export async function runSpecGateCli(argv) {
  try {
    const options = parseArgs(argv);
    const report = await verifySpecGate({ specPath: options.spec, workspacePath: options.workspace });
    if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else {
      process.stdout.write(`Spec Gate ${report.specId}: PASS\n`);
      process.stdout.write(`Mode: ${report.mode}\nEvidence files: ${report.evidence.length}\n`);
      for (const item of report.evidence) process.stdout.write(`- ${item.path}  ${item.sha256}\n`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`Spec Gate verification failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await runSpecGateCli(process.argv.slice(2));
}
