function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if ((value === undefined || value === '') && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? '';
}

export const config = {
  port: Number(getEnv('PORT', '3000')),
  postgresUrl: getEnv('POSTGRES_URL', 'postgres://postgres:postgres@postgres:5432/notes'),
  redisUrl: getEnv('REDIS_URL', 'redis://redis:6379'),
  jwtSecret: getEnv('JWT_SECRET', 'change-me-in-prod'),
  corsOrigin: getEnv('CORS_ORIGIN', 'http://localhost'),
  ollamaUrl: getEnv('OLLAMA_URL', 'http://ollama:11434'),
  ollamaModel: getEnv('OLLAMA_MODEL', 'llama3.2:1b'),
  whisperUrl: getEnv('WHISPER_URL', 'http://whisper:9000'),
  minioEndpoint: getEnv('MINIO_ENDPOINT', 'http://minio:9000'),
  minioRegion: getEnv('MINIO_REGION', 'us-east-1'),
  minioAccessKey: getEnv('MINIO_ACCESS_KEY', 'minioadmin'),
  minioSecretKey: getEnv('MINIO_SECRET_KEY', 'minioadmin'),
  minioBucket: getEnv('MINIO_BUCKET', 'audio-notes'),
  queueAttempts: Number(getEnv('QUEUE_ATTEMPTS', '3'))
};
