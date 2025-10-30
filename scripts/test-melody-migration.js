#!/usr/bin/env node

/**
 * Melody Migration Test Script
 * Phase 3: Client-Side Authentication Components Test
 * Validates that all components are properly migrated to use unified authentication
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface TestResult {
  file: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: string;
}

const results: TestResult[] = [];

function testFile(filePath: string, expectedPatterns: string[], forbiddenPatterns?: string[]): TestResult {
  try {
    // Check if file exists
    if (!existsSync(filePath)) {
      return {
        file: filePath,
        status: 'FAIL',
        message: 'File does not exist',
      };
    }

    const content = readFileSync(filePath, 'utf-8');
    
    // Check for expected patterns
    const missingPatterns = expectedPatterns.filter(pattern => !content.includes(pattern));
    const foundForbiddenPatterns = forbiddenPatterns?.filter(pattern => content.includes(pattern)) || [];
    
    if (missingPatterns.length > 0 && foundForbiddenPatterns.length > 0) {
      return {
        file: filePath,
        status: 'FAIL',
        message: `Missing patterns: ${missingPatterns.join(', ')}; Found forbidden patterns: ${foundForbiddenPatterns.join(', ')}`,
      };
    } else if (missingPatterns.length > 0) {
      return {
        file: filePath,
        status: 'WARNING',
        message: `Missing expected patterns: ${missingPatterns.join(', ')}`,
        details: missingPatterns.join('\n- ')
      };
    } else if (foundForbiddenPatterns.length > 0) {
      return {
        file: filePath,
        status: 'FAIL',
        message: `Found forbidden patterns: ${foundForbiddenPatterns.join(', ')}`,
        details: foundForbiddenPatterns.join('\n- ')
      };
    } else {
      return {
        file: filePath,
        status: 'PASS',
        message: 'All expected patterns found, no forbidden patterns detected',
      };
    }
  } catch (error) {
    return {
      file: filePath,
      status: 'FAIL',
      message: `Failed to read file: ${error}`,
    };
  }
}

function runTests() {
  console.log('🧪 Starting Melody Migration Phase 3 Tests...\n');
  
  // Test 1: Layout Integration
  console.log('📋 Test 1: Layout Session Provider Integration');
  const layoutTest = testFile('src/app/[lang]/layout.tsx', [
    'UnifiedSessionProvider',
  ], [
    "SessionProvider from 'next-auth/react'",
  ]);
  results.push(layoutTest);
  console.log(`   ${layoutTest.status}: ${layoutTest.message}`);
  
  // Test 2: Header Component
  console.log('\n📋 Test 2: Header Component Migration');
  const headerTest = testFile('src/components/Header.tsx', [
    'useUnifiedSession',
    'signIn',
    'signOut',
  ], [
    "useSession from 'next-auth/react'",
  ]);
  results.push(headerTest);
  console.log(`   ${headerTest.status}: ${headerTest.message}`);
  
  // Test 3: Mobile Menu Component
  console.log('\n📋 Test 3: Mobile Menu Component Migration');
  const mobileMenuTest = testFile('src/components/MobileMenu.tsx', [
    'useUnifiedSession',
    'signIn',
    'signOut',
  ], [
    "useSession from 'next-auth/react'",
  ]);
  results.push(mobileMenuTest);
  console.log(`   ${mobileMenuTest.status}: ${mobileMenuTest.message}`);
  
  // Test 4: Sign In Form Component
  console.log('\n📋 Test 4: Sign In Form Component Migration');
  const signInFormTest = testFile('src/components/auth/SignInForm.tsx', [
    'useUnifiedSession',
    'isMelodyEnabled',
  ], [
    "signIn from 'next-auth/react'",
  ]);
  results.push(signInFormTest);
  console.log(`   ${signInFormTest.status}: ${signInFormTest.message}`);
  
  // Test 5: Protected Route Pages
  console.log('\n📋 Test 5: Protected Route Pages Migration');
  const protectedPages = [
    'src/app/[lang]/games/page.tsx',
    'src/app/[lang]/profile/page.tsx',
    'src/app/[lang]/new/page.tsx',
    'src/app/[lang]/character-setup/page.tsx',
    'src/app/[lang]/game/[gameId]/GameClient.tsx',
  ];
  
  protectedPages.forEach(page => {
    const pageTest = testFile(page, [
      'useUnifiedSession',
    ], [
      "useSession from 'next-auth/react'",
    ]);
    results.push(pageTest);
    console.log(`   ${pageTest.status}: ${pageTest.file} - ${pageTest.message}`);
  });
  
  // Test 6: Unified Session Provider
  console.log('\n📋 Test 6: Unified Session Provider Implementation');
  const sessionProviderTest = testFile('src/components/auth/UnifiedSessionProvider.tsx', [
    'UnifiedSessionContext',
    'useUnifiedSession',
    'useMelodySession',
    'useNextAuthSession',
  ]);
  results.push(sessionProviderTest);
  console.log(`   ${sessionProviderTest.status}: ${sessionProviderTest.message}`);
  
  // Test 7: Melody Configuration
  console.log('\n📋 Test 7: Melody Configuration Check');
  try {
    const configContent = readFileSync('src/lib/auth/config.ts', 'utf-8');
    const hasMelodyConfig = configContent.includes('melody') && configContent.includes('enableMelody');
    const hasFeatureFlags = configContent.includes('authFeatureFlags') && configContent.includes('isMelodyEnabled');
    
    const configTest: TestResult = {
      file: 'src/lib/auth/config.ts',
      status: hasMelodyConfig && hasFeatureFlags ? 'PASS' : 'FAIL',
      message: hasMelodyConfig && hasFeatureFlags ? 
        'Melody configuration and feature flags present' : 
        'Missing Melody configuration or feature flags',
    };
    results.push(configTest);
    console.log(`   ${configTest.status}: ${configTest.message}`);
  } catch (error) {
    const configTest: TestResult = {
      file: 'src/lib/auth/config.ts',
      status: 'FAIL',
      message: `Failed to check configuration: ${error}`,
    };
    results.push(configTest);
    console.log(`   ${configTest.status}: ${configTest.message}`);
  }
  
  // Generate Summary
  console.log('\n📊 TEST SUMMARY');
  console.log('=' .repeat(50));
  
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const warningCount = results.filter(r => r.status === 'WARNING').length;
  
  console.log(`✅ PASS: ${passCount}`);
  console.log(`⚠️  WARNING: ${warningCount}`);
  console.log(`❌ FAIL: ${failCount}`);
  console.log(`📈 TOTAL: ${results.length}`);
  
  if (failCount === 0) {
    console.log('\n🎉 All critical tests passed! Phase 3 migration is successful.');
  } else {
    console.log('\n💥 Some tests failed. Please review the issues above.');
  }
  
  // Detailed Results
  console.log('\n📝 DETAILED RESULTS');
  console.log('=' .repeat(50));
  results.forEach(result => {
    const icon = result.status === 'PASS' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌';
    console.log(`${icon} ${result.file}: ${result.message}`);
    if (result.details) {
      console.log(`   Details: ${result.details}`);
    }
  });
  
  return {
    passCount,
    failCount,
    warningCount,
    total: results.length,
    success: failCount === 0,
  };
}

// Run tests
const results = runTests();
process.exit(results.success ? 0 : 1);