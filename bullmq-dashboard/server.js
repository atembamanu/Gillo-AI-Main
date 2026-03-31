const express = require('express');
const basicAuth = require('basic-auth');
const { Queue } = require('bullmq');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const Redis = require('ioredis');

const PORT = Number(process.env.PORT || 3010);
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const DASHBOARD_USERNAME = process.env.DASHBOARD_USERNAME || 'admin';
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'change-me';
const QUEUE_NAMES = (process.env.QUEUE_NAMES || 'process_note')
  .split(',')
  .map((q) => q.trim())
  .filter(Boolean);

const redisConnection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

const queues = QUEUE_NAMES.map((name) => new Queue(name, { connection: redisConnection }));
const queueAdapters = queues.map((queue) => new BullMQAdapter(queue));

const app = express();
app.disable('x-powered-by');

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', queues: QUEUE_NAMES });
});

function requireBasicAuth(req, res, next) {
  const creds = basicAuth(req);
  const ok =
    creds &&
    creds.name === DASHBOARD_USERNAME &&
    creds.pass === DASHBOARD_PASSWORD;
  if (!ok) {
    res.set('WWW-Authenticate', 'Basic realm="BullMQ Dashboard"');
    return res.status(401).send('Authentication required');
  }
  return next();
}

app.use(requireBasicAuth);

app.get('/stats', async (_req, res) => {
  try {
    const stats = {};
    for (const queue of queues) {
      stats[queue.name] = await queue.getJobCounts(
        'active',
        'completed',
        'delayed',
        'failed',
        'paused',
        'prioritized',
        'waiting',
        'waiting-children'
      );
    }
    res.json({ queues: stats });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch queue stats' });
  }
});

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/');

createBullBoard({
  queues: queueAdapters,
  serverAdapter,
  options: {
    uiConfig: {
      boardTitle: 'Gillo BullMQ Dashboard'
    }
  }
});

app.use('/', serverAdapter.getRouter());

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[bullmq-dashboard] listening on :${PORT}`);
});
