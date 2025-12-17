/**
 * Melody Authentication Configuration Validation Test
 * Phase 4.1: Testing environment variable validation logic
 */

import { describe, it, expect } from 'vitest';
import { 
  serverConfig, 
  isMelodyEnabled, 
  hasNextAuthFallback, 
  getActiveAuthProvider,
  validateMelodySecrets,
  hasMelodyOAuthProvider
} from './server';

describe('Melody Authentication Configuration', () => {
  describe('Feature Flags', () => {
    it('should detect Melody authentication enabled', () => {
      expect(isMelodyEnabled()).toBe(true); // Set to true in .env
    });

    it('should detect NextAuth fallback enabled', () => {
      expect(hasNextAuthFallback()).toBe(true); // Set to true in .env
    });

    it('should determine active auth provider as Melody', () => {
      expect(getActiveAuthProvider()).toBe('melody');
    });
  });

  describe('Environment Variables', () => {
    it('should have Melody server URL configured', () => {
      expect(process.env.AUTH_SERVER_URL).toBe('http://localhost:8787');
    });

    it('should have JWT and Cookie secrets configured', () => {
      expect(process.env.AUTH_JWT_SECRET?.length).toBeGreaterThanOrEqual(32);
      expect(process.env.AUTH_COOKIE_SECRET?.length).toBeGreaterThanOrEqual(32);
    });

    it('should have OAuth client IDs configured', () => {
      expect(process.env.AUTH_GOOGLE_CLIENT_ID).toBeTruthy();
      expect(process.env.AUTH_GITHUB_CLIENT_ID).toBeTruthy();
    });

    it('should have test mode enabled', () => {
      expect(process.env.AUTH_TEST_MODE).toBe('true');
    });

    it('should have logging enabled', () => {
      expect(process.env.AUTH_LOG_ACTIVITY).toBe('true');
    });
  });

  describe('Secret Validation', () => {
    it('should validate JWT secret length', () => {
      const errors = validateMelodySecrets();
      expect(errors).not.toContain(expect.stringContaining('AUTH_JWT_SECRET'));
    });

    it('should validate cookie secret length', () => {
      const errors = validateMelodySecrets();
      expect(errors).not.toContain(expect.stringContaining('AUTH_COOKIE_SECRET'));
    });

    it('should pass all secret validation checks', () => {
      const errors = validateMelodySecrets();
      expect(errors).toHaveLength(0);
    });
  });

  describe('OAuth Provider Configuration', () => {
    it('should have Melody OAuth providers configured', () => {
      expect(hasMelodyOAuthProvider()).toBe(true);
    });

    it('should have both Google and GitHub clients', () => {
      expect(process.env.AUTH_GOOGLE_CLIENT_ID).toBeTruthy();
      expect(process.env.AUTH_GOOGLE_CLIENT_SECRET).toBeTruthy();
      expect(process.env.AUTH_GITHUB_CLIENT_ID).toBeTruthy();
      expect(process.env.AUTH_GITHUB_CLIENT_SECRET).toBeTruthy();
    });
  });

  describe('Testing Configuration', () => {
    it('should have test user credentials', () => {
      expect(process.env.AUTH_TEST_USER_EMAIL).toBe('test@werewolf-ai.dev');
      expect(process.env.AUTH_TEST_USER_PASSWORD).toBe('TestPassword123!');
    });

    it('should have metrics enabled', () => {
      expect(process.env.AUTH_METRICS_ENABLED).toBe('true');
    });

    it('should have debug log level', () => {
      expect(process.env.AUTH_LOG_LEVEL).toBe('debug');
    });
  });

  describe('Cloudflare Configuration', () => {
    it('should have Cloudflare project name', () => {
      expect(process.env.CLOUDFLARE_PROJECT_NAME).toBe('werewolf-ai-melody');
    });

    it('should have Cloudflare token configured', () => {
      expect(process.env.CLOUDFLARE_TOKEN).toBeTruthy();
    });
  });

  describe('Application Configuration', () => {
    it('should have public app URL', () => {
      expect(process.env.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000');
    });

    it('should have admin email', () => {
      expect(process.env.ADMIN_EMAIL).toBe('admin@werewolf-ai.dev');
    });
  });
});

// Test function to run validation
export async function runMelodyValidation(): Promise<{
  success: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Test feature flags
    if (!isMelodyEnabled()) {
      warnings.push('Melody authentication is not enabled');
    }

    if (!hasNextAuthFallback()) {
      errors.push('NextAuth fallback is disabled - no fallback available');
    }

    // Test OAuth configuration
    if (!hasMelodyOAuthProvider()) {
      errors.push('No Melody OAuth providers configured');
    }

    // Test secrets
    const secretErrors = validateMelodySecrets();
    errors.push(...secretErrors);

    // Test required environment variables
    const requiredVars = [
      'DATABASE_URL',
      'AUTH_JWT_SECRET',
      'AUTH_COOKIE_SECRET',
      'AUTH_SERVER_URL',
    ];

    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        errors.push(`${varName} is not configured`);
      }
    }

    // Test OAuth client configuration
    const hasGoogleAuth = !!(process.env.AUTH_GOOGLE_CLIENT_ID && process.env.AUTH_GOOGLE_CLIENT_SECRET);
    const hasGithubAuth = !!(process.env.AUTH_GITHUB_CLIENT_ID && process.env.AUTH_GITHUB_CLIENT_SECRET);

    if (!hasGoogleAuth && !hasGithubAuth) {
      warnings.push('No OAuth providers configured - only credentials auth will work');
    }

    const success = errors.length === 0;

    return {
      success,
      errors,
      warnings,
    };
  } catch (error) {
    errors.push(`Configuration validation failed: ${error}`);
    return {
      success: false,
      errors,
      warnings,
    };
  }
}

// Log validation results
if (process.env.NODE_ENV === 'development') {
  console.log('🔍 Running Melody Auth Configuration Validation...');
  
  runMelodyValidation().then((result) => {
    console.log('\n📋 Melody Auth Validation Results:');
    console.log(`✅ Status: ${result.success ? 'VALID' : 'INVALID'}`);
    
    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach(error => console.log(`  - ${error}`));
    }
    
    if (result.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      result.warnings.forEach(warning => console.log(`  - ${warning}`));
    }
    
    if (result.success) {
      console.log('\n🎉 All validations passed! Ready for Melody testing.');
    } else {
      console.log('\n🚫 Fix errors before proceeding with Melody testing.');
    }
  });
}