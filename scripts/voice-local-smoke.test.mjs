import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./voice-local-smoke.mjs', import.meta.url));
const invoke = (args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 5000, windowsHide: true });

test('local smoke is dry-run by default and cannot start microphone or model', () => {
  const result = invoke([]);
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'dry-run');
  assert.equal(report.microphone, false);
  assert.equal(report.cloud, false);
  assert.deepEqual(report.sampleIds, ['ru-01', 'ru-07', 'ru-14']);
  assert.equal(result.stderr, '');
});

test('partial execution flags fail without reading a runtime or echoing private input', () => {
  const result = invoke(['--run', '--runtime-root', 'PRIVATE_INPUT_MARKER']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /INVALID_ARGUMENTS/);
  assert.doesNotMatch(result.stderr + result.stdout, /PRIVATE_INPUT_MARKER/);
});

test('relative and URL runtime arguments cannot become executable targets', () => {
  for (const runtime of ['relative/runtime', 'https://example.invalid/runtime']) {
    const result = invoke(['--run', '--runtime-root', runtime, '--ffmpeg', 'relative/ffmpeg']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ABSOLUTE_WINDOWS_RUNTIME_REQUIRED/);
    assert.doesNotMatch(result.stderr, /example.invalid/);
  }
});
