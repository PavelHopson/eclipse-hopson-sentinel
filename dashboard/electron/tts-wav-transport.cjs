const { randomUUID } = require('crypto');
const { mkdir, open, readdir, stat, unlink } = require('fs/promises');
const path = require('path');

const TTS_FILE_PREFIX = 'ultron-tts-';
const TTS_FILE_PATTERN = /^ultron-tts-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.wav$/i;
const STALE_TTS_MAX_AGE_MS = 10 * 60 * 1_000;

function createEphemeralTtsPath(runtimeRoot) {
  const directory = path.resolve(runtimeRoot, 'temp', 'tts');
  const filePath = path.join(directory, `${TTS_FILE_PREFIX}${randomUUID()}.wav`);
  if (path.dirname(filePath) !== directory) {
    throw new Error('TTS temporary path escaped its runtime directory');
  }
  return { directory, filePath };
}

function isValidPcmWav(wav) {
  if (!Buffer.isBuffer(wav) || wav.length <= 44) return false;
  if (wav.subarray(0, 4).toString('ascii') !== 'RIFF') return false;
  if (wav.subarray(8, 12).toString('ascii') !== 'WAVE') return false;
  if (wav.subarray(36, 40).toString('ascii') !== 'data') return false;
  return wav.readUInt32LE(4) + 8 === wav.length
    && wav.readUInt32LE(40) + 44 === wav.length;
}

async function readBoundedPcmWav(filePath, byteLimit) {
  const handle = await open(filePath, 'r');
  try {
    const file = await handle.stat();
    if (!file.isFile() || file.size <= 44 || file.size > byteLimit) return null;
    const wav = Buffer.alloc(file.size);
    const { bytesRead } = await handle.read(wav, 0, wav.length, 0);
    const eofProbe = Buffer.alloc(1);
    const { bytesRead: bytesAfterDeclaredFile } = await handle.read(eofProbe, 0, 1, wav.length);
    if (bytesRead !== wav.length || bytesAfterDeclaredFile !== 0) return null;
    return isValidPcmWav(wav) ? wav : null;
  } finally {
    await handle.close();
  }
}

async function removeEphemeralTtsFile(filePath) {
  for (const delayMs of [0, 25, 100, 250, 500]) {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      await unlink(filePath);
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return true;
      if (error?.code !== 'EBUSY' && error?.code !== 'EPERM') return false;
    }
  }
  return false;
}

async function pruneStaleTtsFiles(directory, nowMs = Date.now()) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  await Promise.all(entries
    .filter((entry) => entry.isFile() && TTS_FILE_PATTERN.test(entry.name))
    .map(async (entry) => {
      const filePath = path.join(directory, entry.name);
      try {
        const file = await stat(filePath);
        if (nowMs - file.mtimeMs <= STALE_TTS_MAX_AGE_MS) return false;
        return removeEphemeralTtsFile(filePath);
      } catch (error) {
        if (error?.code === 'ENOENT') return true;
        return false;
      }
    }));
}

async function prepareEphemeralTtsFile(runtimeRoot) {
  const output = createEphemeralTtsPath(runtimeRoot);
  await mkdir(output.directory, { recursive: true });
  return output;
}

module.exports = {
  createEphemeralTtsPath,
  isValidPcmWav,
  prepareEphemeralTtsFile,
  pruneStaleTtsFiles,
  readBoundedPcmWav,
  removeEphemeralTtsFile,
};
