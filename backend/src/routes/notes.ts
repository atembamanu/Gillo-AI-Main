import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db';
import { getObjectStream, uploadObject } from '../storage/minio';
import { enqueueProcessNoteJob } from '../queue';

const createTextNoteBodySchema = z.object({
  bucketId: z.string().uuid(),
  text: z.string().min(1)
});

const createAudioNoteBodySchema = z.object({
  bucketId: z.string().uuid(),
  audioUrl: z.string().min(1),
  rawKey: z.string().min(1).optional(),
  archiveUrl: z.string().optional(),
  durationSeconds: z.number().positive().optional(),
  waveformJson: z.array(z.number()).optional()
});

const updateStructuredBodySchema = z.object({
  structured: z.record(z.any())
});

export async function registerNoteRoutes(fastify: FastifyInstance) {
  async function getUserTimeZone(userId: string): Promise<string> {
    const users = await query<{ timezone: string | null }>('SELECT timezone FROM users WHERE id = $1', [userId]);
    return users[0]?.timezone || 'UTC';
  }

  fastify.get(
    '/',
    {
      preHandler: [fastify.authenticate]
    },
    async (request, reply) => {
      const userId = (request.user as any)?.sub as string | undefined;
      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      // Only filter by bucket when a valid bucketId is explicitly provided; otherwise return all user notes
      const bucketId = (request.query as any)?.bucketId;
      const filterByBucket = typeof bucketId === 'string' && bucketId.length > 0;

      if (filterByBucket) {
        const rows = await query<
          {
            id: string;
            bucket_id: string;
            original_text: string;
            structured_json: any;
            created_at: string;
            archived: boolean;
            category: string | null;
            audio_url: string | null;
          }
        >(
          'SELECT id, bucket_id, original_text, structured_json, created_at, archived, category, audio_url FROM notes WHERE user_id = $1 AND bucket_id = $2 ORDER BY created_at DESC',
          [userId, bucketId]
        );
        return reply.send({
          notes: rows.map((row) => ({
            id: row.id,
            bucketId: row.bucket_id,
            originalText: row.original_text,
            structured: row.structured_json ?? {},
            createdAt: row.created_at,
            archived: row.archived,
            category: (row.category as any) ?? 'text',
            audioUrl: row.audio_url ?? undefined
          }))
        });
      }

      const rows = await query<
        {
          id: string;
          bucket_id: string;
          original_text: string;
          structured_json: any;
          created_at: string;
          archived: boolean;
          category: string | null;
          audio_url: string | null;
        }
      >(
        'SELECT id, bucket_id, original_text, structured_json, created_at, archived, category, audio_url FROM notes WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      return reply.send({
        notes: rows.map((row) => ({
          id: row.id,
          bucketId: row.bucket_id,
          originalText: row.original_text,
          structured: row.structured_json ?? {},
          createdAt: row.created_at,
          archived: row.archived,
          category: (row.category as any) ?? 'text',
          audioUrl: row.audio_url ?? undefined
        }))
      });
    }
  );

  /** Build MinIO key for raw upload (worker will process later). */
  function buildRawKey(userId: string, bucketId: string, ext: string): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${userId}/${bucketId}/${y}-${m}-${d}/${Date.now()}-raw.${ext}`;
  }

  fastify.post(
    '/audio/upload',
    {
      preHandler: [fastify.authenticate]
    },
    async (request, reply) => {
      const userId = (request.user as any)?.sub as string | undefined;
      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const mp = await (request as any).file();
      if (!mp) {
        return reply.status(400).send({ error: 'Missing file' });
      }

      const buffer = await mp.toBuffer();
      const bucketId = ((request.query as any)?.bucketId as string) || 'no-bucket';
      const ext = (mp.mimetype?.split('/').pop() || 'webm').toLowerCase();
      const rawKey = buildRawKey(userId, bucketId, ext);

      await uploadObject(rawKey, buffer, mp.mimetype || 'audio/webm');

      const audioUrl = `/api/notes/audio/file/${encodeURIComponent(rawKey)}`;

      return reply.send({
        audioUrl,
        rawKey,
        archiveUrl: undefined,
        durationSeconds: undefined,
        waveformJson: undefined
      });
    }
  );

  fastify.get(
    '/audio/file/*',
    async (request, reply) => {
      const name = (request.params as any)['*'] as string;
      if (!name) {
        return reply.status(400).send({ error: 'Missing file name' });
      }
      const key = decodeURIComponent(name);
      const rangeHeader = (request.headers.range as string) || undefined;
      const result = await getObjectStream(key, rangeHeader);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Type', result.contentType ?? 'application/octet-stream');
      if (result.isPartial && result.contentRange) {
        reply.code(206);
        reply.header('Content-Range', result.contentRange);
        if (result.contentLength != null) reply.header('Content-Length', result.contentLength);
      } else if (result.contentLength != null) {
        reply.header('Content-Length', result.contentLength);
      }
      return reply.send(result.body);
    }
  );

  fastify.post(
    '/text',
    {
      preHandler: [fastify.authenticate]
    },
    async (request, reply) => {
      const userId = (request.user as any)?.sub as string | undefined;
      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const parse = createTextNoteBodySchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Invalid request body' });
      }

      const { bucketId, text } = parse.data;
      const referenceTimezone = await getUserTimeZone(userId);

      const buckets = await query<{ id: string; fields: unknown }>(
        'SELECT id, COALESCE(fields, \'[]\') AS fields FROM buckets WHERE id = $1 AND user_id = $2',
        [bucketId, userId]
      );
      if (!buckets[0]) {
        return reply.status(404).send({ error: 'Bucket not found' });
      }
      const bucketFields = Array.isArray(buckets[0].fields)
        ? (buckets[0].fields as { name: string; description?: string; ai_description?: string }[])
        : typeof buckets[0].fields === 'string'
          ? JSON.parse(buckets[0].fields || '[]') as { name: string; description?: string; ai_description?: string }[]
          : [];

      const rows = await query<{
        id: string;
        bucket_id: string;
        original_text: string;
        structured_json: any;
        created_at: string;
        archived: boolean;
        category: string | null;
        audio_url: string | null;
      }>(
        'INSERT INTO notes (user_id, bucket_id, original_text, category) VALUES ($1, $2, $3, $4) RETURNING id, bucket_id, original_text, structured_json, created_at, archived, category, audio_url',
        [userId, bucketId, text, 'text']
      );

      const note = rows[0];

      await enqueueProcessNoteJob({
        type: 'text',
        userId,
        bucketId,
        noteId: note.id,
        originalText: note.original_text,
        referenceDate: note.created_at,
        referenceTimezone,
        bucketFields: bucketFields.length > 0 ? bucketFields : undefined
      });

      return reply.status(201).send({
        note: {
          id: note.id,
          bucketId: note.bucket_id,
          originalText: note.original_text,
          structured: note.structured_json ?? {},
          createdAt: note.created_at,
          archived: note.archived,
          category: (note as any).category ?? 'text',
          audioUrl: (note as any).audio_url ?? undefined
        }
      });
    }
  );

  fastify.post(
    '/audio',
    {
      preHandler: [fastify.authenticate]
    },
    async (request, reply) => {
      const userId = (request.user as any)?.sub as string | undefined;
      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const parse = createAudioNoteBodySchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Invalid request body' });
      }

      const { bucketId, audioUrl, rawKey, archiveUrl, durationSeconds, waveformJson } = parse.data;
      const referenceTimezone = await getUserTimeZone(userId);

      const buckets = await query<{ id: string }>(
        'SELECT id FROM buckets WHERE id = $1 AND user_id = $2',
        [bucketId, userId]
      );
      if (!buckets[0]) {
        return reply.status(404).send({ error: 'Bucket not found' });
      }

      const placeholderText = '[audio note – transcription pending]';

      const rows = await query<{
        id: string;
        bucket_id: string;
        original_text: string;
        structured_json: any;
        created_at: string;
        archived: boolean;
        category: string | null;
        audio_url: string | null;
        archive_url: string | null;
        duration_seconds: number | null;
        waveform_json: any;
      }>(
        'INSERT INTO notes (user_id, bucket_id, original_text, category, audio_url, archive_url, duration_seconds, waveform_json) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, bucket_id, original_text, structured_json, created_at, archived, category, audio_url, archive_url, duration_seconds, waveform_json',
        [
          userId,
          bucketId,
          placeholderText,
          'audio',
          audioUrl,
          rawKey ? null : (archiveUrl ?? null),
          rawKey ? null : (durationSeconds ?? null),
          rawKey ? null : (waveformJson ?? null)
        ]
      );

      const note = rows[0];

      await enqueueProcessNoteJob(
        rawKey
          ? { type: 'audio', userId, bucketId, noteId: note.id, rawKey, referenceTimezone }
          : { type: 'audio', userId, bucketId, noteId: note.id, audioUrl: archiveUrl ?? audioUrl, referenceTimezone }
      );

      return reply.status(201).send({
        note: {
          id: note.id,
          bucketId: note.bucket_id,
          originalText: note.original_text,
          structured: note.structured_json ?? {},
          createdAt: note.created_at,
          archived: note.archived,
          category: (note as any).category ?? 'audio',
          audioUrl: (note as any).audio_url ?? audioUrl
        }
      });
    }
  );

  fastify.patch(
    '/:id/structured',
    {
      preHandler: [fastify.authenticate]
    },
    async (request, reply) => {
      const userId = (request.user as any)?.sub as string | undefined;
      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const noteId = (request.params as any)?.id as string;
      if (!noteId) {
        return reply.status(400).send({ error: 'Invalid note id' });
      }

      const parse = updateStructuredBodySchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Invalid request body' });
      }

      const structured = parse.data.structured;

      const notes = await query<{
        id: string;
        user_id: string;
        bucket_id: string;
        original_text: string;
        structured_json: any;
        created_at: string;
        archived: boolean;
      }>('SELECT id, user_id, bucket_id, original_text, structured_json, created_at, archived FROM notes WHERE id = $1 AND user_id = $2', [
        noteId,
        userId
      ]);

      const note = notes[0];
      if (!note) {
        return reply.status(404).send({ error: 'Note not found' });
      }

      await query(
        'UPDATE notes SET structured_json = $1, updated_at = now() WHERE id = $2',
        [structured, noteId]
      );

      const previous = note.structured_json;

      await query(
        'INSERT INTO ai_interactions (user_id, bucket_id, input_text, llm_output, corrected_output, corrected_by_user) VALUES ($1, $2, $3, $4, $5, TRUE)',
        [
          userId,
          note.bucket_id,
          note.original_text,
          previous ?? null,
          structured
        ]
      );

      return reply.send({
        note: {
          id: note.id,
          bucketId: note.bucket_id,
          originalText: note.original_text,
          structured,
          createdAt: note.created_at,
          archived: note.archived
        }
      });
    }
  );

  fastify.post(
    '/:id/retry-mapping',
    {
      preHandler: [fastify.authenticate]
    },
    async (request, reply) => {
      const userId = (request.user as any)?.sub as string | undefined;
      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const noteId = (request.params as any)?.id as string;
      if (!noteId) {
        return reply.status(400).send({ error: 'Invalid note id' });
      }

      const notes = await query<{
        id: string;
        bucket_id: string;
        original_text: string;
        created_at: string;
      }>(
        'SELECT id, bucket_id, original_text, created_at FROM notes WHERE id = $1 AND user_id = $2',
        [noteId, userId]
      );
      const note = notes[0];
      if (!note) {
        return reply.status(404).send({ error: 'Note not found' });
      }

      const text = (note.original_text ?? '').trim();
      if (!text || text.toLowerCase().includes('transcription pending')) {
        return reply.status(409).send({ error: 'Note text is not ready for mapping yet' });
      }

      const buckets = await query<{ id: string; fields: unknown }>(
        'SELECT id, COALESCE(fields, \'[]\') AS fields FROM buckets WHERE id = $1 AND user_id = $2',
        [note.bucket_id, userId]
      );
      if (!buckets[0]) {
        return reply.status(404).send({ error: 'Bucket not found' });
      }
      const bucketFields = Array.isArray(buckets[0].fields)
        ? (buckets[0].fields as { name: string; description?: string; ai_description?: string }[])
        : typeof buckets[0].fields === 'string'
          ? JSON.parse(buckets[0].fields || '[]') as { name: string; description?: string; ai_description?: string }[]
          : [];

      const referenceTimezone = await getUserTimeZone(userId);

      await query(
        'UPDATE notes SET structured_json = NULL, updated_at = now() WHERE id = $1 AND user_id = $2',
        [noteId, userId]
      );

      await enqueueProcessNoteJob({
        type: 'text',
        userId,
        bucketId: note.bucket_id,
        noteId: note.id,
        originalText: text,
        referenceDate: note.created_at,
        referenceTimezone,
        bucketFields: bucketFields.length > 0 ? bucketFields : undefined
      });

      return reply.send({ ok: true });
    }
  );

  fastify.patch(
    '/:id/archive',
    {
      preHandler: [fastify.authenticate]
    },
    async (request, reply) => {
      const userId = (request.user as any)?.sub as string | undefined;
      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const noteId = (request.params as any)?.id as string;
      const bodySchema = z.object({ archived: z.boolean() });
      const parse = bodySchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Invalid request body' });
      }
      const { archived } = parse.data;
      const rows = await query<{
        id: string;
        bucket_id: string;
        original_text: string;
        structured_json: any;
        created_at: string;
        archived: boolean;
      }>(
        'UPDATE notes SET archived = $1, updated_at = now() WHERE id = $2 AND user_id = $3 RETURNING id, bucket_id, original_text, structured_json, created_at, archived',
        [archived, noteId, userId]
      );
      const note = rows[0];
      if (!note) {
        return reply.status(404).send({ error: 'Note not found' });
      }
      return reply.send({
        note: {
          id: note.id,
          bucketId: note.bucket_id,
          originalText: note.original_text,
          structured: note.structured_json ?? {},
          createdAt: note.created_at,
          archived: note.archived
        }
      });
    }
  );

  fastify.delete(
    '/:id',
    {
      preHandler: [fastify.authenticate]
    },
    async (request, reply) => {
      const userId = (request.user as any)?.sub as string | undefined;
      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const noteId = (request.params as any)?.id as string;
      if (!noteId) {
        return reply.status(400).send({ error: 'Invalid note id' });
      }
      const res = await query<{ id: string }>(
        'DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id',
        [noteId, userId]
      );
      if (!res[0]) {
        return reply.status(404).send({ error: 'Note not found' });
      }
      return reply.status(204).send();
    }
  );
}

