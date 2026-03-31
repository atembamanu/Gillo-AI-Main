import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { config } from './config';
import { handleTextJob, TextJobPayload } from './pipelines/textPipeline';
import { handleAudioJob, AudioJobPayload } from './pipelines/audioPipeline';

const queueName = 'process_note';
const warmupTimeoutMs = 120_000;
const serviceWaitTimeoutMs = 300_000;
const serviceWaitPollMs = 2_000;

async function waitForHttpService(name: string, url: string, timeoutMs = serviceWaitTimeoutMs): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) {
        console.log(`[worker] ${name} is ready at ${url}`);
        return;
      }
    } catch {
      // Service not ready yet; keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, serviceWaitPollMs));
  }
  throw new Error(`[worker] Timeout waiting for ${name} at ${url}`);
}

type JobPayload = TextJobPayload | AudioJobPayload;

/** Warm up Ollama so the first mapping job doesn't wait for model load. */
async function warmupOllama(): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), warmupTimeoutMs);
  try {
    const res = await fetch(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollamaModel,
        prompt: 'Reply with exactly: OK',
        stream: false
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      console.log('[worker] Ollama model loaded, first mapping will be fast');
    } else {
      console.warn('[worker] Ollama warmup responded with', res.status);
    }
  } catch (err) {
    clearTimeout(timeout);
    console.warn('[worker] Ollama warmup failed (first mapping may be slow):', (err as Error)?.message ?? err);
  }
}

async function main() {
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

  console.log('[worker] Waiting for Whisper and Ollama...');
  await waitForHttpService('Whisper', `${config.whisperUrl}/docs`);
  await waitForHttpService('Ollama', `${config.ollamaUrl}/api/tags`);

  console.log('[worker] Warming up Ollama...');
  await warmupOllama();
  console.log('[worker] Starting BullMQ worker for queue', queueName);

  const worker = new Worker<JobPayload>(
    queueName,
    async (job) => {
      const payload = job.data;
      console.log('[worker] Processing job', job.id, (payload as any).type || 'unknown');

      if (payload.type === 'text') {
        await handleTextJob(payload);
      } else if (payload.type === 'audio') {
        await handleAudioJob(payload);
      } else {
        throw new Error(`Unknown job type: ${(payload as any).type}`);
      }
    },
    {
      connection,
      concurrency: config.queueConcurrency,
    }
  );

  worker.on('completed', (job) => {
    console.log('[worker] Job', job.id, 'completed');
  });

  worker.on('failed', (job, err) => {
    console.error('[worker] Job', job?.id, 'failed:', err?.message ?? err);
  });

  worker.on('error', (err) => {
    console.error('[worker] Worker error:', err);
  });

  process.on('SIGTERM', async () => {
    console.log('[worker] Shutting down...');
    await worker.close();
    await connection.quit();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[worker] Fatal error', err);
  process.exit(1);
});
