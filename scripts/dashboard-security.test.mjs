import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('desktop microphone permission stays fail-closed', async () => {
  const source = await readFile(new URL('../dashboard/electron/main.cjs', import.meta.url), 'utf8');
  assert.match(source, /setPermissionRequestHandler/);
  assert.match(source, /callback\(false\)/);
  assert.doesNotMatch(source, /permission === ['"](?:media|microphone)['"][\s\S]{0,100}callback\(true\)/);
});

test('voice command policy contains no mutable capability', async () => {
  const source = await readFile(new URL('../dashboard/src/lib/voiceCommandPolicy.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /effect:\s*['"](?:write|shell|network|install|deploy)['"]/);
  assert.match(source, /effect:\s*'read-only'/);
});
