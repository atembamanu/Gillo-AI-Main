import { request } from './client';

export interface BucketField {
  name: string;
  description?: string;
  /** Longer description + examples for the mapping AI; improves accuracy (e.g. avoid Work Order mapped as Driver). */
  ai_description?: string;
}

export interface Bucket {
  id: string;
  name: string;
  created_at: string;
  fields?: BucketField[];
}

export async function listBuckets(): Promise<{ buckets: Bucket[] }> {
  return request<{ buckets: Bucket[] }>('/buckets');
}

export async function createBucket(
  name: string,
  fields: BucketField[] = []
): Promise<{ bucket: Bucket }> {
  return request<{ bucket: Bucket }>('/buckets', {
    method: 'POST',
    body: JSON.stringify({ name, fields }),
  });
}

export async function updateBucket(
  id: string,
  data: { name?: string; fields?: BucketField[] }
): Promise<{ bucket: Bucket }> {
  return request<{ bucket: Bucket }>(`/buckets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteBucket(id: string): Promise<void> {
  await request<unknown>(`/buckets/${id}`, {
    method: 'DELETE',
  });
}

/** Ask the AI to generate a longer description with examples for a bucket field (improves mapping accuracy). */
export async function generateBucketFieldAiDescription(
  name: string,
  description?: string,
  bucketName?: string
): Promise<{ ai_description: string }> {
  return request<{ ai_description: string }>('/buckets/generate-ai-description', {
    method: 'POST',
    body: JSON.stringify({
      name,
      description: description || undefined,
      bucketName: bucketName || undefined,
    }),
  });
}
