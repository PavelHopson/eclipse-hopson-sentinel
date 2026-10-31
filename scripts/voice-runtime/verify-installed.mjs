import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readRuntimeConfig } from './runtime.mjs';

const [installRoot,configFile]=process.argv.slice(2);
for (const value of [installRoot,configFile])
  if (!value || !path.isAbsolute(value) || value.length<20) throw new Error('Exact installed paths required');
const expectedVersion=JSON.parse(await readFile(new URL('../../dashboard/package.json',import.meta.url))).version;
assert.match(expectedVersion, /^\d+\.\d+\.\d+$/);
const report=new URL('../../reports/ultron-' + expectedVersion + '/',import.meta.url);
const audit=JSON.parse(await readFile(new URL('release-audit.json',report)));
const config=await readRuntimeConfig(configFile);
const hash=async filename=>createHash('sha256').update(await readFile(filename)).digest('hex');
assert.equal(await hash(path.join(installRoot,'Eclipse Ultron.exe')),audit.hashes.exe);
assert.equal(await hash(path.join(installRoot,'resources','app.asar')),audit.hashes.asar);
for (const name of ['runtime.mjs','supervisor.mjs','session.mjs','dsp.mjs','worker.py','guard.py','model-lock.json'])
  assert.equal(await hash(path.join(installRoot,'resources','voice-runtime',name)),await hash(new URL(name,import.meta.url)));
const require=createRequire(new URL('../../dashboard/package.json',import.meta.url));
const asar=require('@electron/asar');
const pkg=JSON.parse(asar.extractFile(path.join(installRoot,'resources','app.asar'),'package.json'));
assert.equal(pkg.version,expectedVersion);
const smoke=JSON.parse(await readFile(new URL('installed-smoke/voice-smoke.json',report)));
assert.equal(smoke.sha256,'52e7588c9353e9ab1db6460e1fb887c34947943bb789046b17990907efbb2a52');
const receipt={checkedAt:new Date().toISOString(),installed:true,version:pkg.version,profile:config.profile,
  hashes:audit.hashes,helpersMatch:true,nativeSmoke:smoke,microphoneUsed:false,gitPushed:false};
await writeFile(new URL('installation.json',report),JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt));
