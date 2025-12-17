/**
 * Melody Authentication Configuration Validation
 * Phase 4.1: Testing environment variable validation logic
 */

import { 
  serverConfig, 
  isMelodyEnabled, 
  hasNextAuthFallback, 
  getActiveAuthProvider,
  validateMelodySecrets,
  hasMelodyOAuthProvider
} from './server';

/**
 * Validate Melody Authentication Configuration
 */
export interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  config: {
    melodyEnabled: boolean;
    nextAuthFallback: boolean;
    activeProvider: 'melody' | 'nextauth';
    oauthProviders: {
      google: boolean;
      github: boolean;
    };
    secretsValid: boolean;
  };
}

/**
 * Run comprehensive validation of Melody configuration
 */
export async function validateMelodyConfiguration(): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Test feature flags
  const melodyEnabled = isMelodyEnabled();
  const nextAuthFallback = hasNextAuthFallback();
  const activeProvider = getActiveAuthProvider();

  if (!melodyEnabled) {
    warnings.push('Melody authentication is not enabled');
  }

  if (!nextAuthFallback) {
    errors.push('NextAuth fallback is disabled - no fallback available');
  }

  // Test OAuth configuration
  const hasMelodyOAuth = hasMelodyOAuthProvider();
  if (!hasMelodyOAuth) {
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

  // Validate JWT and Cookie secret lengths
  if (process.env.AUTH_JWT_SECRET && process.env.AUTH_JWT_SECRET.length < 32) {
    errors.push('AUTH_JWT_SECRET must be at least 32 characters long');
  }

  if (process.env.AUTH_COOKIE_SECRET && process.env.AUTH_COOKIE_SECRET.length < 32) {
    errors.push('AUTH_COOKIE_SECRET must be at least 32 characters long');
  }

  // Test configuration completeness
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    warnings.push('NEXT_PUBLIC_APP_URL is not configured');
  }

  if (!process.env.ADMIN_EMAIL) {
    warnings.push('ADMIN_EMAIL is not configured');
  }

  const success = errors.length === 0;

  return {
    success,
    errors,
    warnings,
    config: {
      melodyEnabled,
      nextAuthFallback,
      activeProvider,
      oauthProviders: {
        google: hasGoogleAuth,
        github: hasGithubAuth,
      },
      secretsValid: secretErrors.length === 0,
    },
  };
}

/**
 * Log validation results
 */
export function logValidationResults(result: ValidationResult): void {
  console.log('\n🔍 Melody Auth Configuration Validation Results');
  console.log('=' .repeat(50));
  
  console.log(`\n📊 Status: ${result.success ? '✅ VALID' : '❌ INVALID'}`);
  console.log(`🎵 Melody Enabled: ${result.config.melodyEnabled}`);
  console.log(`🔐 NextAuth Fallback: ${result.config.nextAuthFallback}`);
  console.log(`⚡ Active Provider: ${result.config.activeProvider}`);
  console.log(`🔑 Secrets Valid: ${result.config.secretsValid ? '✅' : '❌'}`);
  console.log(`🌐 OAuth Providers:`, {
    Google: result.config.oauthProviders.google ? '✅' : '❌',
    GitHub: result.config.oauthProviders.github ? '✅' : '❌',
  });
  
  if (result.errors.length > 0) {
    console.log('\n❌ Critical Errors:');
    result.errors.forEach(error => console.log(`  • ${error}`));
  }
  
  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    result.warnings.forEach(warning => console.log(`  • ${warning}`));
  }
  
  if (result.success) {
    console.log('\n🎉 Configuration is valid! Ready for Melody testing.');
    console.log('🚀 Next steps:');
    console.log('  1. Start Melody auth server');
    console.log('  2. Run authentication flow tests');
    console.log('  3. Test protected routes');
  } else {
    console.log('\n🚫 Fix critical errors before proceeding with Melody testing.');
  }
  
  console.log('\n' + '=' .repeat(50));
}

// Run validation in development mode
if (process.env.NODE_ENV === 'development') {
  validateMelodyConfiguration().then(logValidationResults);
}

// Export for testing
export const testValidation = validateMelodyConfiguration;