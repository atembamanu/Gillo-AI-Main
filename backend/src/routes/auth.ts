import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db';

const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const loginBodySchema = registerBodySchema;

const patchMeBodySchema = z.object({
  display_name: z.string().max(100).nullable().optional()
});

export async function registerAuthRoutes(fastify: FastifyInstance) {
  fastify.post('/register', async (request, reply) => {
    const parse = registerBodySchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid request body' });
    }

    const { email, password } = parse.data;

    const existing = await query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    if (existing[0]) {
      return reply.status(400).send({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const users = await query<{ id: string; email: string; display_name: string | null }>(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, display_name',
      [email, passwordHash]
    );
    const user = users[0];

    // Create a default bucket so the user can start immediately.
    await query('INSERT INTO buckets (user_id, name) VALUES ($1, $2)', [user.id, 'General']);

    const token = fastify.jwt.sign({ sub: user.id });
    return reply.send({ token, user: { id: user.id, email: user.email, display_name: user.display_name ?? null } });
  });

  fastify.post('/login', async (request, reply) => {
    const parse = loginBodySchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid request body' });
    }

    const { email, password } = parse.data;

    const users = await query<{ id: string; email: string; password_hash: string; display_name: string | null }>(
      'SELECT id, email, password_hash, display_name FROM users WHERE email = $1',
      [email]
    );
    const user = users[0];
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = fastify.jwt.sign({ sub: user.id });
    return reply.send({
      token,
      user: { id: user.id, email: user.email, display_name: user.display_name ?? null }
    });
  });

  fastify.get(
    '/me',
    {
      preHandler: [fastify.authenticate]
    },
    async (request, reply) => {
      const userId = (request.user as any)?.sub as string | undefined;
      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const users = await query<{ id: string; email: string; display_name: string | null }>(
        'SELECT id, email, display_name FROM users WHERE id = $1',
        [userId]
      );
      const user = users[0];
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send({ user: { id: user.id, email: user.email, display_name: user.display_name ?? null } });
    }
  );

  fastify.patch(
    '/me',
    {
      preHandler: [fastify.authenticate]
    },
    async (request, reply) => {
      const userId = (request.user as any)?.sub as string | undefined;
      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const parse = patchMeBodySchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Invalid request body' });
      }

      const { display_name } = parse.data;
      if (display_name !== undefined) {
        await query(
          'UPDATE users SET display_name = $1 WHERE id = $2',
          [display_name, userId]
        );
      }

      const users = await query<{ id: string; email: string; display_name: string | null }>(
        'SELECT id, email, display_name FROM users WHERE id = $1',
        [userId]
      );
      const user = users[0];
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send({ user: { id: user.id, email: user.email, display_name: user.display_name ?? null } });
    }
  );
}

