import fetch from 'node-fetch';
import FormData from 'form-data';
import { config } from '../config';
import { query } from '../db';
import { getObjectBuffer } from '../storage/minio';
import { processAndUploadAudio } from '../audio/processor';
import { handleTextJob, TextJobPayload } from './textPipeline';

export interface AudioJobPayload {
  type: 'audio';
  userId: string;
  bucketId: string;
  noteId: string;
  /** When set, worker runs FFmpeg then Whisper. Otherwise Whisper only (legacy). */
  rawKey?: string;
  audioUrl?: string;
}

interface WhisperResponse {
  text?: string;
  transcription?: string;
  transcript?: string;
}

/** Run Whisper by POSTing the WAV file (multipart). More reliable than audio_url when worker and Whisper are in Docker. */
async function runWhisperWithFile(wavBuffer: Buffer): Promise<string> {
  const form = new FormData();
  form.append('audio_file', wavBuffer, { filename: 'audio.wav', contentType: 'audio/wav' });

  const url = `${config.whisperUrl}/asr?task=transcribe&output=json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: form.getHeaders(),
    body: form as any,
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[worker:audio] Whisper request failed', res.status, res.statusText, body);
    throw new Error(`Whisper failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as WhisperResponse;
  const text = data.text ?? (data as any).transcript ?? data.transcription ?? '';
  if (!text.trim()) {
    console.error('[worker:audio] Whisper returned empty transcript', JSON.stringify(data).slice(0, 300));
    throw new Error('Whisper returned empty transcript');
  }
  return text;
}

/** Run Whisper with audio_url (legacy path when we don't have the file in worker). */
async function runWhisperWithUrl(audioUrl: string): Promise<string> {
  const res = await fetch(`${config.whisperUrl}/asr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio_url: audioUrl,
      task: 'transcribe',
      output: 'json',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[worker:audio] Whisper URL request failed', res.status, res.statusText, body.slice(0, 200));
    throw new Error(`Whisper failed: ${res.status}`);
  }

  const data = (await res.json()) as WhisperResponse;
  const text = data.text ?? (data as any).transcript ?? data.transcription ?? '';
  if (!text.trim()) {
    console.error('[worker:audio] Whisper returned empty transcript');
    throw new Error('Whisper returned empty transcript');
  }
  return text;
}

export async function handleAudioJob(job: AudioJobPayload): Promise<void> {
  let transcript: string;

  if (job.rawKey) {
    console.log('[worker:audio] Processing raw upload:', job.rawKey);
    const rawBuffer = await getObjectBuffer(job.rawKey);
    const mime = job.rawKey.endsWith('.webm') ? 'audio/webm' : job.rawKey.endsWith('.mp3') ? 'audio/mpeg' : 'audio/webm';
    const result = await processAndUploadAudio(job.userId, job.bucketId, rawBuffer, mime);

    const publicPath = (key: string) =>
      config.publicApiUrl
        ? `${config.publicApiUrl}/notes/audio/file/${encodeURIComponent(key)}`
        : `/api/notes/audio/file/${encodeURIComponent(key)}`;
    await query(
      `UPDATE notes SET audio_url = $1, archive_url = $2, duration_seconds = $3, waveform_json = $4, updated_at = now() WHERE id = $5`,
      [
        publicPath(result.proxyKey),
        publicPath(result.archiveKey),
        result.durationSeconds,
        JSON.stringify(result.waveformJson),
        job.noteId,
      ]
    );

    const wavBuffer = await getObjectBuffer(result.archiveKey);
    transcript = await runWhisperWithFile(wavBuffer);
  } else if (job.audioUrl) {
    transcript = await runWhisperWithUrl(job.audioUrl);
  } else {
    throw new Error('[worker:audio] Job has neither rawKey nor audioUrl');
  }

  await query(
    'UPDATE notes SET original_text = $1, updated_at = now() WHERE id = $2',
    [transcript, job.noteId]
  );

  const textJob: TextJobPayload = {
    type: 'text',
    userId: job.userId,
    bucketId: job.bucketId,
    noteId: job.noteId,
    originalText: transcript
  };

  await handleTextJob(textJob);
}

