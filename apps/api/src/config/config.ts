import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  server: {
    host: process.env.HOST || 'localhost',
    port: parseInt(process.env.PORT || '3333', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:4200',
      'http://localhost:3000',
    ],
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  features: {
    enableAuth: process.env.ENABLE_AUTH === 'true',
    enableRateLimit: process.env.ENABLE_RATE_LIMIT === 'true',
  },
};
