import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root
dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  PORT: process.env.PORT || 4747,
  NODE_ENV: process.env.NODE_ENV || 'development',
  SESSION_DIR: path.join(__dirname, '../../claude-session'),
  CLAUDE_URL: 'https://claude.ai',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/apna-claude',
  JWT_SECRET: process.env.JWT_SECRET || 'your_super_secret_key_123',
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '2021'),
};
