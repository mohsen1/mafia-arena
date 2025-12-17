#!/usr/bin/env tsx

import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '@/lib/db/config';
import { users } from '@/lib/db/schema';
import { hashPassword } from '@/lib/auth/utils';
import { eq } from 'drizzle-orm';

const TEST_USER = {
  email: 'test@example.com',
  password: 'Test123!',
  name: 'Test User',
};

async function createTestUser() {
  try {
    console.log('Creating test user...');

    // Check if user exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, TEST_USER.email))
      .limit(1);

    if (existingUser) {
      console.log('Test user already exists:', TEST_USER.email);
      console.log('Password:', TEST_USER.password);
      return;
    }

    // Hash password
    const hashedPassword = await hashPassword(TEST_USER.password);

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        name: TEST_USER.name,
        email: TEST_USER.email,
        password: hashedPassword,
        emailVerified: new Date(),
      })
      .returning();

    console.log('✅ Test user created:');
    console.log('   Email:', TEST_USER.email);
    console.log('   Password:', TEST_USER.password);
    console.log('   ID:', newUser.id);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createTestUser().then(() => {
  console.log('Done!');
  process.exit(0);
}); 