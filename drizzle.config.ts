import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://werewolf_ai:dev_password_2024@localhost:5432/werewolf_ai_dev',
  },
  verbose: true,
  strict: true,
}); 