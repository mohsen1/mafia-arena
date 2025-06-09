import postgres from 'postgres';

async function checkDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is missing');
    process.exit(1);
  }
  const sql = postgres(connectionString, { max: 1 });
  try {
    await sql`SELECT 1`;
    console.log('✅ Database connection successful');
  } catch (error) {
    console.error('❌ Failed to connect to the database:', error);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

(async () => {
  await checkDb();
})();
