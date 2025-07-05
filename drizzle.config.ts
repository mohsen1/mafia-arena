import { defineConfig } from 'drizzle-kit';

// During build time, we might not have all env vars available
const isBuildTime = process.env.VERCEL === '1' || process.env.CI === 'true';

let databaseUrl: string;

try {
  // Try to import the server config
  const { DATABASE_URL } = require('./src/lib/config/server');
  databaseUrl = DATABASE_URL;
} catch (error) {
  // If server config fails (e.g., during build), fall back to direct env var
  databaseUrl = process.env.DATABASE_URL || '';
  
  // Only throw error if we're actually running a drizzle command, not during build
  if (!databaseUrl && !isBuildTime) {
    const errorMessage = [
      'DATABASE_URL environment variable is required for Drizzle configuration',
      '',
      'Please set the DATABASE_URL environment variable.',
      '',
      'For local development with Docker:',
      '  1. Run: docker compose up -d',
      '  2. Create a .env.local file in the project root',
      '  3. Add: DATABASE_URL=postgresql://werewolf:werewolf_dev_password@localhost:5432/werewolf_db',
      '',
      'For local development without Docker:',
      '  1. Create a .env.local file in the project root',
      '  2. Add: DATABASE_URL=postgresql://user:password@localhost:5432/werewolf_db',
      '',
      'For production/CI:',
      '  Set DATABASE_URL in your environment configuration',
    ].join('\n');
    
    throw new Error(errorMessage);
  }
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: databaseUrl || 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
  verbose: true,
  strict: true,
}); 