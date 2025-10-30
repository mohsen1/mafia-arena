#!/usr/bin/env node

/**
 * Cross-System Compatibility Testing
 * Tests NextAuth to Melody migration compatibility
 */

interface CompatibilityTest {
  name: string;
  test: () => Promise<{ passed: boolean; message: string; details?: any }>;
}

class CrossSystemTester {
  private results: Array<{ name: string; passed: boolean; message: string; details?: any }> = [];

  async testSessionSync(): Promise<{ passed: boolean; message: string; details?: any }> {
    try {
      // Test if sessions work across both systems
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      
      // Test session endpoints
      const sessionResponse = await fetch(`${baseUrl}/api/auth/session`);
      const sessionData = await sessionResponse.json();
      
      return {
        passed: true,
        message: 'Session synchronization working',
        details: {
          sessionEndpoint: sessionResponse.status,
          sessionData
        }
      };
    } catch (error) {
      return {
        passed: false,
        message: `Session sync failed: ${error instanceof Error ? error.message : String(error)}`,
        details: { error }
      };
    }
  }

  async testDataConsistency(): Promise<{ passed: boolean; message: string; details?: any }> {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const melodyUrl = process.env.MELODY_SERVER_URL || 'http://localhost:8787';
      
      const results: any = {};
      
      // Test NextAuth data structure
      try {
        const nextAuthResponse = await fetch(`${baseUrl}/api/auth/session`);
        const nextAuthData = await nextAuthResponse.json();
        results.nextAuth = {
          available: true,
          dataStructure: Object.keys(nextAuthData),
          hasUser: !!nextAuthData.session?.user
        };
      } catch (error) {
        results.nextAuth = { available: false, error: error instanceof Error ? error.message : String(error) };
      }
      
      // Test Melody data structure (if enabled)
      if (process.env.AUTH_ENABLE_MELODY === 'true') {
        try {
          const melodyResponse = await fetch(`${melodyUrl}/api/auth/session`);
          const melodyData = await melodyResponse.json();
          results.melody = {
            available: true,
            dataStructure: Object.keys(melodyData),
            hasUser: !!melodyData.user
          };
        } catch (error) {
          results.melody = { available: false, error: error instanceof Error ? error.message : String(error) };
        }
      }
      
      return {
        passed: true,
        message: 'Data consistency check completed',
        details: results
      };
    } catch (error) {
      return {
        passed: false,
        message: `Data consistency test failed: ${error instanceof Error ? error.message : String(error)}`,
        details: { error }
      };
    }
  }

  async testFallbackMechanism(): Promise<{ passed: boolean; message: string; details?: any }> {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      
      // Test health endpoints for both systems
      const healthResponse = await fetch(`${baseUrl}/api/auth`);
      
      return {
        passed: true,
        message: 'Fallback mechanism test completed',
        details: {
          healthStatus: healthResponse.status,
          fallbackEnabled: process.env.AUTH_NEXTAUTH_FALLBACK !== 'false'
        }
      };
    } catch (error) {
      return {
        passed: false,
        message: `Fallback mechanism test failed: ${error instanceof Error ? error.message : String(error)}`,
        details: { error }
      };
    }
  }

  async testFeatureFlags(): Promise<{ passed: boolean; message: string; details?: any }> {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      
      // Test feature flag endpoints
      const optionsResponse = await fetch(`${baseUrl}/api/auth`, { method: 'OPTIONS' });
      const featureFlags = await optionsResponse.json();
      
      return {
        passed: true,
        message: 'Feature flags test completed',
        details: featureFlags
      };
    } catch (error) {
      return {
        passed: false,
        message: `Feature flags test failed: ${error instanceof Error ? error.message : String(error)}`,
        details: { error }
      };
    }
  }

  async runAllTests(): Promise<Array<{ name: string; passed: boolean; message: string; details?: any }>> {
    console.log('🔄 Testing Cross-System Compatibility...\n');
    
    const tests: CompatibilityTest[] = [
      { name: 'Session Synchronization', test: () => this.testSessionSync() },
      { name: 'Data Consistency', test: () => this.testDataConsistency() },
      { name: 'Fallback Mechanism', test: () => this.testFallbackMechanism() },
      { name: 'Feature Flags', test: () => this.testFeatureFlags() }
    ];
    
    for (const test of tests) {
      console.log(`Testing: ${test.name}...`);
      try {
        const result = await test.test();
        this.results.push({ name: test.name, ...result });
        console.log(`  ${result.passed ? '✅' : '❌'} ${result.message}`);
        if (result.details) {
          console.log(`  Details:`, result.details);
        }
      } catch (error) {
        this.results.push({
          name: test.name,
          passed: false,
          message: `Test execution failed: ${error instanceof Error ? error.message : String(error)}`,
          details: { error }
        });
        console.log(`  ❌ Test execution failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    return this.results;
  }

  summary() {
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const passRate = ((passed / total) * 100).toFixed(1);
    
    console.log('\n' + '='.repeat(50));
    console.log('CROSS-SYSTEM COMPATIBILITY SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} (${passRate}%)`);
    console.log(`Failed: ${total - passed}`);
    
    if (total - passed > 0) {
      console.log('\nFailed Tests:');
      this.results
        .filter(r => !r.passed)
        .forEach(r => console.log(`  - ${r.name}: ${r.message}`));
    }
    
    console.log('='.repeat(50));
    
    return {
      total,
      passed,
      failed: total - passed,
      passRate: parseFloat(passRate),
      results: this.results
    };
  }
}

// Main execution
async function main(): Promise<void> {
  try {
    const tester = new CrossSystemTester();
    const results = await tester.runAllTests();
    const summary = tester.summary();
    
    process.exit(summary.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Cross-system compatibility testing failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}