// Explicit local install smoke: fixed public phrase, no microphone or user data.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const [configFile, helperRoot, outputRoot] = process.argv.slice(2);
for (const value of [configFile, helperRoot, outputRoot])
  if (!value || !path.isAbsolute(value) || value.length < 20) throw new Error('Exact absolute paths required');
const { readRuntimeConfig, createUltronRuntime } = await import(pathToFileURL(path.join(helperRoot,'runtime.mjs')));
const config = await readRuntimeConfig(configFile);
const runtime = createUltronRuntime({config,modelLock:path.join(helperRoot,'model-lock.json'),onStage:stage=>console.log(JSON.stringify({stage}))});
const result = await runtime.synthesize('Я на связи. Скажи, что нужно сделать. Важные действия выполняю только после твоего подтверждения.');
await runtime.stop();
const receipt={...result,audio:undefined,sha256:createHash('sha256').update(result.audio).digest('hex'),microphone:false,cloud:false};
await mkdir(outputRoot,{recursive:true});
await writeFile(path.join(outputRoot,'voice-smoke.mp3'),result.audio,{flag:'wx'});
await writeFile(path.join(outputRoot,'voice-smoke.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
console.log(JSON.stringify(receipt));
