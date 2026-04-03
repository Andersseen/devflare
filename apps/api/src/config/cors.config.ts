import cors from 'cors';
import { Express } from 'express';

const getAllowedOrigins = (): string[] => {
  const envOrigins = process.env.ALLOWED_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(',').map((origin) => origin.trim());
  }

  // Default origins for development
  return [
    'http://localhost:4200',
    'http://localhost:3000',
    'http://localhost:5173',
  ];
};

export const configureCors = (app: Express): void => {
  const allowedOrigins = getAllowedOrigins();
  const isDevelopment = process.env.NODE_ENV !== 'production';

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) {
          return callback(null, true);
        }

        if (allowedOrigins.includes(origin) || isDevelopment) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
      ],
      credentials: true,
      maxAge: 86400, // 24 hours
    }),
  );

  // Handle preflight requests
  app.options('*', cors());
};
