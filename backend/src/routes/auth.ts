import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma';

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

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });
    if (existing) {
      return reply.status(400).send({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true, displayName: true }
    });

    // Create a default bucket so the user can start immediately.
    await prisma.bucket.create({
      data: {
        userId: user.id,
        name: 'General'
      }
    });

    const token = fastify.jwt.sign({ sub: user.id });
    return reply.send({ token, user: { id: user.id, email: user.email, display_name: user.displayName ?? null } });
  });

  fastify.post('/login', async (request, reply) => {
    const parse = loginBodySchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid request body' });
    }

    const { email, password } = parse.data;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, displayName: true }
    });
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = fastify.jwt.sign({ sub: user.id });
    return reply.send({
      token,
      user: { id: user.id, email: user.email, display_name: user.displayName ?? null }
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

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, displayName: true }
      });
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send({ user: { id: user.id, email: user.email, display_name: user.displayName ?? null } });
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
        await prisma.user.update({
          where: { id: userId },
          data: { displayName: display_name }
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, displayName: true }
      });
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send({ user: { id: user.id, email: user.email, display_name: user.displayName ?? null } });
    }
  );
}

