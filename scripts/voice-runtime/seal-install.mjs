// Run only after the dedicated runtime is copied and pip check succeeds.
// Does not install dependencies, download models or overwrite an existing seal.
import { lstat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readRuntimeConfig } from './runtime.mjs';

const [root, modelRoot] = process.argv.slice(2);
for (const value of [root, modelRoot]) {
  if (!value || !path.isAbsolute(value) || value.length < 20 || (await lstat(value)).isSymbolicLink())
    throw new Error('Exact non-symlink runtime/model directories required');
}
const config = {
  schema: 'ultron.offline-runtime.v1', profile: 'ultron-angry',
  python: path.join(root, 'venv', 'Scripts', 'python.exe'),
  ffmpeg: path.join(root, 'ffmpeg.exe'), sandboxHost: path.join(root, 'UltronVoiceSandbox.exe'),
  modelRoot, hashes: {},
};
for (const name of ['python', 'ffmpeg', 'sandboxHost']) {
  const stat = await lstat(config[name]);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 250_000_000) throw new Error('Invalid binary');
  config.hashes[name] = createHash('sha256').update(await readFile(config[name])).digest('hex');
}
const filename = path.join(root, 'runtime.json');
await writeFile(filename, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
await readRuntimeConfig(filename);
console.log(JSON.stringify({ ok: true, profile: config.profile, hashes: config.hashes }));
