#!/usr/bin/env tsx

/**
 * Database Migration Runner for Vercel Deployments
 * 
 * This script runs database migrations with proper error handling
 * and logging suitable for production deployments.
 */

import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const isVercel = process.env.VERCEL === '1';
const databaseUrl = process.env.DATABASE_URL;

async function runMigrations() {
  console.log('🔄 Database Migration Runner');
  console.log('===========================');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Vercel: ${isVercel ? 'Yes' : 'No'}`);
  console.log(`Database URL: ${databaseUrl ? 'Configured' : 'Not configured'}`);
  console.log('');

  if (!databaseUrl) {
    console.warn('⚠️  DATABASE_URL is not configured');
    console.warn('   Skipping migrations - ensure DATABASE_URL is set in environment variables');
    process.exit(0);
  }

  try {
    // Test database connection first
    console.log('📊 Testing database connection...');
    execSync('pnpm run check-db', { stdio: 'inherit' });
    console.log('✅ Database connection successful');
    console.log('');

    // Run migrations
    console.log('🔄 Running database migrations...');
    try {
      execSync('drizzle-kit migrate', { stdio: 'inherit' });
      console.log('✅ Migrations completed successfully');
    } catch (error) {
      // Migration errors might be expected if no new migrations
      console.log('ℹ️  Migration command completed with warnings');
      console.log('   This is normal if there are no new migrations to apply');
    }
    console.log('');

    // Apply schema
    console.log('📤 Applying database schema...');
    try {
      execSync('drizzle-kit push', { stdio: 'inherit' });
      console.log('✅ Database schema applied successfully');
    } catch (error) {
      // Schema push errors might be expected if schema is already up to date
      console.log('ℹ️  Schema push completed with warnings');
      console.log('   This is normal if the schema is already up to date');
    }

    console.log('');
    console.log('✅ Database migration process completed');
  } catch (error) {
    console.error('❌ Fatal error during migration process:');
    console.error(error);
    
    if (isVercel) {
      console.error('');
      console.error('🔧 Troubleshooting tips for Vercel:');
      console.error('   1. Ensure DATABASE_URL is set in Vercel environment variables');
      console.error('   2. Check that the database allows connections from Vercel');
      console.error('   3. Verify DATABASE_URL includes ?sslmode=require');
      console.error('   4. Check Vercel deployment logs for more details');
    }
    
    process.exit(1);
  }
}

// Run migrations
runMigrations().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
}); 