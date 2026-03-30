function parseCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  postgresUrl:
    process.env.POSTGRES_URL ||
    'postgres://postgres:postgres@postgres:5432/notes',
  redisUrl: process.env.REDIS_URL || 'redis://redis:6379',
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-prod',
  ollamaUrl: process.env.OLLAMA_URL || 'http://ollama:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2:1b',
  whisperUrl: process.env.WHISPER_URL || 'http://whisper:9000',
  minioEndpoint: process.env.MINIO_ENDPOINT || 'http://minio:9000',
  minioRegion: process.env.MINIO_REGION || 'us-east-1',
  minioAccessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  minioSecretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  minioBucket: process.env.MINIO_BUCKET || 'audio-notes',
  /** Public API origin (e.g. https://api.gilloai.com). Used for audio URLs when the SPA is on another domain. */
  publicApiUrl: (process.env.PUBLIC_API_URL || '').replace(/\/$/, ''),
  corsOrigins: parseCorsOrigins(),
};

