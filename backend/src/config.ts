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
    throw new Error(`Unsafe production value for ${name}. Set a strong secret in Dokploy.`);
  }
}

const jwtSecret = getEnv('JWT_SECRET');
const minioAccessKey = getEnv('MINIO_ACCESS_KEY');
const minioSecretKey = getEnv('MINIO_SECRET_KEY');

assertNotDefault('JWT_SECRET', jwtSecret, [
  'change-me-in-prod',
  'replace-with-strong-secret',
  'changeme',
  'secret'
]);
assertNotDefault('MINIO_ACCESS_KEY', minioAccessKey, ['minioadmin']);
assertNotDefault('MINIO_SECRET_KEY', minioSecretKey, ['minioadmin']);

export const config = {
  port: Number(getEnv('PORT')),
  postgresUrl: getEnv('POSTGRES_URL'),
  redisUrl: getEnv('REDIS_URL'),
  jwtSecret,
  corsOrigin: getEnv('CORS_ORIGIN'),
  ollamaUrl: getEnv('OLLAMA_URL'),
  ollamaModel: getEnv('OLLAMA_MODEL'),
  whisperUrl: getEnv('WHISPER_URL'),
  minioEndpoint: getEnv('MINIO_ENDPOINT'),
  minioRegion: getEnv('MINIO_REGION'),
  minioAccessKey,
  minioSecretKey,
  minioBucket: getEnv('MINIO_BUCKET'),
  queueAttempts: Number(getEnv('QUEUE_ATTEMPTS'))
};
