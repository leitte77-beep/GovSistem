import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgres://chatgov:chatgov@localhost:5432/chatgov',
  jwtSecret: process.env.JWT_SECRET || 'chatgov-dev-secret-change-in-production',
  jwtSecrets: (process.env.JWT_SECRETS || '').split(',').map(s => s.trim()).filter(Boolean),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  corsOrigin: process.env.SOCKET_CORS_ORIGIN || 'http://localhost:5173',
  storageDriver: process.env.STORAGE_DRIVER || 'local',
  s3Bucket: process.env.S3_BUCKET || '',
  s3Region: process.env.S3_REGION || 'us-east-1',
  s3AccessKey: process.env.S3_ACCESS_KEY || '',
  s3SecretKey: process.env.S3_SECRET_KEY || '',
  s3Endpoint: process.env.S3_ENDPOINT || '',
  credsEncryptionKey: process.env.CREDS_ENCRYPTION_KEY || 'chatgov-dev-encryption-key-32chars!',
  rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '30', 10),
  uploadsDir: process.env.UPLOADS_DIR || './uploads',
  internalApiKey: process.env.INTERNAL_API_KEY || 'chatgov-internal-key-change-me',
};
