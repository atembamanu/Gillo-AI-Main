import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { uploadObject } from '../storage/minio';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export interface ProcessedAudioResult {
  proxyKey: string;
  archiveKey: string;
  durationSeconds: number;
  waveformJson: number[];
}

function buildKeys(userId: string, bucketId: string, extProxy: string, extArchive: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const baseName = `${Date.now()}`;
  const basePath = `${userId}/${bucketId}/${y}-${m}-${d}/${baseName}`;
  return {
    proxyKey: `${basePath}-proxy.${extProxy}`,
    archiveKey: `${basePath}-master.${extArchive}`,
  };
}

/** Duration from our WAV: 16 kHz, 1 ch, 16-bit → 32000 bytes/sec. Avoids ffprobe. */
function getDurationSecondsFromWavBuffer(wavBuffer: Buffer): number {
  if (wavBuffer.length <= 44) return 0;
  return (wavBuffer.length - 44) / 32000;
}

async function generateWaveformPeaks(wavPath: string, buckets = 100): Promise<number[]> {
  const fs = await import('fs/promises');
  const buffer = await fs.readFile(wavPath);
  const data = new Int16Array(buffer.buffer, buffer.byteOffset + 44, Math.floor((buffer.byteLength - 44) / 2));
  if (data.length === 0) return [];
  const samplesPerBucket = Math.max(1, Math.floor(data.length / buckets));
  const peaks: number[] = [];
  for (let i = 0; i < buckets; i++) {
    const start = i * samplesPerBucket;
    if (start >= data.length) break;
    const end = Math.min(data.length, start + samplesPerBucket);
    let max = 0;
    for (let j = start; j < end; j++) {
      const v = Math.abs(data[j]);
      if (v > max) max = v;
    }
    peaks.push(max / 32768);
  }
  return peaks;
}

export async function processAndUploadAudio(
  userId: string,
  bucketId: string,
  originalBuffer: Buffer,
  originalMime: string
): Promise<ProcessedAudioResult> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const os = await import('os');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-'));
  const inputExt = (originalMime.split('/').pop() || 'webm').toLowerCase();
  const inputPath = path.join(tmpDir, `input.${inputExt}`);
  const wavPath = path.join(tmpDir, 'master.wav');
  const mp3Path = path.join(tmpDir, 'proxy.mp3');

  await fs.writeFile(inputPath, originalBuffer);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .audioChannels(1)
      .audioFrequency(16000)
      .format('wav')
      .on('error', reject)
      .on('end', () => resolve())
      .save(wavPath);
  });

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .audioBitrate(128)
      .format('mp3')
      .on('error', reject)
      .on('end', () => resolve())
      .save(mp3Path);
  });

  const wavBuffer = await fs.readFile(wavPath);
  const durationSeconds = getDurationSecondsFromWavBuffer(wavBuffer);
  const waveformJson = await generateWaveformPeaks(wavPath);
  const mp3Buffer = await fs.readFile(mp3Path);

  const { proxyKey, archiveKey } = buildKeys(userId, bucketId, 'mp3', 'wav');
  await uploadObject(archiveKey, wavBuffer, 'audio/wav');
  await uploadObject(proxyKey, mp3Buffer, 'audio/mpeg');

  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  return {
    proxyKey,
    archiveKey,
    durationSeconds,
    waveformJson,
  };
}
