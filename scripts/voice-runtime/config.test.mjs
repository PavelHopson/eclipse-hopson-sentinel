import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readRuntimeConfig } from './runtime.mjs';
import { validateRequest } from './supervisor.mjs';

test('cancelled female profiles cannot cross the production boundary', () => {
  for (const profile of ['lilith','lilith-vivian','Serena','Vivian'])
    assert.throws(()=>validateRequest({profile,text:'Привет.'}),/invalid-request/);
});
test('runtime seal accepts only unchanged approved binary files', async () => {
  const root=await mkdtemp(path.join(tmpdir(),'ultron-config-test-'));
  try {
    const binary=path.join(root,'owned.exe'), filename=path.join(root,'runtime.json');
    await writeFile(binary,'test fixture, never executable');
    const digest=createHash('sha256').update('test fixture, never executable').digest('hex');
    const config={schema:'ultron.offline-runtime.v1',profile:'ultron-angry',python:binary,ffmpeg:binary,sandboxHost:binary,modelRoot:root,
      hashes:{python:digest,ffmpeg:digest,sandboxHost:digest}};
    await writeFile(filename,JSON.stringify(config));
    assert.equal((await readRuntimeConfig(filename)).profile,'ultron-angry');
    await writeFile(binary,'tampered');
    await assert.rejects(readRuntimeConfig(filename),/runtime-integrity/);
    await writeFile(filename,JSON.stringify({...config,python:'relative.exe'}));
    await assert.rejects(readRuntimeConfig(filename),/invalid-runtime-config/);
    await writeFile(filename,JSON.stringify({...config,profile:'lilith'}));
    await assert.rejects(readRuntimeConfig(filename),/invalid-runtime-config/);
    await writeFile(filename,'x'.repeat(8193));
    await assert.rejects(readRuntimeConfig(filename),/invalid-runtime-config/);
  } finally {await rm(root,{recursive:true,force:true});} // Only this test's mkdtemp directory.
});
