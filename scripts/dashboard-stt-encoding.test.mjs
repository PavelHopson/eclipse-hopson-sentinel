import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sttScript = path.join(repoRoot, 'scripts', 'sentinel-stt.ps1');

test('STT wrapper is UTF-8 BOM encoded for Windows PowerShell 5.1', () => {
  const bytes = readFileSync(sttScript);
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(bytes.toString('utf8'), /продолжение следует/);
});

test('Windows PowerShell 5.1 parses the STT wrapper without executing it', { skip: process.platform !== 'win32' }, () => {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  const powershell = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const parseOnly = [
    '$tokens = $null',
    '$errors = $null',
    '[System.Management.Automation.Language.Parser]::ParseFile($env:ULTRON_STT_SCRIPT, [ref]$tokens, [ref]$errors) | Out-Null',
    'if ($errors.Count -gt 0) { $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }; exit 1 }',
  ].join('; ');
  const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', parseOnly], {
    encoding: 'utf8',
    env: { ...process.env, ULTRON_STT_SCRIPT: sttScript },
    shell: false,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
