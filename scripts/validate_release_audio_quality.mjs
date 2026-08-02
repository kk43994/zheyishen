import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const target = resolve(ROOT, process.argv[2] ?? 'dist');
const ffprobe = process.env.FFPROBE_BIN || 'ffprobe';
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
const expectedCounts = { music: 11, ambience: 9 };
// 分组地板：环境床 96k 直编；配乐被平台 8,388,608 字节硬限压到 64k
// （96k 时 11 首 3.28MB，整包 8,846,263 实测必 413）。60k 地板仍能拦住
// 「误把配乐当旁白转 24k」那类事故。
const minimumBitRateByGroup = { music: 60_000, ambience: 90_000 };
const seamSampleRate = 22_050;
const seamLeadSeconds = 0.18;

async function sha256(file) {
  const contents = await readFile(file);
  return createHash('sha256').update(contents).digest('hex');
}

async function mp3Files(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mp3'))
    .map((entry) => join(directory, entry.name))
    .sort();
}

function probe(file) {
  let output;
  try {
    output = execFileSync(ffprobe, [
      '-v', 'error',
      '-show_entries', 'stream=codec_name,sample_rate,channels,bit_rate:format=bit_rate',
      '-of', 'json',
      file,
    ], { encoding: 'utf8' });
  } catch (error) {
    throw new Error(`ffprobe failed for ${relative(ROOT, file)}: ${error.message}`);
  }
  const result = JSON.parse(output);
  const stream = result.streams?.[0];
  if (!stream) throw new Error(`no audio stream found in ${relative(ROOT, file)}`);
  return {
    codec: stream.codec_name,
    sampleRate: Number(stream.sample_rate),
    channels: Number(stream.channels),
    bitRate: Number(stream.bit_rate ?? result.format?.bit_rate),
  };
}

function decodeMono(file) {
  try {
    const output = execFileSync(ffmpeg, [
      '-v', 'error', '-i', file,
      '-f', 'f32le', '-acodec', 'pcm_f32le',
      '-ac', '1', '-ar', String(seamSampleRate), '-',
    ], { encoding: null, maxBuffer: 16 * 1024 * 1024 });
    return new Float32Array(output.buffer, output.byteOffset, output.byteLength / 4);
  } catch (error) {
    throw new Error(`ffmpeg decode failed for ${relative(ROOT, file)}: ${error.message}`);
  }
}

function seamMetric(file, loopEnd, loopStart, overlap) {
  const samples = decodeMono(file);
  const jumpIndex = Math.round((loopEnd - seamLeadSeconds) * seamSampleRate);
  const resumeIndex = Math.round(
    (loopStart + overlap - seamLeadSeconds) * seamSampleRate,
  );
  const window = Math.round(0.1 * seamSampleRate);
  if (jumpIndex <= window || jumpIndex >= samples.length || resumeIndex + window >= samples.length) {
    throw new Error(`cannot sample loop seam in ${relative(ROOT, file)}`);
  }

  const naturalDeltas = [];
  for (const [start, end] of [
    [jumpIndex - window, jumpIndex],
    [resumeIndex, resumeIndex + window],
  ]) {
    for (let index = start + 1; index < end; index += 1) {
      naturalDeltas.push(Math.abs(samples[index] - samples[index - 1]));
    }
  }
  naturalDeltas.sort((a, b) => a - b);
  const naturalP99 = naturalDeltas[Math.floor((naturalDeltas.length - 1) * 0.99)] ?? 0;
  const discontinuity = Math.abs(samples[jumpIndex - 1] - samples[resumeIndex]);
  const ratioToNaturalP99 = discontinuity / Math.max(naturalP99, 1e-9);
  if (discontinuity > 0.01 || ratioToNaturalP99 > 0.75) {
    throw new Error(
      `${relative(ROOT, file)} loop patrol discontinuity is too large: `
      + `${discontinuity.toFixed(6)} (${ratioToNaturalP99.toFixed(2)}x local p99)`,
    );
  }
  return {
    discontinuity: Number(discontinuity.toFixed(6)),
    ratioToNaturalP99: Number(ratioToNaturalP99.toFixed(3)),
  };
}

const report = { target: relative(ROOT, target) || '.', groups: {}, seams: {}, bytes: 0 };

for (const [group, expectedCount] of Object.entries(expectedCounts)) {
  const releaseDirectory = resolve(target, 'assets/audio', group);
  const sourceDirectory = resolve(ROOT, 'public/assets/audio', group);
  const files = await mp3Files(releaseDirectory);
  if (files.length !== expectedCount) {
    throw new Error(`expected ${expectedCount} release ${group} MP3s, received ${files.length}`);
  }

  let bytes = 0;
  let minimumObservedBitRate = Number.POSITIVE_INFINITY;
  let maximumObservedBitRate = 0;
  for (const releaseFile of files) {
    const sourceFile = join(sourceDirectory, releaseFile.slice(releaseDirectory.length + 1));
    const [releaseHash, sourceHash, releaseStat] = await Promise.all([
      sha256(releaseFile),
      sha256(sourceFile),
      stat(releaseFile),
    ]);
    if (releaseHash !== sourceHash) {
      throw new Error(
        `${relative(ROOT, releaseFile)} differs from its single-generation public master; `
        + 'the release pipeline must not transcode music or ambience again',
      );
    }

    const audio = probe(releaseFile);
    if (audio.codec !== 'mp3' || audio.sampleRate !== 22_050 || audio.channels !== 1) {
      throw new Error(
        `${relative(ROOT, releaseFile)} must be mono 22.05 kHz MP3; received `
        + `${audio.codec}/${audio.sampleRate} Hz/${audio.channels} channels`,
      );
    }
    const groupFloor = minimumBitRateByGroup[group];
    if (!Number.isFinite(audio.bitRate) || audio.bitRate < groupFloor) {
      throw new Error(
        `${relative(ROOT, releaseFile)} bitrate ${audio.bitRate || 'unknown'} is below `
        + `${groupFloor}; possible accidental low-bitrate re-encode`,
      );
    }

    bytes += releaseStat.size;
    minimumObservedBitRate = Math.min(minimumObservedBitRate, audio.bitRate);
    maximumObservedBitRate = Math.max(maximumObservedBitRate, audio.bitRate);
  }

  report.groups[group] = {
    files: files.length,
    bytes,
    minimumBitRate: minimumObservedBitRate,
    maximumBitRate: maximumObservedBitRate,
    sourceIdentical: true,
  };
  report.bytes += bytes;
}

for (const file of await mp3Files(resolve(target, 'assets/audio/ambience'))) {
  report.seams[`ambience/${basename(file)}`] = seamMetric(
    file,
    8,
    0.02,
    0.8,
  );
}
report.seams['music/pressure.mp3'] = seamMetric(
  resolve(target, 'assets/audio/music/pressure.mp3'),
  18,
  0.02,
  1,
);

console.log(JSON.stringify({
  valid: true,
  contract: 'single-generation-mono-22050hz-mp3-music>=60k-ambience>=90k-and-bounded-loop-seams',
  ...report,
}, null, 2));
