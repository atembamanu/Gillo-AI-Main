import { request } from './client';

export type StructuredData = Record<string, string | string[]>;

export type NoteCategory = 'text' | 'audio';

export interface Note {
  id: string;
  bucketId: string;
  originalText: string;
  structured: StructuredData;
  createdAt: string;
  archived: boolean;
  /** Optional category of the insight. Defaults to 'text' when missing. */
  category?: NoteCategory;
  /** Optional URL for audio playback when this is an audio insight. */
  audioUrl?: string;
}

/** Fetches all notes for the current user (all buckets). Use this for Home and Insights. */
export async function listAllNotes(): Promise<{ notes: Note[] }> {
  return request<{ notes: Note[] }>('/notes');
}

export async function listNotes(bucketId?: string): Promise<{ notes: Note[] }> {
  const qs = bucketId ? `?bucketId=${encodeURIComponent(bucketId)}` : '';
  return request<{ notes: Note[] }>(`/notes${qs}`);
}

export async function createTextNote(bucketId: string, text: string): Promise<{ note: Note }> {
  return request<{ note: Note }>('/notes/text', {
    method: 'POST',
    body: JSON.stringify({ bucketId, text }),
  });
}

export interface UploadedAudioMeta {
  audioUrl: string;
  rawKey?: string;
  archiveUrl?: string;
  durationSeconds?: number;
  waveformJson?: number[];
}

export async function uploadAudio(bucketId: string, file: File): Promise<UploadedAudioMeta> {
  const form = new FormData();
  form.append('file', file);
  return request<UploadedAudioMeta>(`/notes/audio/upload?bucketId=${encodeURIComponent(bucketId)}`, {
    method: 'POST',
    body: form as any,
  });
}

export async function createAudioNote(
  bucketId: string,
  audioUrl: string,
  archiveUrl?: string,
  durationSeconds?: number,
  waveformJson?: number[],
  rawKey?: string,
): Promise<{ note: Note }> {
  return request<{ note: Note }>('/notes/audio', {
    method: 'POST',
    body: JSON.stringify({ bucketId, audioUrl, archiveUrl, durationSeconds, waveformJson, rawKey }),
  });
}

export async function updateStructured(
  noteId: string,
  structured: Record<string, unknown>
): Promise<{ note: Note }> {
  return request<{ note: Note }>(`/notes/${noteId}/structured`, {
    method: 'PATCH',
    body: JSON.stringify({ structured }),
  });
}

export async function archiveNote(
  noteId: string,
  archived: boolean
): Promise<{ note: Note }> {
  return request<{ note: Note }>(`/notes/${noteId}/archive`, {
    method: 'PATCH',
    body: JSON.stringify({ archived }),
  });
}

export async function deleteNote(noteId: string): Promise<void> {
  await request<unknown>(`/notes/${noteId}`, {
    method: 'DELETE',
  });
}
