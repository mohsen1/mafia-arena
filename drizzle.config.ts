import { defineConfig } from 'drizzle-kit';

const isVercel = Boolean(process.env.VERCEL);
const isDev = process.env.NODE_ENV !== 'production' && !isVercel;

const databaseUrl =
  process.env.DATABASE_URL ||
  (isDev
    ? 'postgresql://werewolf_ai:dev_password_2024@localhost:5432/werewolf_ai_dev'
    : undefined);

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
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