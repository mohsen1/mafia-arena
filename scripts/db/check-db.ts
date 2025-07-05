import postgres from 'postgres';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

async function checkDb() {
  const connectionString = process.env.DATABASE_URL;
  const isCI = process.env.CI === 'true' || process.env.VERCEL === '1';
  
  if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is missing');
    console.error('');
    
    if (isCI) {
      console.error('In Vercel/CI environment:');
      console.error('  1. Go to your Vercel project settings');
      console.error('  2. Navigate to "Environment Variables"');
      console.error('  3. Add DATABASE_URL with your production database connection string');
      console.error('  4. Ensure it\'s available for Production, Preview, and Development environments');
      console.error('');
      console.error('Example format:');
      console.error('  postgresql://user:password@host:5432/database?sslmode=require');
    } else {
      console.error('Please set the DATABASE_URL environment variable to connect to your database.');
      console.error('');
      console.error('Examples:');
      console.error('  Local PostgreSQL:');
      console.error('    export DATABASE_URL="postgresql://user:password@localhost:5432/werewolf_db"');
      console.error('');
      console.error('  Using .env file:');
      console.error('    1. Create a .env file in the project root');
      console.error('    2. Add: DATABASE_URL=postgresql://user:password@localhost:5432/werewolf_db');
    }
    console.error('');
    console.error('For CI environments:');
    console.error('  Set DATABASE_URL in your CI workflow configuration');
    console.error('');
    process.exit(1);
  }
  
  // Log environment info for debugging
  console.log('🔍 Environment info:');
  console.log(`   CI: ${isCI ? 'Yes' : 'No'}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
  console.log(`   VERCEL: ${process.env.VERCEL || 'not set'}`);
  console.log(`   Database URL: ${connectionString.replace(/:[^:@]+@/, ':****@')}`); // Hide password
  
  const sql = postgres(connectionString, { max: 1 });
  try {
    await sql`SELECT 1`;
    console.log('✅ Database connection successful');
    
    // Check if required tables exist
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `;
    
    console.log(`✅ Found ${tables.length} tables in the database`);
    
    if (tables.length === 0 && isCI) {
      console.warn('⚠️  No tables found. Migrations will be run next.');
    }
  } catch (error) {
    console.error('❌ Failed to connect to the database:', error);
    console.error('');
    console.error('Please check:');
    console.error('  1. Your database server is running and accessible');
    console.error('  2. The DATABASE_URL is correctly formatted');
    console.error('  3. The database exists and is accessible');
    console.error('  4. Your credentials are correct');
    
    if (isCI) {
      console.error('  5. For Vercel: Ensure the database allows connections from Vercel IP addresses');
      console.error('  6. SSL mode may be required: add ?sslmode=require to your connection string');
    }
    
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

(async () => {
  await checkDb();
})();
