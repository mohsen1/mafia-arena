#!/usr/bin/env tsx

/**
 * Build-time environment validation script
 * Fails the build if required environment variables are not set
 */

interface RequiredEnvVar {
  name: string;
  description: string;
  format?: RegExp;
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
  },
  {
    name: 'NEXTAUTH_URL',
    description: 'NextAuth callback URL (required for production/preview)',
    format: /^https?:\/\/.+/,
  },
  {
    name: 'NEXTAUTH_SECRET',
    description: 'NextAuth encryption secret',
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
      },
      {
        name: 'GEMINI_API_KEY',
        description: 'Google Gemini API key',
        format: /^[a-zA-Z0-9_-]+$/,
      },
      {
        name: 'GROQ_API_KEY',
        description: 'Groq API key',
        format: /^gsk_[a-zA-Z0-9]+$/,
      },
    ],
  },
];

function validateEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const isVercel = process.env.VERCEL === '1';
  const isDevelopment = process.env.NODE_ENV === 'development' && !isVercel;

  console.log('🔍 Validating required environment variables...\n');
  console.log(`Environment: ${isVercel ? 'Vercel' : isDevelopment ? 'Development' : 'Production'}`);
  console.log(`Build context: ${process.env.VERCEL_ENV || 'local'}\n`);

  // Check core required variables
  console.log('📋 Core Requirements:');
  for (const envVar of REQUIRED_VARS) {
    // Skip NEXTAUTH_URL in development
    if (envVar.name === 'NEXTAUTH_URL' && isDevelopment) {
      console.log(`  ⏭️  ${envVar.name} - Skipped (development)`);
      continue;
    }

    const value = process.env[envVar.name];
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

  // Check required provider groups
  console.log('\n🤖 AI Provider Requirements:');
  for (const group of REQUIRED_PROVIDER_GROUPS) {
    console.log(`\n${group.description}:`);
    
    let groupSatisfied = false;
    const availableProviders: string[] = [];

    for (const provider of group.providers) {
      const value = process.env[provider.name];
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

    if (!groupSatisfied) {
      const providerNames = group.providers.map(p => p.name).join(', ');
      errors.push(`Missing required provider: Need at least one of [${providerNames}]`);
      console.log(`\n  ❌ ERROR: No valid API key found for this group!`);
    } else {
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

  return { valid: errors.length === 0, errors };
}

// Main execution
const { valid, errors } = validateEnvironment();

if (!valid) {
  console.log('\n❌ Build Failed: Missing Required Environment Variables\n');
  errors.forEach(error => console.log(`  • ${error}`));
  console.log('\n📚 Documentation:');
  console.log('  • See env.example for all available variables');
  console.log('  • Check docs/VERCEL_ENV_CHECKLIST.md for Vercel setup');
  console.log('  • Visit https://github.com/your-repo/werewolf-ai#configuration\n');
  process.exit(1);
} else {
  console.log('\n✅ All required environment variables are set!\n');
  process.exit(0);
} 