import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand
} from '@aws-sdk/client-s3';
import { config } from '../config';

const s3 = new S3Client({
  region: config.minioRegion,
  endpoint: config.minioEndpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.minioAccessKey,
    secretAccessKey: config.minioSecretKey
  }
});

let bucketEnsured = false;

async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.minioBucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: config.minioBucket }));
  }
  bucketEnsured = true;
}

export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await ensureBucket();
  await s3.send(
    new PutObjectCommand({
      Bucket: config.minioBucket,
      Key: key,
      Body: body,
      ContentType: contentType
    })
  );
}

export interface GetObjectResult {
  body: NodeJS.ReadableStream;
  contentLength?: number;
  contentRange?: string;
  contentType?: string;
  isPartial: boolean;
}

/** Get object stream. If rangeHeader is provided (e.g. "bytes=0-1023"), returns partial content for seeking. */
export async function getObjectStream(
  key: string,
  rangeHeader?: string
): Promise<GetObjectResult> {
  const command = new GetObjectCommand({
    Bucket: config.minioBucket,
    Key: key,
    ...(rangeHeader ? { Range: rangeHeader } : {})
  });
  const res = await s3.send(command);
  const body = res.Body as NodeJS.ReadableStream;
  const isPartial = res.ContentRange != null;
  return {
    body,
    contentLength: res.ContentLength,
    contentRange: res.ContentRange,
    contentType: res.ContentType,
    isPartial: !!isPartial
  };
}

/** Get object metadata (e.g. content length) for Range requests. */
export async function getObjectMetadata(key: string): Promise<{ contentLength: number; contentType?: string }> {
  const res = await s3.send(
    new HeadObjectCommand({
      Bucket: config.minioBucket,
      Key: key
    })
  );
  return {
    contentLength: res.ContentLength ?? 0,
    contentType: res.ContentType
  };
}

/** Get full object as Buffer (e.g. for worker to process). */
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const res = await s3.send(
    new GetObjectCommand({
      Bucket: config.minioBucket,
      Key: key
    })
  );
  const stream = res.Body as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

