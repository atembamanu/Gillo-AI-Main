function getEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function assertNotDefault(name: string, value: string, blockedValues: string[]) {
  if (process.env.NODE_ENV !== 'production') return;
  if (blockedValues.includes(value)) {
    throw new Error(`Unsafe production value for ${name}. Set a secure value in Dokploy.`);
  }
}

const minioAccessKey = getEnv('MINIO_ACCESS_KEY');
const minioSecretKey = getEnv('MINIO_SECRET_KEY');
assertNotDefault('MINIO_ACCESS_KEY', minioAccessKey, ['minioadmin']);
assertNotDefault('MINIO_SECRET_KEY', minioSecretKey, ['minioadmin']);

export const config = {
  postgresUrl: getEnv('POSTGRES_URL'),
  redisUrl: getEnv('REDIS_URL'),
  ollamaUrl: getEnv('OLLAMA_URL'),
  whisperUrl: getEnv('WHISPER_URL'),
  ollamaModel: getEnv('OLLAMA_MODEL'),
  apiBaseUrl: getEnv('API_BASE_URL'),
  minioEndpoint: getEnv('MINIO_ENDPOINT'),
  minioAccessKey,
  minioSecretKey,
  minioBucket: getEnv('MINIO_BUCKET'),
  minioRegion: getEnv('MINIO_REGION'),
  queueConcurrency: Number(getEnv('QUEUE_CONCURRENCY'))
};
