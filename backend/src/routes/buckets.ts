import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db';
import { config } from '../config';

const bucketFieldSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(256).optional(),
  ai_description: z.string().max(2048).optional()
});

const createBucketBodySchema = z.object({
  name: z.string().min(1).max(128),
  fields: z.array(bucketFieldSchema).optional()
});

const updateBucketBodySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  fields: z.array(bucketFieldSchema).optional()
});

const generateAiDescriptionBodySchema = z.object({
  name: z.string().min(1).max(64),
  /** When provided, backend runs "enhance" mode (expand into deeper description with examples). Max 2048 for enhance. */
  description: z.string().max(2048).optional(),
  bucketName: z.string().max(128).optional()
});

export async function registerBucketRoutes(fastify: FastifyInstance) {
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

      const buckets = await query<{
        id: string;
        name: string;
        created_at: string;
        fields: unknown;
      }>('SELECT id, name, created_at, COALESCE(fields, \'[]\') AS fields FROM buckets WHERE user_id = $1 ORDER BY created_at ASC', [
        userId
      ]);

      return reply.send({
        buckets: buckets.map((b) => ({
          id: b.id,
          name: b.name,
          created_at: b.created_at,
          fields: Array.isArray(b.fields) ? b.fields : (typeof b.fields === 'string' ? JSON.parse(b.fields || '[]') : [])
        }))
      });
    }
  );

  fastify.post(
    '/',
    {
      preHandler: [fastify.authenticate]
    },
    async (request, reply) => {
      const userId = (request.user as any)?.sub as string | undefined;
      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const parse = createBucketBodySchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Invalid request body' });
      }

      const { name, fields = [] } = parse.data;
      const fieldsJson = JSON.stringify(fields);

      const rows = await query<{ id: string; name: string; created_at: string; fields: unknown }>(
        'INSERT INTO buckets (user_id, name, fields) VALUES ($1, $2, $3::jsonb) RETURNING id, name, created_at, fields',
        [userId, name, fieldsJson]
      );

      const bucket = rows[0];
      return reply.status(201).send({
        bucket: {
          id: bucket.id,
          name: bucket.name,
          created_at: bucket.created_at,
          fields: Array.isArray(bucket.fields) ? bucket.fields : (typeof bucket.fields === 'string' ? JSON.parse(bucket.fields || '[]') : [])
        }
      });
    }
  );

  fastify.patch(
    '/:id',
    {
      preHandler: [fastify.authenticate]
    },
    async (request, reply) => {
      const userId = (request.user as any)?.sub as string | undefined;
      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const bucketId = (request.params as any)?.id as string;
      if (!bucketId) {
        return reply.status(400).send({ error: 'Invalid bucket id' });
      }

      const parse = updateBucketBodySchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Invalid request body' });
      }

      const existing = await query<{ id: string; name: string; fields: unknown }>(
        'SELECT id, name, fields FROM buckets WHERE id = $1 AND user_id = $2',
        [bucketId, userId]
      );
      if (!existing[0]) {
        return reply.status(404).send({ error: 'Bucket not found' });
      }

      const { name, fields } = parse.data;
      const updates: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      if (name !== undefined) {
        updates.push(`name = $${i++}`);
        params.push(name);
      }
      if (fields !== undefined) {
        updates.push(`fields = $${i++}::jsonb`);
        params.push(JSON.stringify(fields));
      }
      if (updates.length === 0) {
        return reply.send({
          bucket: {
            id: existing[0].id,
            name: existing[0].name,
            fields: existing[0].fields ?? []
          }
        });
      }
      params.push(bucketId, userId);
      const whereId = i++;
      const whereUserId = i;
      const rows = await query<{ id: string; name: string; created_at: string; fields: unknown }>(
        `UPDATE buckets SET ${updates.join(', ')} WHERE id = $${whereId} AND user_id = $${whereUserId} RETURNING id, name, created_at, COALESCE(fields, '[]') AS fields`,
        params
      );
      const bucket = rows[0];
      return reply.send({
        bucket: {
          id: bucket.id,
          name: bucket.name,
          created_at: bucket.created_at,
          fields: Array.isArray(bucket.fields) ? bucket.fields : (typeof bucket.fields === 'string' ? JSON.parse(bucket.fields || '[]') : [])
        }
      });
    }
  );

  fastify.post(
    '/generate-ai-description',
    {
      preHandler: [fastify.authenticate]
    },
    async (request, reply) => {
      const parse = generateAiDescriptionBodySchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Invalid request body' });
      }
      const { name, description, bucketName } = parse.data;
      const hasUserText = (description?.trim() ?? '').length > 0;
      const context =
        bucketName?.trim()
          ? `Bucket: "${bucketName.trim()}". Field: "${name}".${hasUserText ? `\n\nUser's current description:\n${description!.trim()}` : ' Use the bucket name and field name to infer what this field should capture.'}`
          : `Field: "${name}".${hasUserText ? `\n\nUser's current description:\n${description!.trim()}` : ''}`;

      const prompt = hasUserText
        ? `You are helping define a field for structured data extraction from notes.

Context: ${context}

The user has written a description above. ENHANCE it into a clearer, slightly longer description (2-4 sentences) that:
- States what this specific field should contain.
- Gives 1-2 example values that ARE correct for this field.
- Gives one example of what to NOT put here (to avoid wrong mappings).
Use the bucket and field name for context. Keep the user's intent; expand and clarify. Reply with ONLY the enhanced description. No quotes, no "Description:", no preamble.`
        : `You are helping define a field for structured data extraction from notes.

Context: ${context}

Generate a SHORT "AI description" (2-4 sentences, max 300 chars) for THIS field only. The description will be used by an extraction model to fill this field from raw text.

Rules:
- Base the description on the BUCKET name (if given) and the FIELD name. Each field must get a DIFFERENT description that matches what that field actually means (e.g. "Date" = date/time of delivery; "Location" = address or place; "Driver" = person driving; "Client" = person receiving; "Products" = items being delivered). Do NOT reuse the same template (e.g. "driver's name") for every field.
- Say what this specific field should contain and give 1-2 example values that ARE correct for it, and one example of what to NOT put here.
- Reply with ONLY the AI description text. No quotes, no "AI description:", no preamble.`;

      try {
        const res = await fetch(`${config.ollamaUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: config.ollamaModel,
            prompt,
            stream: false
          })
        });
        if (!res.ok) {
          const body = await res.text();
          fastify.log.warn({ status: res.status, body }, 'Ollama generate-ai-description failed');
          return reply.status(502).send({ error: 'AI service unavailable' });
        }
        const data = (await res.json()) as { response?: string };
        const ai_description = (data?.response ?? '').trim().slice(0, 2048);
        return reply.send({ ai_description: ai_description || `Value for "${name}" from the text.` });
      } catch (err) {
        fastify.log.error(err, 'Ollama request error');
        return reply.status(502).send({ error: 'AI service unavailable' });
      }
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
      const bucketId = (request.params as any)?.id as string;
      if (!bucketId) {
        return reply.status(400).send({ error: 'Invalid bucket id' });
      }
      const existing = await query<{ id: string }>(
        'SELECT id FROM buckets WHERE id = $1 AND user_id = $2',
        [bucketId, userId]
      );
      if (!existing[0]) {
        return reply.status(404).send({ error: 'Bucket not found' });
      }
      await query('DELETE FROM buckets WHERE id = $1 AND user_id = $2', [bucketId, userId]);
      return reply.status(204).send();
    }
  );
}

