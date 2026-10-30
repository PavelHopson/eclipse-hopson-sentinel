import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
if (process.platform !== 'win32') process.exit(0);
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'build', 'UltronOllamaHost.exe');
const temporary = path.join(root, 'build', 'compiler-temp');
await mkdir(temporary, { recursive: true });
const compiler = path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
await promisify(execFile)(compiler, ['/nologo', '/target:winexe', '/platform:x64', '/optimize+',
  '/out:' + output, path.join(root, 'scripts', 'UltronOllamaHost.cs')], {
  windowsHide: true, shell: false, timeout: 30_000, maxBuffer: 32 * 1024,
  env: { ...process.env, TEMP: temporary, TMP: temporary },
});
console.log('Built GUI-subsystem UltronOllamaHost.exe (headless Ollama only).');
