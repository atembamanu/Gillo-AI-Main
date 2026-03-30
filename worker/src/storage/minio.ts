import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand
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
