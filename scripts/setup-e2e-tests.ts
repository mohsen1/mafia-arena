#!/usr/bin/env tsx

import { seedDevUser, DEV_USER } from './seed-dev-user';

async function setupE2ETests() {
  console.log('🚀 Setting up E2E test environment...\n');

  try {
    // Seed the development user
    await seedDevUser();
    
    console.log('');
    console.log('✅ E2E test environment setup complete!');
    console.log('');
    console.log('📋 Test credentials available:');
    console.log(`   Email: ${DEV_USER.email}`);
    console.log(`   Password: ${DEV_USER.password}`);
    console.log('');
    console.log('🎯 You can now run the E2E tests with:');
    console.log('   pnpm test:e2e');
    console.log('');

  } catch (error) {
    console.error('❌ Failed to setup E2E test environment:', error);
    process.exit(1);
  }
}

// Run the setup if this script is executed directly
if (require.main === module) {
  setupE2ETests()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { setupE2ETests }; 