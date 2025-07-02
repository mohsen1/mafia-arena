import { defineConfig } from 'drizzle-kit';

const isVercel = Boolean(process.env.VERCEL);
const isDev = process.env.NODE_ENV !== 'production' && !isVercel;

const databaseUrl =
  process.env.DATABASE_URL ||
  (isDev
    ? 'postgresql://werewolf_ai:dev_password_2024@localhost:5432/werewolf_ai_dev'
    : undefined);

if (!databaseUrl) {
  const errorMessage = [
    'DATABASE_URL environment variable is required for Drizzle configuration',
    '',
    'Please set the DATABASE_URL environment variable.',
    '',
    'For local development:',
    '  1. Create a .env file in the project root',
    '  2. Add: DATABASE_URL=postgresql://user:password@localhost:5432/werewolf_db',
    '',
    'For production/CI:',
    '  Set DATABASE_URL in your environment configuration',
    '',
    'To run migrations: pnpm db:migrate',
    'To generate migrations: pnpm db:generate',
  ].join('\n');
  
  throw new Error(errorMessage);
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
}); 