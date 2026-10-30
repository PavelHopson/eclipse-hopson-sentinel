import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { terminateOwnedProcessTree } = require('../dashboard/electron/owned-process.cjs');

test('Windows voice cleanup kills only the exact owned PID tree without a shell', async () => {
  const calls = [];
  const child = { pid: 4242, kill() { throw new Error('direct kill must not be needed'); } };
  const spawnProcess = (...args) => {
    calls.push(args);
    const killer = new EventEmitter();
    killer.kill = () => true;
    queueMicrotask(() => killer.emit('close', 0));
    return killer;
  };

  assert.equal(await terminateOwnedProcessTree(child, {
    platform: 'win32', systemRoot: 'C:\\Windows', spawnProcess, timeoutMs: 500,
  }), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'C:\\Windows\\System32\\taskkill.exe');
  assert.deepEqual(calls[0][1], ['/PID', '4242', '/T', '/F']);
  assert.equal(calls[0][2].shell, false);
  assert.equal(calls[0][2].windowsHide, true);
  assert.equal(calls[0][2].stdio, 'ignore');
});

test('invalid PID fails closed without starting taskkill', async () => {
  let spawned = false;
  const result = await terminateOwnedProcessTree({ pid: -1, kill() {} }, {
    platform: 'win32', spawnProcess: () => { spawned = true; },
  });
  assert.equal(result, false);
  assert.equal(spawned, false);
});
