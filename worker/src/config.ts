export const config = {
  postgresUrl:
    process.env.POSTGRES_URL ||
    'postgres://postgres:postgres@postgres:5432/notes',
  redisUrl: process.env.REDIS_URL || 'redis://redis:6379',
  ollamaUrl: process.env.OLLAMA_URL || 'http://ollama:11434',
  whisperUrl: process.env.WHISPER_URL || 'http://whisper:9000',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.1',
  apiBaseUrl: process.env.API_BASE_URL || 'http://api-server:3000',
  /** Same as backend PUBLIC_API_URL; used for audio URLs stored in DB. */
  publicApiUrl: (process.env.PUBLIC_API_URL || '').replace(/\/$/, ''),
  minioEndpoint: process.env.MINIO_ENDPOINT || 'http://minio:9000',
  minioAccessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  minioSecretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  minioBucket: process.env.MINIO_BUCKET || 'audio-notes',
  minioRegion: process.env.MINIO_REGION || 'us-east-1',
};

