import { db } from '@/lib/db/config';
import { sql } from 'drizzle-orm';

async function addPasswordColumn() {
  try {
    console.log('Adding password column to user table...');
    
    await db.execute(sql`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "password" text`);
    
    console.log('✅ Password column added successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding password column:', error);
    process.exit(1);
  }
}

addPasswordColumn(); 