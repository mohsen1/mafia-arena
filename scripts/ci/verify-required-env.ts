#!/usr/bin/env tsx

/**
 * Build-time environment validation script
 * Handles Vercel's build environment where runtime secrets are not available during build
 */

interface RequiredEnvVar {
  name: string;
  description: string;
  format?: RegExp;
  runtimeOnly?: boolean; // Variables that are only available at runtime in Vercel
}

interface RequiredProviderGroup {
  providers: RequiredEnvVar[];
  description: string;
}

// Core required environment variables
const REQUIRED_VARS: RequiredEnvVar[] = [
  {
    name: 'DATABASE_URL',
    description: 'PostgreSQL connection string',
    format: /^postgresql:\/\/.+/,
    runtimeOnly: true, // Vercel provides this at runtime, not build time
  },
  {
    name: 'NEXTAUTH_URL',
    description: 'NextAuth callback URL (required for production/preview)',
    format: /^https?:\/\/.+/,
    runtimeOnly: true, // Can be set at runtime in Vercel
  },
  {
    name: 'NEXTAUTH_SECRET',
    description: 'NextAuth encryption secret',
    runtimeOnly: true, // Should be a secret, only available at runtime
  },
];

// Required AI provider groups - at least one from each group must be present
const REQUIRED_PROVIDER_GROUPS: RequiredProviderGroup[] = [
  {
    description: 'At least one of Google/Gemini/Groq API keys is required',
    providers: [
      {
        name: 'GOOGLE_API_KEY',
        description: 'Google API key',
        format: /^[a-zA-Z0-9_-]+$/,
        runtimeOnly: true,
      },
      {
        name: 'GEMINI_API_KEY',
        description: 'Google Gemini API key',
        format: /^[a-zA-Z0-9_-]+$/,
        runtimeOnly: true,
      },
      {
        name: 'GROQ_API_KEY',
        description: 'Groq API key',
        format: /^gsk_[a-zA-Z0-9]+$/,
        runtimeOnly: true,
      },
    ],
  },
];

function validateEnvironment(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isVercel = process.env.VERCEL === '1';
  const isVercelBuild = isVercel && process.env.VERCEL_ENV !== undefined;
  const isDevelopment = process.env.NODE_ENV === 'development' && !isVercel;

  console.log('🔍 Validating required environment variables...\n');
  console.log(`Environment: ${isVercel ? 'Vercel' : isDevelopment ? 'Development' : 'Production'}`);
  console.log(`Build context: ${process.env.VERCEL_ENV || 'local'}`);
  
  if (isVercelBuild) {
    console.log('ℹ️  Note: Running in Vercel build environment.');
    console.log('   Runtime secrets are not available during build phase.\n');
  }

  // Check core required variables
  console.log('📋 Core Requirements:');
  for (const envVar of REQUIRED_VARS) {
    // Skip NEXTAUTH_URL in development
    if (envVar.name === 'NEXTAUTH_URL' && isDevelopment) {
      console.log(`  ⏭️  ${envVar.name} - Skipped (development)`);
      continue;
    }

    const value = process.env[envVar.name];
    
    // In Vercel build environment, runtime-only vars are expected to be missing
    if (isVercelBuild && envVar.runtimeOnly) {
      if (!value) {
        warnings.push(`${envVar.name} - Will need to be set in Vercel dashboard`);
        console.log(`  ⚠️  ${envVar.name} - Not available during build (set in Vercel dashboard)`);
      } else if (envVar.format && !envVar.format.test(value)) {
        warnings.push(`${envVar.name} - Invalid format detected`);
        console.log(`  ⚠️  ${envVar.name} - Set but INVALID FORMAT`);
      } else {
        console.log(`  ✅ ${envVar.name} - Set`);
      }
    } else {
      // Non-Vercel or non-runtime variables should be present
      if (!value) {
        errors.push(`Missing required: ${envVar.name} - ${envVar.description}`);
        console.log(`  ❌ ${envVar.name} - MISSING`);
      } else if (envVar.format && !envVar.format.test(value)) {
        errors.push(`Invalid format: ${envVar.name} - ${envVar.description}`);
        console.log(`  ⚠️  ${envVar.name} - INVALID FORMAT`);
      } else {
        console.log(`  ✅ ${envVar.name} - Set`);
      }
    }
  }

  // Check required provider groups
  console.log('\n🤖 AI Provider Requirements:');
  for (const group of REQUIRED_PROVIDER_GROUPS) {
    console.log(`\n${group.description}:`);
    
    let groupSatisfied = false;
    const availableProviders: string[] = [];

    for (const provider of group.providers) {
      const value = process.env[provider.name];
      
      if (isVercelBuild && provider.runtimeOnly) {
        if (value) {
          if (provider.format && !provider.format.test(value)) {
            console.log(`  ⚠️  ${provider.name} - Set but INVALID FORMAT`);
          } else {
            console.log(`  ✅ ${provider.name} - Set`);
            groupSatisfied = true;
            availableProviders.push(provider.name);
          }
        } else {
          console.log(`  ⚠️  ${provider.name} - Not available during build`);
        }
      } else {
        if (value) {
          if (provider.format && !provider.format.test(value)) {
            console.log(`  ⚠️  ${provider.name} - Set but INVALID FORMAT`);
          } else {
            console.log(`  ✅ ${provider.name} - Set`);
            groupSatisfied = true;
            availableProviders.push(provider.name);
          }
        } else {
          console.log(`  ⭕ ${provider.name} - Not set`);
        }
      }
    }

    // In Vercel build, we can't validate runtime-only provider groups
    if (isVercelBuild && group.providers.every(p => p.runtimeOnly)) {
      warnings.push(`AI Provider Keys: Ensure at least one of [${group.providers.map(p => p.name).join(', ')}] is set in Vercel dashboard`);
      console.log(`\n  ⚠️  Cannot validate AI providers during build - ensure they're set in Vercel dashboard`);
    } else if (!groupSatisfied) {
      const providerNames = group.providers.map(p => p.name).join(', ');
      errors.push(`Missing required provider: Need at least one of [${providerNames}]`);
      console.log(`\n  ❌ ERROR: No valid API key found for this group!`);
    } else if (availableProviders.length > 0) {
      console.log(`\n  ✅ Group satisfied with: ${availableProviders.join(', ')}`);
    }
  }

  // Additional warnings for production
  if (isVercel && process.env.VERCEL_ENV === 'production') {
    console.log('\n⚠️  Production Recommendations:');
    
    const recommendations = [
      { name: 'RESEND_API_KEY', desc: 'Email service' },
      { name: 'EMAIL_FROM', desc: 'From email address' },
      { name: 'KV_REST_API_URL', desc: 'Rate limiting' },
      { name: 'KV_REST_API_TOKEN', desc: 'Rate limiting' },
    ];

    for (const rec of recommendations) {
      if (!process.env[rec.name]) {
        console.log(`  ⚠️  ${rec.name} - Not set (${rec.desc})`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// Main execution
const { valid, errors, warnings } = validateEnvironment();

if (warnings.length > 0 && process.env.VERCEL === '1') {
  console.log('\n⚠️  Build Warnings:\n');
  warnings.forEach(warning => console.log(`  • ${warning}`));
  console.log('\n📝 Make sure these environment variables are configured in your Vercel project settings.');
}

if (!valid) {
  console.log('\n❌ Build Failed: Missing Required Environment Variables\n');
  errors.forEach(error => console.log(`  • ${error}`));
  console.log('\n📚 Documentation:');
  console.log('  • See env.example for all available variables');
  console.log('  • Check docs/VERCEL_ENV_CHECKLIST.md for Vercel setup');
  console.log('  • Visit https://github.com/your-repo/werewolf-ai#configuration\n');
  process.exit(1);
} else {
  if (process.env.VERCEL === '1') {
    console.log('\n✅ Build validation passed!');
    console.log('ℹ️  Runtime environment variables will be validated when the app starts.\n');
  } else {
    console.log('\n✅ All required environment variables are set!\n');
  }
  process.exit(0);
} 