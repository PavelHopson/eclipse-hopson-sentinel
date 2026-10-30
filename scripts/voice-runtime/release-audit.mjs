import { readFile, writeFile, mkdir, readdir, lstat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const execute = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const dashboard = path.join(root, 'dashboard');
const eclipseProgramsRoot = 'E:\\ADMIN_HOPSON_PC\\Программы\\Eclipse AI Runtime';
const npmCache = path.join(eclipseProgramsRoot, 'cache', 'npm');
const expectedVersion = JSON.parse(await readFile(path.join(dashboard, 'package.json'))).version;
assert.match(expectedVersion, /^\d+\.\d+\.\d+$/);
const report = path.join(root, 'reports', 'ultron-' + expectedVersion);
await mkdir(report, {recursive:true});
const npmCli = path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
const env = {
  SYSTEMROOT:process.env.SYSTEMROOT,
  PATH:process.env.PATH,
  TEMP:process.env.TEMP,
  APPDATA:process.env.APPDATA,
  LOCALAPPDATA:process.env.LOCALAPPDATA,
  NPM_CONFIG_CACHE:npmCache,
};
const options = {cwd:dashboard,windowsHide:true,timeout:60000,maxBuffer:4_000_000,env};
const sbom = JSON.parse((await execute(process.execPath,[npmCli,'sbom','--omit=dev','--sbom-format','cyclonedx'],options)).stdout);
await writeFile(path.join(report,'dashboard-sbom.cdx.json'),JSON.stringify(sbom,null,2));
const audit = JSON.parse((await execute(process.execPath,[npmCli,'audit','--json'],options)).stdout);
await writeFile(path.join(report,'dashboard-audit.json'),JSON.stringify(audit,null,2));
const require = createRequire(path.join(dashboard,'package.json'));
const asar = require('@electron/asar');
const archive = path.join(dashboard,'release','win-unpacked','resources','app.asar');
for (const name of ['electron/main.cjs','electron/preload.cjs','electron/primary-voice-runtime.cjs','dist/index.html'])
  assert.deepEqual(asar.extractFile(archive,name),await readFile(path.join(dashboard,name)));
for (const name of await readdir(path.join(dashboard,'dist'),{recursive:true})) {
  const filename=path.join(dashboard,'dist',name);
  if ((await lstat(filename)).isFile())
    assert.deepEqual(asar.extractFile(archive,path.join('dist',name)),await readFile(filename));
}
const pkg = JSON.parse(asar.extractFile(archive,'package.json').toString());
assert.equal(pkg.version,expectedVersion);
const helpers = ['runtime.mjs','supervisor.mjs','session.mjs','dsp.mjs','piper-runtime.mjs','worker.py','guard.py','model-lock.json'];
for (const name of helpers)
  assert.deepEqual(await readFile(path.join(dashboard,'release','win-unpacked','resources','voice-runtime',name)),await readFile(path.join(root,'scripts','voice-runtime',name)));
const hashes = {};
for (const [name, filename] of Object.entries({
  installer:path.join(dashboard,'release','Eclipse-Ultron-' + expectedVersion + '-Setup.exe'),
  exe:path.join(dashboard,'release','win-unpacked','Eclipse Ultron.exe'),asar:archive,
  preview:path.join(dashboard,'release','win-unpacked','resources','voice-runtime','ultron-approved.mp3'),
})) hashes[name]=createHash('sha256').update(await readFile(filename)).digest('hex');
assert.equal(hashes.preview,'0f1c326cd86caa874ea50223b29a787e8f6c10392720adc9f696449016f0fecb');
const receipt={version:pkg.version,hashes,packageSourceMatches:true,helpersSourceMatch:true,components:sbom.components.length,vulnerabilities:audit.metadata.vulnerabilities};
await writeFile(path.join(report,'release-audit.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt));
