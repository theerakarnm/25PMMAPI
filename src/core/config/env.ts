import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3001'),
  
  // Database
  DATABASE_URL: z.string().min(1, 'Database URL is required'),
  
  // Redis for job queue
  REDIS_URL: z.string().min(1, 'Redis URL is required'),
  
  // Authentication
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  
  // LINE API
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1, 'LINE channel access token is required'),
  LINE_CHANNEL_SECRET: z.string().min(1, 'LINE channel secret is required'),
  LINE_WEBHOOK_URL: z.string().url('Invalid LINE webhook URL'),
  
  // Admin credentials
  ADMIN_EMAIL: z.string().email('Invalid admin email'),
  ADMIN_PASSWORD: z.string().min(8, 'Admin password must be at least 8 characters'),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  console.error('❌ Invalid environment variables:', error);
  process.exit(1);
}

export { env };