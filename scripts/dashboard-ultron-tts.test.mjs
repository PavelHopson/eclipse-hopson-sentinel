import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createRequire } from 'node:module';
const { publicTtsFailure } = createRequire(import.meta.url)('../dashboard/electron/voice-tts-errors.cjs');

test('native TTS failures expose bounded fixed stage codes, never native payloads', () => {
  for (const [reason, code] of [['piper-timeout', 'TTS_PIPER_TIMEOUT'], ['piper-invalid-audio', 'TTS_PIPER_AUDIO'],
    ['dsp-unavailable', 'TTS_DSP_START'], ['dsp-invalid-audio', 'TTS_DSP_AUDIO'], ['runtime-integrity', 'TTS_RUNTIME_INTEGRITY'],
    ['cancelled', 'TTS_CANCELLED'], ['busy', 'TTS_BUSY']]) {
    const result = publicTtsFailure(new Error(reason));
    assert.equal(result.ok, false); assert.equal(result.error.code, code);
    assert.ok(result.error.message.includes(code));
    assert.ok(result.error.message.length < 240);
  }
  for (const error of [undefined, 'untrusted', new Error('secret synthetic payload E:/private/path'), new Error('constructor')]) {
    const result = publicTtsFailure(error);
    assert.equal(result.error.code, 'TTS_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(result), /synthetic|private|constructor|untrusted/);
  }
  const missing = Object.assign(new Error('private runtime filename'), { code: 'ERR_MODULE_NOT_FOUND' });
  assert.equal(publicTtsFailure(missing).error.code, 'TTS_RUNTIME_MISSING');
  assert.doesNotMatch(JSON.stringify(publicTtsFailure(missing)), /private/);
});

const source = await readFile(new URL('../dashboard/src/lib/voice.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText;
let revision = 0;
async function setup(bridge) {
  let starts = 0, stops = 0, latest;
  class Context {
    state = 'running'; destination = {};
    async decodeAudioData() {return {duration:0.2,numberOfChannels:1};}
    createBufferSource() {
      latest = {onended:null,connect(){},disconnect(){},start(){starts++;},stop(){stops++;}};
      return latest;
    }
  }
  globalThis.window = {ultronVoice:bridge,AudioContext:Context,setTimeout,clearTimeout,speechSynthesis:{cancel(){}}};
  globalThis.AudioContext = Context;
  const module = await import(`data:text/javascript;base64,${Buffer.from(js + `\n// revision ${revision++}`).toString('base64')}`);
  return {module,get starts(){return starts;},get stops(){return stops;},end(){latest?.onended?.();}};
}
const audio = () => ({ok:true,audio:new Uint8Array(600),engine:'ultron-angry',mimeType:'audio/mpeg'});
test('speech preparation and playback are distinct; stop cancels playback', async () => {
  const env = await setup({synthesize:async()=>audio(),stopSpeech:async()=>true});
  const states = []; env.module.subscribeSpeechStatus(s=>states.push(s));
  const speaking = env.module.speak('Привет.');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(states.slice(-2),['preparing','playing']); assert.equal(env.starts,1);
  env.module.stopSpeaking(); await speaking; assert.equal(env.stops,1); assert.equal(states.at(-1),'idle');
});
test('a late response after cancellation never starts audio', async () => {
  let release;
  const env = await setup({synthesize:()=>new Promise(resolve=>{release=resolve;}),stopSpeech:async()=>true});
  const speaking = env.module.speak('Отмена.'); await new Promise(resolve=>setImmediate(resolve));
  env.module.stopSpeaking(); release(audio()); await speaking; assert.equal(env.starts,0);
});
test('new request waits for native cancellation acknowledgement', async () => {
  let release, calls=0;
  const env = await setup({stopSpeech:()=>new Promise(resolve=>{release=resolve;}),synthesize:async()=>{calls++;return audio();}});
  env.module.stopSpeaking();
  const speaking=env.module.speak('Готов.'); await Promise.resolve(); assert.equal(calls,0);
  release(true); await new Promise(resolve=>setImmediate(resolve)); assert.equal(calls,1); env.end(); await speaking;
});

test('stalled native stop fails closed instead of hanging or starting new speech', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const env = await setup({ stopSpeech: () => new Promise(() => {}), synthesize: async () => { calls++; return audio(); } });
  env.module.stopSpeaking();
  const pending = assert.rejects(env.module.speak('Проверка'), /TTS_STOP_TIMEOUT/);
  context.mock.timers.tick(8_001);
  await pending;
  assert.equal(calls, 0); assert.equal(env.starts, 0);
});

test('a lost synthesis IPC reply times out and a late reply cannot play', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let release;
  const env = await setup({ stopSpeech: async () => true, synthesize: () => new Promise(resolve => { release = resolve; }) });
  const pending = assert.rejects(env.module.speak('Проверка'), /TTS_SYNTHESIS_TIMEOUT/);
  await new Promise(resolve => setImmediate(resolve));
  context.mock.timers.tick(45_001); await pending;
  release(audio()); await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.starts, 0);
});

test('suspended audio device reports its stage instead of waiting forever', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const env = await setup({ stopSpeech: async () => true, synthesize: async () => audio() });
  globalThis.AudioContext = class extends globalThis.AudioContext { state = 'suspended'; resume() { return new Promise(() => {}); } };
  const pending = assert.rejects(env.module.speak('Проверка'), /TTS_OUTPUT_SUSPENDED/);
  await new Promise(resolve => setImmediate(resolve));
  context.mock.timers.tick(3_001); await pending;
  assert.equal(env.starts, 0);
});

test('missing playback end is failure, never a falsely successful spoken response', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const env = await setup({ stopSpeech: async () => true, synthesize: async () => audio() });
  const pending = assert.rejects(env.module.speak('Проверка'), /TTS_PLAYBACK_TIMEOUT/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.starts, 1);
  context.mock.timers.tick(2_201); await pending;
  assert.equal(env.stops, 1);
});
test('no silent SAPI fallback on failure or on a wrong voice', async () => {
  for (const reply of [{ok:false,error:{message:'Голос недоступен.'}},{...audio(),engine:'piper-denis-medium'}]) {
    const env=await setup({synthesize:async()=>reply,stopSpeech:async()=>true});
    await assert.rejects(env.module.speak('Привет.')); assert.equal(env.starts,0);
  }
  const env=await setup(undefined); assert.equal(env.module.isTTSSupported(),false);
  await assert.rejects(env.module.speak('Привет.'),/установленном приложении/);
});
test('text is split by words without silently dropping content', async () => {
  const env=await setup(undefined);
  const text=Array.from({length:60},()=> 'русское').join(' ');
  const chunks=env.module.speechChunks(text); assert.equal(chunks.join(' '),text);
  assert.ok(chunks.every(s=>s.length<=240));
  assert.throws(()=>env.module.speechChunks('x'.repeat(1201)),/1200/);
});
test('preview is a separate fixed-phrase call; renderer never passes arbitrary text', async () => {
  let generated=false;
  const env=await setup({previewSpeech:async()=>audio(),stopSpeech:async()=>true,synthesize:async()=>{generated=true;}});
  const playing=env.module.previewUltronVoice(); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(env.starts,1); assert.equal(generated,false); env.end(); await playing;
});

test('completed phrases keep the model warm; explicit Stop still reaches the host', async () => {
  let stopCalls = 0, generated = 0;
  const env = await setup({stopSpeech:async()=>{stopCalls++;return true;},synthesize:async()=>{generated++;return audio();}});
  for (const text of ['Первая фраза.', 'Следующая фраза.']) {
    const playing = env.module.speak(text); await new Promise(resolve=>setImmediate(resolve));
    env.end(); await playing;
  }
  assert.equal(generated,2); assert.equal(stopCalls,0);
  env.module.stopSpeaking(); await Promise.resolve(); assert.equal(stopCalls,1);
});

test('replacing an unfinished phrase waits for Stop and only plays the new reply', async () => {
  let first, stopDone, calls=0;
  const env = await setup({
    stopSpeech:()=>new Promise(resolve=>{stopDone=resolve;}),
    synthesize:()=>++calls===1 ? new Promise(resolve=>{first=resolve;}) : Promise.resolve(audio()),
  });
  const old = env.module.speak('Старое.'); await new Promise(resolve=>setImmediate(resolve));
  const next = env.module.speak('Новое.'); await Promise.resolve(); assert.equal(calls,1);
  first(audio()); await old; assert.equal(env.starts,0);
  stopDone(true); await new Promise(resolve=>setImmediate(resolve)); assert.equal(env.starts,1);
  env.end(); await next;
});
