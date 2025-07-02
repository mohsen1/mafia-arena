import postgres from 'postgres';

async function checkDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is missing');
    console.error('');
    console.error('Please set the DATABASE_URL environment variable to connect to your database.');
    console.error('');
    console.error('Examples:');
    console.error('  Local PostgreSQL:');
    console.error('    export DATABASE_URL="postgresql://user:password@localhost:5432/werewolf_db"');
    console.error('');
    console.error('  Using .env file:');
    console.error('    1. Create a .env file in the project root');
    console.error('    2. Add: DATABASE_URL=postgresql://user:password@localhost:5432/werewolf_db');
    console.error('');
    console.error('  For CI environments:');
    console.error('    Set DATABASE_URL in your CI workflow configuration');
    console.error('');
    process.exit(1);
  }
  const sql = postgres(connectionString, { max: 1 });
  try {
    await sql`SELECT 1`;
    console.log('✅ Database connection successful');
    console.log(`   Connected to: ${connectionString.replace(/:[^:@]+@/, ':****@')}`); // Hide password
  } catch (error) {
    console.error('❌ Failed to connect to the database:', error);
    console.error('');
    console.error('Please check:');
    console.error('  1. Your database server is running');
    console.error('  2. The DATABASE_URL is correctly formatted');
    console.error('  3. The database exists and is accessible');
    console.error('  4. Your credentials are correct');
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

(async () => {
  await checkDb();
})();
