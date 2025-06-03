import { db } from '@/lib/db/config';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth/utils';

const DEV_USER = {
  email: 'dev@werewolf-ai.com',
  password: 'DevPassword123!',
  name: 'Developer',
};

async function seedDevUser() {
  try {
    // Safety check: only run in development
    if (process.env.NODE_ENV === 'production') {
      console.log('⚠️  Development user seeding skipped in production environment');
      return;
    }

    console.log('🌱 Seeding development user...');

    // Check if dev user already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, DEV_USER.email))
      .limit(1);

    if (existingUser) {
      console.log('✅ Development user already exists:', DEV_USER.email);
      return;
    }

    // Hash the password
    const hashedPassword = await hashPassword(DEV_USER.password);

    // Create the development user
    const [newUser] = await db
      .insert(users)
      .values({
        name: DEV_USER.name,
        email: DEV_USER.email,
        password: hashedPassword,
        emailVerified: null,
        image: null,
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
      });

    console.log('✅ Development user created successfully:');
    console.log('   Email:', DEV_USER.email);
    console.log('   Password:', DEV_USER.password);
    console.log('   User ID:', newUser.id);
    console.log('');
    console.log('🎯 You can now sign in with these credentials in development mode.');

  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'ECONNREFUSED'
    ) {
      console.warn(
        '⚠️  Could not connect to database. Skipping development user seeding.'
      );
      return;
    }
    console.error('❌ Error seeding development user:', error);
    throw error;
  }
}

// Export both the function and dev user info
export { seedDevUser, DEV_USER };

// If this script is run directly
if (require.main === module) {
  seedDevUser()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
} 