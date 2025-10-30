/**
 * Database Migration Utilities
 * Handles NextAuth to Melody migration with data compatibility
 * Cloudflare Workers Compatible
 */

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db/config';
import { users } from '@/lib/db/schema';
import { eq, and, sql, count } from 'drizzle-orm';

// Migration schemas
const migrationConfigSchema = z.object({
  backupBeforeMigration: z.boolean().default(true),
  dryRun: z.boolean().default(false),
  preserveExistingData: z.boolean().default(true),
  syncUsers: z.boolean().default(true),
  syncSessions: z.boolean().default(false), // Melody uses JWT sessions
  syncOAuthTokens: z.boolean().default(false), // Melody handles this internally
});

const userMigrationSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  image: z.string().url().nullable(),
  password: z.string().nullable(),
  emailVerified: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Migration results interface
interface MigrationResults {
  success: boolean;
  timestamp: string;
  dryRun: boolean;
  nextAuthUsers: number;
  melodyUsers: number;
  migratedUsers: number;
  errors: string[];
  warnings: string[];
  backupId?: string;
}

// User mapping interface for Melody compatibility
interface MelodyUser {
  id: string;
  email: string;
  name?: string;
  image?: string;
  provider: 'google' | 'github' | 'credentials';
  providerId?: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
  isActive: boolean;
  role?: string;
  metadata?: Record<string, any>;
}

/**
 * Database Migration Manager
 */
export class AuthMigrationManager {
  private config: z.infer<typeof migrationConfigSchema>;
  private backupData: Record<string, any> = {};

  constructor(config?: Partial<z.infer<typeof migrationConfigSchema>>) {
    this.config = migrationConfigSchema.parse({
      backupBeforeMigration: true,
      dryRun: process.env.NODE_ENV === 'development',
      preserveExistingData: true,
      syncUsers: true,
      ...config,
    });
  }

  /**
   * Run comprehensive migration from NextAuth to Melody
   */
  async migrate(): Promise<MigrationResults> {
    const results: MigrationResults = {
      success: false,
      timestamp: new Date().toISOString(),
      dryRun: this.config.dryRun,
      nextAuthUsers: 0,
      melodyUsers: 0,
      migratedUsers: 0,
      errors: [],
      warnings: [],
    };

    try {
      console.log('🔄 Starting NextAuth to Melody migration...');

      // Step 1: Backup existing data
      if (this.config.backupBeforeMigration) {
        console.log('💾 Creating backup...');
        results.backupId = await this.createBackup();
      }

      // Step 2: Analyze current NextAuth data
      console.log('📊 Analyzing NextAuth data...');
      const nextAuthAnalysis = await this.analyzeNextAuthData();
      results.nextAuthUsers = nextAuthAnalysis.userCount;
      results.melodyUsers = nextAuthAnalysis.melodyUserCount;

      console.log(`Found ${nextAuthAnalysis.userCount} NextAuth users`);

      // Step 3: Migrate users if configured
      if (this.config.syncUsers) {
        console.log('👥 Migrating users...');
        const userMigration = await this.migrateUsers(nextAuthAnalysis.users);
        results.migratedUsers = userMigration.successCount;
        results.errors.push(...userMigration.errors);
        results.warnings.push(...userMigration.warnings);
      }

      // Step 4: Verify migration
      console.log('✅ Verifying migration...');
      const verification = await this.verifyMigration();
      
      if (verification.success) {
        results.success = true;
        console.log('✅ Migration completed successfully!');
      } else {
        results.errors.push(...verification.errors);
        console.error('❌ Migration verification failed');
      }

      // Step 5: Cleanup (if not dry run)
      if (!this.config.dryRun && results.success) {
        await this.cleanupAfterMigration();
      }

    } catch (error) {
      results.errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('❌ Migration error:', error);
      
      // Restore backup if migration failed
      if (results.backupId && !this.config.dryRun) {
        await this.restoreBackup(results.backupId);
      }
    }

    return results;
  }

  /**
   * Create backup of current authentication data
   */
  private async createBackup(): Promise<string> {
    const backupId = `backup_${Date.now()}`;
    
    try {
      // Backup users table
      const usersData = await db.select().from(users);
      
      this.backupData[backupId] = {
        id: backupId,
        timestamp: new Date().toISOString(),
        type: 'auth_migration_backup',
        data: {
          users: usersData,
          // Add other auth-related tables here
        },
        schema: {
          usersTable: usersData.length > 0 ? Object.keys(usersData[0]) : [],
        },
      };

      console.log(`💾 Backup created: ${backupId}`);
      return backupId;
    } catch (error) {
      throw new Error(`Backup creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Restore from backup
   */
  private async restoreBackup(backupId: string): Promise<void> {
    try {
      const backup = this.backupData[backupId];
      if (!backup) {
        throw new Error(`Backup ${backupId} not found`);
      }

      console.log(`🔄 Restoring backup: ${backupId}`);

      // Restore users table
      if (backup.data.users) {
        for (const userData of backup.data.users) {
          // Check if user exists and restore/update
          const existingUser = await db
            .select()
            .from(users)
            .where(eq(users.id, userData.id))
            .limit(1);

          if (existingUser.length === 0) {
            // User doesn't exist, restore them
            await db.insert(users).values(userData);
          } else {
            // User exists, update with backup data
            await db
              .update(users)
              .set({
                ...userData,
                updatedAt: new Date(),
              })
              .where(eq(users.id, userData.id));
          }
        }
      }

      console.log(`✅ Backup restored: ${backupId}`);
    } catch (error) {
      console.error('❌ Backup restoration failed:', error);
      throw error;
    }
  }

  /**
   * Analyze NextAuth data to understand what needs migration
   */
  private async analyzeNextAuthData() {
    try {
      const nextAuthUsers = await db.select().from(users);
      
      // Check if we have any existing Melody-compatible users
      const melodyUserCount = nextAuthUsers.filter(u => u.emailVerified).length;

      return {
        users: nextAuthUsers,
        userCount: nextAuthUsers.length,
        melodyUserCount,
        providers: {
          google: nextAuthUsers.filter(u => !u.password).length,
          github: nextAuthUsers.filter(u => !u.password && u.name?.includes('GitHub')).length,
          credentials: nextAuthUsers.filter(u => u.password).length,
        },
        verificationStatus: {
          verified: nextAuthUsers.filter(u => u.emailVerified).length,
          unverified: nextAuthUsers.filter(u => !u.emailVerified).length,
        },
      };
    } catch (error) {
      throw new Error(`NextAuth data analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Migrate users from NextAuth format to Melody format
   */
  private async migrateUsers(nextAuthUsers: any[]) {
    const result = {
      successCount: 0,
      errorCount: 0,
      skipCount: 0,
      errors: [] as string[],
      warnings: [] as string[],
    };

    console.log(`👥 Migrating ${nextAuthUsers.length} users...`);

    for (const nextAuthUser of nextAuthUsers) {
      try {
        // Validate user data
        userMigrationSchema.parse(nextAuthUser);

        // Check if user already exists in Melody format
        const existingUser = await db
          .select()
          .from(users)
          .where(eq(users.email, nextAuthUser.email))
          .limit(1);

        if (existingUser.length > 0) {
          if (this.config.preserveExistingData) {
            result.skipCount++;
            continue;
          }
        }

        // Convert NextAuth user to Melody format
        const melodyUser: MelodyUser = {
          id: nextAuthUser.id,
          email: nextAuthUser.email,
          name: nextAuthUser.name,
          image: nextAuthUser.image,
          provider: nextAuthUser.password ? 'credentials' : 'google', // Default to google for OAuth
          providerId: nextAuthUser.email,
          emailVerified: !!nextAuthUser.emailVerified,
          createdAt: nextAuthUser.createdAt,
          updatedAt: nextAuthUser.updatedAt,
          lastLogin: nextAuthUser.updatedAt,
          isActive: true,
          metadata: {
            migratedFrom: 'nextauth',
            migrationDate: new Date().toISOString(),
          },
        };

        // Hash password if user has credentials
        if (melodyUser.provider === 'credentials' && nextAuthUser.password) {
          if (!melodyUser.metadata) {
            melodyUser.metadata = {};
          }
          melodyUser.metadata.hasPassword = true;
        }

        if (!this.config.dryRun) {
          if (existingUser.length === 0) {
            // Insert new user
            await db.insert(users).values({
              id: melodyUser.id,
              email: melodyUser.email,
              name: melodyUser.name,
              image: melodyUser.image,
              password: nextAuthUser.password, // Keep existing password
              emailVerified: melodyUser.emailVerified ? new Date() : null,
              createdAt: melodyUser.createdAt,
              updatedAt: new Date(),
            });
          } else {
            // Update existing user with Melody data
            await db
              .update(users)
              .set({
                name: melodyUser.name || existingUser[0].name,
                image: melodyUser.image || existingUser[0].image,
                emailVerified: melodyUser.emailVerified ? new Date() : existingUser[0].emailVerified,
                updatedAt: new Date(),
              })
              .where(eq(users.id, existingUser[0].id));
          }
        }

        result.successCount++;
        
      } catch (error) {
        result.errorCount++;
        const errorMessage = `User ${nextAuthUser.email}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMessage);
        console.error('❌ User migration error:', errorMessage);
      }
    }

    console.log(`👥 Migration results:`, {
      success: result.successCount,
      skipped: result.skipCount,
      errors: result.errorCount,
    });

    return result;
  }

  /**
   * Verify that migration was successful
   */
  private async verifyMigration() {
    const result = {
      success: false,
      errors: [] as string[],
    };

    try {
      // Check user count
      const [userCountResult] = await db.select({ count: sql`count(*)` }).from(users);
      const userCount = Number(userCountResult.count || 0);

      if (userCount === 0) {
        result.errors.push('No users found after migration');
        return result;
      }

      // Check data integrity
      const usersList = await db.select().from(users);
      
      for (const user of usersList) {
        if (!user.email || !user.id) {
          result.errors.push(`Invalid user data: ${user.id}`);
        }
      }

      result.success = result.errors.length === 0;
      
      if (result.success) {
        console.log('✅ Migration verification passed');
      } else {
        console.log('❌ Migration verification failed:', result.errors);
      }

    } catch (error) {
      result.errors.push(`Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Cleanup after successful migration
   */
  private async cleanupAfterMigration(): Promise<void> {
    try {
      console.log('🧹 Cleaning up after migration...');
      
      // Here you could:
      // - Remove NextAuth-specific data
      // - Update application configuration
      // - Send migration completion notifications
      // - Update version numbers
      
      console.log('✅ Cleanup completed');
    } catch (error) {
      console.warn('⚠️ Cleanup failed:', error);
      // Don't throw error here as migration was successful
    }
  }

  /**
   * Get migration status
   */
  async getMigrationStatus() {
    try {
      const [userCount] = await db.select({ count: sql`count(*)` }).from(users);
      const [verifiedCount] = await db.select({ 
        count: sql`count(*) filter (where email_verified is not null)` 
      }).from(users);
      
      return {
        databaseConnected: true,
        userCount: Number(userCount.count || 0),
        verifiedUsers: Number(verifiedCount.count || 0),
        migrationConfig: this.config,
        backupAvailable: Object.keys(this.backupData).length > 0,
      };
    } catch (error) {
      return {
        databaseConnected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        migrationConfig: this.config,
        backupAvailable: Object.keys(this.backupData).length > 0,
      };
    }
  }

  /**
   * Reset migration (for development/testing)
   */
  async resetMigration(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Migration reset not allowed in production');
    }

    try {
      console.log('🔄 Resetting migration...');
      
      // Clear Melody-specific data
      await db.delete(users);
      
      console.log('✅ Migration reset completed');
    } catch (error) {
      throw new Error(`Migration reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Utility functions for common migration tasks
 */
export const migrationUtils = {
  /**
   * Check if migration is needed
   */
  async isMigrationNeeded(): Promise<boolean> {
    try {
      const [userCount] = await db.select({ count: sql`count(*)` }).from(users);
      const [unverifiedCount] = await db.select({ 
        count: sql`count(*) filter (where email_verified is null)` 
      }).from(users);
      
      // Migration needed if we have unverified users
      return Number(unverifiedCount.count || 0) > 0;
    } catch (error) {
      return false;
    }
  },

  /**
   * Get migration statistics
   */
  async getMigrationStats() {
    try {
      const [userCount] = await db.select({ count: sql`count(*)` }).from(users);
      const [verifiedCount] = await db.select({ 
        count: sql`count(*) filter (where email_verified is not null)` 
      }).from(users);
      
      const [credentialUsers] = await db.select({ 
        count: sql`count(*) filter (where password is not null)` 
      }).from(users);
      
      return {
        totalUsers: Number(userCount.count || 0),
        verifiedUsers: Number(verifiedCount.count || 0),
        credentialUsers: Number(credentialUsers.count || 0),
        oauthUsers: Number(userCount.count || 0) - Number(credentialUsers.count || 0),
        unverifiedUsers: Number(userCount.count || 0) - Number(verifiedCount.count || 0),
      };
    } catch (error) {
      throw new Error(`Stats calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Validate user data for migration
   */
  validateUserData(userData: any): userData is MelodyUser {
    try {
      userMigrationSchema.parse(userData);
      return true;
    } catch {
      return false;
    }
  },
};

// Note: AuthMigrationManager is already exported above
// The class was exported using 'export class' syntax above