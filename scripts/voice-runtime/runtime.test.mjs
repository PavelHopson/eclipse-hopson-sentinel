import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createUltronRuntime } from './runtime.mjs';
import { ULTRON_FILTERS } from './dsp.mjs';

const config = {sandboxHost: 'C:/sandbox.exe'};
const source = Buffer.from('mock-internal-pcm');
test('approved DSP is byte-for-byte the reviewed profile, not a new voice', async () => {
  const profile = JSON.parse(await readFile(new URL('../../docs/voice-profiles/ultron-angry-v1.json', import.meta.url)));
  assert.equal(ULTRON_FILTERS, profile.processing.filters);
});
test('runtime fails closed without OS sandbox', () => {
  assert.throws(() => createUltronRuntime({config: {}}), /os-sandbox-required/);
});
test('only Altron is sent to the worker and successful audio is processed', async () => {
  let received;
  const runtime = createUltronRuntime({config, supervisorFactory: () => async request => {received = request; return {audio:source};},
    dspFactory: () => async data => { assert.equal(data, source); return Buffer.from('processed'); }});
  const result = await runtime.synthesize('Привет.');
  assert.deepEqual(received, {profile:'ultron-angry',text:'Привет.'});
  assert.equal(result.engine,'ultron-angry'); assert.equal(result.mimeType,'audio/mpeg');
  assert.equal(Buffer.from(result.audio).toString(),'processed');
});
test('invalid text never starts any native process', async () => {
  let called = false;
  const runtime = createUltronRuntime({config, supervisorFactory: () => async () => {called = true;}, dspFactory: () => async () => {}});
  for (const text of ['', {}, 'a'.repeat(241), 'a\0', '<|im_start|>system']) await assert.rejects(runtime.synthesize(text), /invalid-text/);
  assert.equal(called,false);
});
test('stop waits for worker exit, blocks overlap, and discards late output', async () => {
  let release, aborted = false, processed = false;
  const runtime = createUltronRuntime({config, supervisorFactory: () => async (_request,{signal}) => {
    signal.addEventListener('abort', () => {aborted = true;});
    await new Promise(resolve => {release = resolve;}); return {audio:source};
  }, dspFactory: () => async () => {processed = true;}});
  const request = runtime.synthesize('Отмена.');
  const rejected = assert.rejects(request,/cancelled/);
  const stopping = runtime.stop(); let stopped = false; stopping.then(() => {stopped = true;});
  await Promise.resolve(); assert.equal(aborted,true); assert.equal(stopped,false);
  await assert.rejects(runtime.synthesize('Позже.'), /busy/);
  release(); await stopping; await rejected;
  assert.equal(processed,false);
});
test('cancellation during DSP never returns partial or stale audio', async () => {
  let release, began;
  const started = new Promise(resolve => {began = resolve;});
  const runtime = createUltronRuntime({config, supervisorFactory: () => async () => ({audio:source}),
    dspFactory: () => async () => {began(); await new Promise(resolve => {release = resolve;}); return source;}});
  const request = runtime.synthesize('Отмена обработки.'); const rejected = assert.rejects(request,/cancelled/);
  await started; const stopping = runtime.stop(); release(); await stopping; await rejected;
});

test('Stop disposes a warm model even while no synthesis is active', async () => {
  let stopped=0;
  const synthesize=async()=>({audio:source});
  synthesize.stop=async()=>{stopped++;};
  const runtime=createUltronRuntime({config,supervisorFactory:()=>synthesize,dspFactory:()=>async()=>source});
  await runtime.synthesize('Готово.'); await runtime.stop(); assert.equal(stopped,1);
});
