function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if ((value === undefined || value === '') && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? '';
}

export const config = {
  postgresUrl: getEnv('POSTGRES_URL', 'postgres://postgres:postgres@postgres:5432/notes'),
  redisUrl: getEnv('REDIS_URL', 'redis://redis:6379'),
  ollamaUrl: getEnv('OLLAMA_URL', 'http://ollama:11434'),
  whisperUrl: getEnv('WHISPER_URL', 'http://whisper:9000'),
  ollamaModel: getEnv('OLLAMA_MODEL', 'llama3.1'),
  apiBaseUrl: getEnv('API_BASE_URL', 'http://api-server:3000'),
  minioEndpoint: getEnv('MINIO_ENDPOINT', 'http://minio:9000'),
  minioAccessKey: getEnv('MINIO_ACCESS_KEY', 'minioadmin'),
  minioSecretKey: getEnv('MINIO_SECRET_KEY', 'minioadmin'),
  minioBucket: getEnv('MINIO_BUCKET', 'audio-notes'),
  minioRegion: getEnv('MINIO_REGION', 'us-east-1'),
  queueConcurrency: Number(getEnv('QUEUE_CONCURRENCY', '1'))
};
