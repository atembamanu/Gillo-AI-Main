import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from './config';

const connection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

export const processNoteQueue = new Queue<ProcessNoteJobPayload>('process_note', {
  connection,
  defaultJobOptions: {
    attempts: config.queueAttempts,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});

export type BucketField = { name: string; description?: string; ai_description?: string };

export type ProcessNoteJobPayload =
  | {
      type: 'text';
      userId: string;
      bucketId: string;
      noteId: string;
      originalText: string;
      referenceDate?: string;
      referenceTimezone?: string;
      bucketFields?: BucketField[];
    }
  | {
      type: 'audio';
      userId: string;
      bucketId: string;
      noteId: string;
      rawKey?: string;
      audioUrl?: string;
      referenceTimezone?: string;
    };

export async function enqueueProcessNoteJob(job: ProcessNoteJobPayload): Promise<void> {
  await processNoteQueue.add('process', job);
}
