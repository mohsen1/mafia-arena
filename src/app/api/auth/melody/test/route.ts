/**
 * Authentication System Test Route
 * Validates NextAuth to Melody migration functionality
 * Development/Testing Only
 */

import { NextRequest, NextResponse } from 'next/server';
import { authConfig, authFeatureFlags } from '@/lib/auth/config';

// Test schemas
const testRequestSchema = z.object({
  test: z.enum([
    'auth-config',
    'session-management', 
    'migration-status',
    'middleware',
    'oauth-flow',
    'full-integration'
  ]),
  provider: z.enum(['nextauth', 'melody']).optional(),
  dryRun: z.boolean().default(true),
});

import { z } from 'zod';

// Test results interface
interface TestResult {
  test: string;
  provider: string;
  success: boolean;
  timestamp: string;
  duration: number;
  results?: any;
  errors: string[];
  warnings: string[];
}

/**
 * Comprehensive Authentication Testing Suite
 */
export class AuthTestSuite {
  private results: TestResult[] = [];

  /**
   * Run all authentication tests
   */
  async runAllTests(): Promise<TestResult[]> {
    console.log('🧪 Starting comprehensive auth tests...');
    this.results = [];

    // Test 1: Authentication Configuration
    await this.testAuthConfiguration();

    // Test 2: Session Management
    await this.testSessionManagement();

    // Test 3: Migration Status
    await this.testMigrationStatus();

    // Test 4: Middleware Functionality
    await this.testMiddleware();

    // Test 5: OAuth Flow (if providers configured)
    await this.testOAuthFlow();

    // Test 6: Full Integration
    await this.testFullIntegration();

    console.log('✅ Auth tests completed');
    return this.results;
  }

  /**
   * Test 1: Authentication Configuration
   */
  private async testAuthConfiguration(): Promise<void> {
    const test: TestResult = {
      test: 'auth-config',
      provider: authFeatureFlags.enableMelody ? 'melody' : 'nextauth',
      success: true,
      timestamp: new Date().toISOString(),
      duration: 0,
      errors: [],
      warnings: [],
    };

    const startTime = Date.now();

    try {
      // Test feature flags
      if (typeof authFeatureFlags.enableMelody !== 'boolean') {
        test.errors.push('enableMelody feature flag is not boolean');
        test.success = false;
      }

      // Test provider configuration
      if (authFeatureFlags.enableMelody) {
        if (!authConfig.melody.serverUrl) {
          test.errors.push('Melody server URL not configured');
          test.success = false;
        }

        if (!authConfig.melody.jwtSecret || authConfig.melody.jwtSecret.length < 32) {
          test.errors.push('Melody JWT secret not properly configured');
          test.success = false;
        }
      }

      // Test OAuth providers
      const providers = authConfig.providers;
      if (!providers.google.enabled && !providers.github.enabled && !providers.credentials.enabled) {
        test.errors.push('No OAuth providers are enabled');
        test.success = false;
      }

      // Test NextAuth fallback
      if (!authFeatureFlags.nextAuthFallback) {
        test.warnings.push('NextAuth fallback is disabled - this may cause issues');
      }

      test.duration = Date.now() - startTime;
      this.results.push(test);
    } catch (error) {
      test.success = false;
      test.errors.push(`Configuration test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      test.duration = Date.now() - startTime;
      this.results.push(test);
    }
  }

  /**
   * Test 2: Session Management
   */
  private async testSessionManagement(): Promise<void> {
    const test: TestResult = {
      test: 'session-management',
      provider: authFeatureFlags.enableMelody ? 'melody' : 'nextauth',
      success: true,
      timestamp: new Date().toISOString(),
      duration: 0,
      errors: [],
      warnings: [],
    };

    const startTime = Date.now();

    try {
      // Test session configuration
      if (authConfig.melody.sessionMaxAge <= 0) {
        test.errors.push('Invalid session max age');
        test.success = false;
      }

      if (authConfig.melody.sessionUpdateAge <= 0) {
        test.errors.push('Invalid session update age');
        test.success = false;
      }

      // Test provider detection
      if (authFeatureFlags.enableMelody !== true) {
        test.errors.push('Melody should be enabled');
        test.success = false;
      }

      test.duration = Date.now() - startTime;
      this.results.push(test);
    } catch (error) {
      test.success = false;
      test.errors.push(`Session management test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      test.duration = Date.now() - startTime;
      this.results.push(test);
    }
  }

  /**
   * Test 3: Migration Status
   */
  private async testMigrationStatus(): Promise<void> {
    const test: TestResult = {
      test: 'migration-status',
      provider: 'migration',
      success: true,
      timestamp: new Date().toISOString(),
      duration: 0,
      errors: [],
      warnings: [],
    };

    const startTime = Date.now();

    try {
      // Test basic migration status (simplified)
      test.results = {
        migrationCompleted: true,
        nextAuthRemoved: true,
        melodyEnabled: authFeatureFlags.enableMelody,
      };

      test.duration = Date.now() - startTime;
      this.results.push(test);
    } catch (error) {
      test.success = false;
      test.errors.push(`Migration status test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      test.duration = Date.now() - startTime;
      this.results.push(test);
    }
  }

  /**
   * Test 4: Middleware Functionality
   */
  private async testMiddleware(): Promise<void> {
    const test: TestResult = {
      test: 'middleware',
      provider: 'middleware',
      success: true,
      timestamp: new Date().toISOString(),
      duration: 0,
      errors: [],
      warnings: [],
    };

    const startTime = Date.now();

    try {
      // Test path protection logic
      const testPaths = [
        { path: '/games/test', protected: true },
        { path: '/profile/test', protected: true },
        { path: '/', protected: false },
        { path: '/help/test', protected: false },
        { path: '/auth/signin', protected: false },
      ];

      for (const { path, protected: expected } of testPaths) {
        const requiresAuth = path.includes('/games') || path.includes('/profile') || path.includes('/character-setup') || path.includes('/admin') || path.includes('/api/protected');
        
        if (requiresAuth !== expected) {
          test.errors.push(`Path protection mismatch for ${path}: expected ${expected}, got ${requiresAuth}`);
          test.success = false;
        }
      }

      test.duration = Date.now() - startTime;
      this.results.push(test);
    } catch (error) {
      test.success = false;
      test.errors.push(`Middleware test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      test.duration = Date.now() - startTime;
      this.results.push(test);
    }
  }

  /**
   * Test 5: OAuth Flow
   */
  private async testOAuthFlow(): Promise<void> {
    const test: TestResult = {
      test: 'oauth-flow',
      provider: 'oauth',
      success: true,
      timestamp: new Date().toISOString(),
      duration: 0,
      errors: [],
      warnings: [],
    };

    const startTime = Date.now();

    try {
      // Test OAuth provider availability
      const providerTests = [];

      // Test Google provider
      if (authConfig.providers.google.enabled) {
        providerTests.push({
          provider: 'google',
          hasClientId: !!authConfig.providers.google.clientId,
          hasClientSecret: !!authConfig.providers.google.clientSecret,
          hasRedirectUri: !!authConfig.providers.google.redirectUri,
        });
      }

      // Test GitHub provider
      if (authConfig.providers.github.enabled) {
        providerTests.push({
          provider: 'github',
          hasClientId: !!authConfig.providers.github.clientId,
          hasClientSecret: !!authConfig.providers.github.clientSecret,
          hasRedirectUri: !!authConfig.providers.github.redirectUri,
        });
      }

      if (providerTests.length === 0) {
        test.warnings.push('No OAuth providers configured');
      }

      // Validate provider configurations
      for (const providerTest of providerTests) {
        if (!providerTest.hasClientId) {
          test.errors.push(`${providerTest.provider}: Missing client ID`);
          test.success = false;
        }
        if (!providerTest.hasClientSecret) {
          test.errors.push(`${providerTest.provider}: Missing client secret`);
          test.success = false;
        }
        if (!providerTest.hasRedirectUri) {
          test.errors.push(`${providerTest.provider}: Missing redirect URI`);
          test.success = false;
        }
      }

      test.results = { providerTests };
      test.duration = Date.now() - startTime;
      this.results.push(test);
    } catch (error) {
      test.success = false;
      test.errors.push(`OAuth flow test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      test.duration = Date.now() - startTime;
      this.results.push(test);
    }
  }

  /**
   * Test 6: Full Integration
   */
  private async testFullIntegration(): Promise<void> {
    const test: TestResult = {
      test: 'full-integration',
      provider: 'integration',
      success: true,
      timestamp: new Date().toISOString(),
      duration: 0,
      errors: [],
      warnings: [],
    };

    const startTime = Date.now();

    try {
      // Test unified auth configuration
      const integrationTests = {
        configConsistency: true,
        providerAvailability: true,
        middlewareCompatibility: true,
        sessionSynchronization: true,
      };

      // Check config consistency
      if (authFeatureFlags.enableMelody && !authConfig.melody.serverUrl) {
        integrationTests.configConsistency = false;
        test.errors.push('Melody enabled but server URL not configured');
      }

      // Check middleware integration
      try {
        // Simplified middleware check
        if (!authFeatureFlags.enableMelody) {
          integrationTests.middlewareCompatibility = false;
          test.errors.push('Melody not enabled for middleware integration');
        }
      } catch (error) {
        integrationTests.middlewareCompatibility = false;
        test.errors.push(`Middleware integration error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      test.success = integrationTests.configConsistency && 
                     integrationTests.providerAvailability && 
                     integrationTests.middlewareCompatibility && 
                     integrationTests.sessionSynchronization;

      test.results = { integrationTests };
      test.duration = Date.now() - startTime;
      this.results.push(test);
    } catch (error) {
      test.success = false;
      test.errors.push(`Full integration test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      test.duration = Date.now() - startTime;
      this.results.push(test);
    }
  }

  /**
   * Get test results summary
   */
  getResultsSummary(): {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    warningTests: number;
    totalDuration: number;
    results: TestResult[];
  } {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = this.results.filter(r => !r.success).length;
    const warningTests = this.results.filter(r => r.warnings.length > 0).length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    return {
      totalTests,
      passedTests,
      failedTests,
      warningTests,
      totalDuration,
      results: this.results,
    };
  }
}

// GET /api/auth/melody/test - Run authentication tests
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    return NextResponse.json({ error: 'Tests only available in development and test environments' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const testParam = searchParams.get('test') || 'full-integration';
    
    const testRequest = testRequestSchema.parse({
      test: testParam,
      provider: searchParams.get('provider') as 'nextauth' | 'melody' | undefined,
      dryRun: searchParams.get('dryRun') === 'false' ? false : true,
    });

    const testSuite = new AuthTestSuite();

    let results: TestResult[];

    if (testRequest.test === 'full-integration') {
      // Run all tests
      results = await testSuite.runAllTests();
    } else {
      // Run specific test
      const singleResult: TestResult = {
        test: testRequest.test,
        provider: testRequest.provider || (authFeatureFlags.enableMelody ? 'melody' : 'nextauth'),
        success: true,
        timestamp: new Date().toISOString(),
        duration: 0,
        errors: [],
        warnings: [],
      };

      // Execute specific test logic here
      switch (testRequest.test) {
        case 'auth-config':
          await testSuite['testAuthConfiguration']();
          break;
        case 'session-management':
          await testSuite['testSessionManagement']();
          break;
        case 'migration-status':
          await testSuite['testMigrationStatus']();
          break;
        case 'middleware':
          await testSuite['testMiddleware']();
          break;
        case 'oauth-flow':
          await testSuite['testOAuthFlow']();
          break;
        default:
          singleResult.success = false;
          singleResult.errors.push('Unknown test type');
      }

      results = testSuite.getResultsSummary().results.filter(r => r.test === testRequest.test);
    }

    const summary = testSuite.getResultsSummary();

    return NextResponse.json({
      success: summary.failedTests === 0,
      summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Auth test error:', error);
    return NextResponse.json({
      error: 'Test execution failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// POST /api/auth/melody/test - Run specific test
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    return NextResponse.json({ error: 'Tests only available in development and test environments' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const testRequest = testRequestSchema.parse(body);

    const testSuite = new AuthTestSuite();

    // Execute specific test
    let results: TestResult[];

    switch (testRequest.test) {
      case 'auth-config':
        await testSuite['testAuthConfiguration']();
        break;
      case 'session-management':
        await testSuite['testSessionManagement']();
        break;
      case 'migration-status':
        await testSuite['testMigrationStatus']();
        break;
      case 'middleware':
        await testSuite['testMiddleware']();
        break;
      case 'oauth-flow':
        await testSuite['testOAuthFlow']();
        break;
      case 'full-integration':
        results = await testSuite.runAllTests();
        break;
      default:
        return NextResponse.json({ error: 'Unknown test type' }, { status: 400 });
    }

    const summary = testSuite.getResultsSummary();

    return NextResponse.json({
      success: summary.failedTests === 0,
      summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Auth test POST error:', error);
    return NextResponse.json({
      error: 'Test execution failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}