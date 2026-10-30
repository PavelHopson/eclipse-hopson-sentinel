import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../dashboard/src/lib/voiceTurn.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText;
const { latestVoiceExchange } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const user = (content) => ({ role: 'user', content });
const assistant = (content) => ({ role: 'assistant', content });

test('empty assistant after new question does not resurrect an unrelated old answer', () => {
  const result = latestVoiceExchange([user('Открой YouTube'), assistant('Старый ответ о YouTube'), user('Продолжение следует…'), assistant('')]);
  assert.deepEqual(result, { question: 'Продолжение следует…', answer: '' });
});
test('a new question without even an assistant placeholder has no answer', () => {
  assert.deepEqual(latestVoiceExchange([user('Первый'), assistant('Первый ответ'), user('Второй')]), { question: 'Второй', answer: '' });
});
test('streamed current answer and latest action receipt belong to the latest question', () => {
  assert.deepEqual(latestVoiceExchange([user('Первый'), assistant('Старый'), user('Второй'), assistant('Часть ответа')]), { question: 'Второй', answer: 'Часть ответа' });
  assert.equal(latestVoiceExchange([user('Открой YouTube'), assistant('Нужно подтверждение'), assistant('Действие отменено')]).answer, 'Действие отменено');
});
test('no user question means no displayed exchange and input history is not mutated', () => {
  const messages = Object.freeze([Object.freeze(assistant('Не вопрос'))]);
  assert.deepEqual(latestVoiceExchange(messages), { question: '', answer: '' });
  assert.deepEqual(latestVoiceExchange([]), { question: '', answer: '' });
});
test('error state is sticky and cancelled turns cannot deliver late chunks into another session', async () => {
  const app = await readFile(new URL('../dashboard/src/App.tsx', import.meta.url), 'utf8');
  const voice = await readFile(new URL('../dashboard/src/components/UltronVoiceConversation.tsx', import.meta.url), 'utf8');
  assert.match(app, /if \(presence !== 'success'\) return;/);
  assert.doesNotMatch(app, /presence === 'success' \? 1_400 : 2_400/);
  assert.match(app, /<VoiceConversation\s+key=\{activeId\}/);
  assert.match(voice, /\(chunk\) => \{\s*if \(turnSequenceRef.current !== turnId \|\| controller.signal.aborted\) return;/);
  assert.match(voice, /catch \(turnError: unknown\) \{\s*if \(turnSequenceRef.current !== turnId\) return;/);
  assert.match(voice, /!busyRef.current && !errorRef.current/);
  const liveStart = voice.split('const startLiveConversation =')[1].split('const stopLiveConversation =')[0];
  const oneShotStart = voice.split('const startVoiceTurn =')[1].split('const repeatAnswer =')[0];
  assert.doesNotMatch(liveStart, /await prepareModel\(\)/);
  assert.match(liveStart, /const result = await startLiveLocal\(\)[\s\S]*void prepareModel\(\)/);
  assert.doesNotMatch(oneShotStart, /await prepareModel\(\)/);
  assert.match(oneShotStart, /setCapturing\(true\)[\s\S]*void prepareModel\(\)/);
  assert.match(voice, /subscribeLiveVoiceControl/);
  assert.match(voice, /getLiveStatusLocal/);
  assert.match(voice, /turnSequenceRef.current !== captureId \|\| !mountedRef.current/);
  assert.match(voice.split('const stopTurn =')[1].split('const respondTo =')[0], /setActionExecuting\(false\)/);
  assert.match(voice, /return \(\) => \{ mountedRef.current = false; \}/);
});
