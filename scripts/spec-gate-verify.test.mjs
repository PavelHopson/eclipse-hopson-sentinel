import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateSpecGateArtifact, verifySpecGate } from './spec-gate-verify.mjs';

function artifact() {
  const ids = ['constitution', 'specify', 'clarify', 'plan', 'tasks', 'implement'];
  const criteria = ['Контракт проходит строгую проверку', 'Implementation остаётся заблокированным'];
  const now = new Date().toISOString();
  return {
    schemaVersion: 'eclipse.spec-gate.v1', id: 'spec-1', status: 'approved', createdAt: now, updatedAt: now,
    approval: { scopeConfirmed: true, risksConfirmed: true, rollbackConfirmed: true, approvedAt: now },
    input: {
      projectName: 'Sentinel Spec Gate', repository: 'PavelHopson/eclipse-hopson-sentinel',
      problem: 'Нужно доказуемо проверить контракт до запуска любых внешних действий.',
      userOutcome: 'Пользователь получает локальный read-only отчёт.',
      inScope: ['Проверить JSON и evidence'], outOfScope: ['Не выполнять команды'],
      constraints: ['Только offline read-only режим'], acceptanceCriteria: criteria, clarifications: [],
      rollbackPlan: 'Удалить локальный отчёт; workspace не изменяется.', evidencePaths: ['src/feature.ts'],
    },
    stages: ids.map((id, index) => ({ id, command: `/${id}`, status: id === 'implement' ? 'blocked' : 'complete', summary: `Стадия ${index + 1} проверена.` })),
    tasks: criteria.map((criterion, index) => ({ id: `task-${String(index + 1).padStart(2, '0')}`, title: `Проверить критерий ${index + 1}`, acceptanceCriterion: criterion, status: 'pending' })),
    verification: { evidencePaths: ['src/feature.ts'], requiredChecks: ['typecheck', 'tests', 'build', 'desktop-qa', 'mobile-qa', 'security-review'] },
    policy: { externalActions: false, toolsAllowed: false, sourceContentTrusted: false, generatedCodeExecuted: false, githubConnected: false, deployAllowed: false, paymentsAllowed: false, implementationAllowed: false },
  };
}
test('validates a bounded approved contract and refuses execution escalation', () => {
  assert.equal(validateSpecGateArtifact(artifact()).schemaVersion, 'eclipse.spec-gate.v1');
  const unsafe = artifact(); unsafe.policy.toolsAllowed = true;
  assert.throws(() => validateSpecGateArtifact(unsafe), /Policy/);
  const implemented = artifact(); implemented.stages[5].status = 'complete';
  assert.throws(() => validateSpecGateArtifact(implemented), /implement/);
  const incompleteApproval = artifact(); incompleteApproval.approval.scopeConfirmed = false;
  assert.throws(() => validateSpecGateArtifact(incompleteApproval), /Approval/);
  const driftedTask = artifact(); driftedTask.tasks[0].acceptanceCriterion = 'Другой критерий';
  assert.throws(() => validateSpecGateArtifact(driftedTask), /Task/);
  const extraField = artifact(); extraField.unexpected = true;
  assert.throws(() => validateSpecGateArtifact(extraField), /неизвестные|пропущенные/);
});

test('verifies declared evidence offline and returns stable hashes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-spec-'));
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'src/feature.ts'), 'export const safe = true;\n');
  await writeFile(path.join(root, 'spec.json'), JSON.stringify(artifact()));
  const report = await verifySpecGate({ specPath: path.join(root, 'spec.json'), workspacePath: root });
  assert.equal(report.status, 'pass');
  assert.match(report.evidence[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(report.mode, 'offline-read-only');
});

test('rejects traversal and symbolic-link evidence', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-spec-'));
  const traversal = artifact(); traversal.input.evidencePaths = ['../secret']; traversal.verification.evidencePaths = ['../secret'];
  assert.throws(() => validateSpecGateArtifact(traversal), /Evidence|path/i);
  await mkdir(path.join(root, 'src')); await writeFile(path.join(root, 'outside.ts'), 'secret');
  try {
    await symlink(path.join(root, 'outside.ts'), path.join(root, 'src/feature.ts'), 'file');
    await writeFile(path.join(root, 'spec.json'), JSON.stringify(artifact()));
    await assert.rejects(() => verifySpecGate({ specPath: path.join(root, 'spec.json'), workspacePath: root }), /обычным файлом/);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EPERM') return;
    throw error;
  }
});
