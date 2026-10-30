import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rmdir, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonicalRecording, evaluateRecording, localPath, parseRecordingOptions } from './voice-recorded-eval.mjs';

function wave(milliseconds = 500) {
  const data = Buffer.alloc(44 + milliseconds * 32);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(16000, 24); data.writeUInt32LE(32000, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(data.length - 44, 40);
  return data;
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-recording-test-'));
  const directories = [], files = [], links = [];
  const add = async (relative, content) => {
    const filename = path.join(root, relative);
    const pieces = path.relative(root, path.dirname(filename)).split(path.sep).filter(Boolean);
    let current = root;
    for (const part of pieces) {
      current = path.join(current, part);
      if (!directories.includes(current)) { await mkdir(current); directories.push(current); }
    }
    await writeFile(filename, content, { flag: 'wx' }); files.push(filename);
    return filename;
  };
  t.after(async () => {
    for (const link of links) await unlink(link);
    for (const file of files) await unlink(file);
    for (const directory of directories.reverse()) await rmdir(directory);
    await rmdir(root);
  });
  const input = await add('phrase.wav', wave());
  await add('whisper/Release/whisper-cli.exe', 'TEST_ONLY_NOT_EXECUTABLE');
  await add('models/whisper/ggml-large-v3-turbo-q5_0.bin', 'TEST_ONLY_NOT_MODEL');
  const alias = async () => {
    const link = path.join(root, 'linked-recordings');
    await symlink(root, link, process.platform === 'win32' ? 'junction' : 'dir');
    links.push(link);
    return path.join(link, 'phrase.wav');
  };
  return { root, input, add, alias, options: { mode: 'run', caseId: 'ru-01', input, runtimeRoot: root } };
}

test('recorded evaluation is inert by default and requires explicit local consent', () => {
  assert.deepEqual(parseRecordingOptions([]), { mode: 'dry-run' });
  const input = path.resolve('recording.wav'), runtime = path.resolve('runtime');
  assert.equal(parseRecordingOptions(['--check', '--case', 'ru-01', '--input', input]).mode, 'check');
  assert.throws(() => parseRecordingOptions(['--run', '--case', 'ru-01', '--input', input, '--runtime-root', runtime]), /INVALID_ARGUMENTS/);
  assert.equal(parseRecordingOptions(['--run', '--case', 'ru-01', '--input', input, '--runtime-root', runtime, '--allow-local-transcription']).mode, 'run');
  assert.throws(() => parseRecordingOptions(['--check', '--case', 'unknown', '--input', input]), /UNKNOWN_CASE/);
});

test('URLs, UNC, device paths, traversal and ADS cannot be inputs', () => {
  for (const value of ['relative.wav', 'https://example.invalid/a.wav', '//server/share.wav', '\\\\server\\share.wav',
    '\\\\?\\C:\\voice.wav', path.join(path.parse(path.resolve('.')).root, 'recording.wav') + ':hidden',
    path.parse(path.resolve('.')).root + 'folder/../voice.wav', path.resolve('voice.wav') + '\n']) {
    assert.throws(() => localPath(value), /LOCAL_PATH_REQUIRED/);
  }
});

test('WAV parser validates actual format rather than trusting RIFF and filename', () => {
  const valid = wave();
  const result = canonicalRecording(valid);
  assert.deepEqual(result.canonical, valid);
  assert.equal(result.evidence.durationMs, 500);
  for (const [offset, value, size] of [[20, 3, 2], [22, 2, 2], [24, 48000, 4], [28, 96000, 4], [32, 4, 2], [34, 32, 2]]) {
    const invalid = Buffer.from(valid);
    invalid[size === 2 ? 'writeUInt16LE' : 'writeUInt32LE'](value, offset);
    assert.throws(() => canonicalRecording(invalid), /PCM16_MONO_16K_REQUIRED/);
  }
});

test('WAV duration, truncation and oversized chunks fail closed', () => {
  for (const invalid of [Buffer.alloc(0), wave(100), wave(30001), wave().subarray(0, 100), Buffer.alloc(2 * 1024 * 1024 + 1)]) {
    assert.throws(() => canonicalRecording(invalid));
  }
  const overflow = wave(); overflow.writeUInt32LE(0xffffffff, 40);
  assert.throws(() => canonicalRecording(overflow), /INVALID_WAV/);
});

test('untrusted metadata is stripped from the native input', () => {
  const valid = wave();
  const payload = Buffer.from('PRIVATE_METADATA', 'utf8');
  const metadata = Buffer.alloc(8 + payload.length);
  metadata.write('LIST'); metadata.writeUInt32LE(payload.length, 4); payload.copy(metadata, 8);
  const withMetadata = Buffer.concat([valid, metadata]); withMetadata.writeUInt32LE(withMetadata.length - 8, 4);
  const result = canonicalRecording(withMetadata);
  assert.deepEqual(result.canonical, valid);
  assert.notEqual(result.evidence.sourceSha256, result.evidence.canonicalSha256);
  assert.doesNotMatch(JSON.stringify(result.evidence), /PRIVATE_METADATA/);
});

test('duplicate or missing format/audio chunks cannot disguise a WAV', () => {
  const valid = wave();
  for (const chunk of [valid.subarray(12, 36), valid.subarray(36)]) {
    const duplicated = Buffer.concat([valid, chunk]); duplicated.writeUInt32LE(duplicated.length - 8, 4);
    assert.throws(() => canonicalRecording(duplicated), /INVALID_WAV/);
  }
  for (const offset of [12, 36]) {
    const missing = Buffer.from(valid); missing.write('JUNK', offset);
    assert.throws(() => canonicalRecording(missing), /INVALID_WAV/);
  }
});

test('directory symlinks and Windows junctions are rejected before native execution', async (t) => {
  const { options, alias } = await fixture(t);
  const input = await alias();
  await assert.rejects(evaluateRecording({ ...options, input }, { transcribe: () => assert.fail('must not run') }), /LINK_NOT_ALLOWED/);
});

test('check-only validates audio without calling any runtime', async (t) => {
  const { options } = await fixture(t);
  const result = await evaluateRecording({ ...options, mode: 'check', runtimeRoot: undefined }, { transcribe: () => assert.fail('must not run') });
  assert.equal(result.status, 'audio-validated');
  assert.equal(result.modelExecuted, false);
});

test('valid recording uses bounded local argv, preserves source and cleans temporary input', async (t) => {
  const { root, input, options } = await fixture(t);
  const original = await readFile(input);
  let temporary;
  const result = await evaluateRecording(options, { transcribe: async (executable, args, settings) => {
    assert.equal(executable, path.join(root, 'whisper', 'Release', 'whisper-cli.exe'));
    assert.equal(settings.shell, false); assert.equal(settings.windowsHide, true); assert.equal(settings.timeout, 60000);
    assert.equal(settings.maxBuffer, 65536);
    assert.deepEqual(args.slice(-5), ['-l', 'ru', '-nt', '-np', '-nf']);
    assert.ok(!path.isAbsolute(args[1]));
    assert.ok(Object.keys(settings.env).every((key) => ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'LOCALAPPDATA', 'APPDATA'].includes(key)));
    temporary = args[3]; assert.notEqual(temporary, input);
    assert.deepEqual(await readFile(temporary), original);
    return 'Не открывай YouTube.';
  } });
  assert.deepEqual(await readFile(input), original);
  await assert.rejects(readFile(temporary), { code: 'ENOENT' });
  assert.equal(result.wer, 0); assert.equal(result.promotionAllowed, false);
  assert.equal(result.recording.humanProvenanceVerified, false);
  assert.equal(result.recording.evidence.sourceSha256, createHash('sha256').update(original).digest('hex'));
  assert.equal(result.recording.runtime.model.sha256, createHash('sha256').update('TEST_ONLY_NOT_MODEL').digest('hex'));
  assert.equal(result.recording.runtime.executable.sha256, createHash('sha256').update('TEST_ONLY_NOT_EXECUTABLE').digest('hex'));
  assert.equal(result.recording.runtime.nativeRuntimeAudited, false);
  assert.doesNotMatch(JSON.stringify(result), /Не открывай|phrase\.wav|sentinel-recording-test/);
});

test('an empty native model is rejected before execution and never replaced or downloaded', async (t) => {
  const { root, options } = await fixture(t);
  const model = path.join(root, 'models', 'whisper', 'ggml-large-v3-turbo-q5_0.bin');
  await writeFile(model, '');
  await assert.rejects(evaluateRecording(options, { transcribe: () => assert.fail('must not run') }), /RUNTIME_SIZE_LIMIT/);
  assert.equal((await readFile(model)).length, 0);
});

test('failed transcription deletes only the run-owned temporary file', async (t) => {
  const { input, options } = await fixture(t);
  let temporary;
  await assert.rejects(evaluateRecording(options, { transcribe: async (_exe, args) => {
    temporary = args[3]; throw new Error('LOCAL_TRANSCRIPTION_FAILED');
  } }), /LOCAL_TRANSCRIPTION_FAILED/);
  await assert.rejects(readFile(temporary), { code: 'ENOENT' });
  assert.deepEqual(await readFile(input), wave());
});

test('cancellation before and during recognition cannot produce a success report', async (t) => {
  const { options } = await fixture(t);
  const pre = new AbortController(); pre.abort();
  await assert.rejects(evaluateRecording(options, { signal: pre.signal, transcribe: () => assert.fail('must not run') }), /CANCELLED/);
  const running = new AbortController(); let temporary;
  await assert.rejects(evaluateRecording(options, { signal: running.signal, transcribe: async (_exe, args) => {
    temporary = args[3]; running.abort(); return 'Не открывай YouTube.';
  } }), /CANCELLED/);
  await assert.rejects(readFile(temporary), { code: 'ENOENT' });
});

test('invalid audio and excessive transcript cannot be turned into a partial result', async (t) => {
  const { options, add } = await fixture(t);
  const invalid = await add('invalid.wav', 'PRIVATE_TEXT_NOT_AUDIO');
  await assert.rejects(evaluateRecording({ ...options, input: invalid }, { transcribe: () => assert.fail('must not run') }), /INVALID_WAV/);
  let temporary;
  await assert.rejects(evaluateRecording(options, { transcribe: async (_exe, args) => { temporary = args[3]; return 'x'.repeat(1001); } }), /INVALID_TRANSCRIPT/);
  await assert.rejects(readFile(temporary), { code: 'ENOENT' });
});

test('CLI dry-run reveals only public test phrases; errors do not echo private paths', () => {
  const script = fileURLToPath(new URL('./voice-recorded-eval.mjs', import.meta.url));
  const result = JSON.parse(execFileSync(process.execPath, [script], { encoding: 'utf8', windowsHide: true, timeout: 5000 }));
  assert.equal(result.modelExecuted, false); assert.equal(result.starterCases.length, 3);
  assert.throws(() => execFileSync(process.execPath, [script, '--check', '--case', 'ru-01', '--input', 'PRIVATE_INPUT_MARKER'],
    { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: 'pipe' }), (error) => {
    assert.equal(error.status, 1); assert.doesNotMatch(error.stderr + error.stdout, /PRIVATE_INPUT_MARKER/); return true;
  });
});
