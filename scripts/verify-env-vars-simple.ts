#!/usr/bin/env tsx

/**
 * Script to verify all required environment variables are properly set
 * Run this locally or in CI to ensure configuration is complete
 */

interface EnvVarCheck {
  name: string;
  required: boolean;
  category: string;
  description: string;
  format?: RegExp;
  environments: ('production' | 'preview' | 'development')[];
}

const envVarChecks: EnvVarCheck[] = [
  // Database
  {
    name: 'DATABASE_URL',
    required: true,
    category: 'Database',
    description: 'PostgreSQL connection string',
    format: /^postgresql:\/\/.+/,
    environments: ['production', 'preview', 'development']
  },
  
  // Authentication
  {
    name: 'NEXTAUTH_URL',
    required: true,
    category: 'Authentication',
    description: 'NextAuth callback URL',
    format: /^https?:\/\/.+/,
    environments: ['production', 'preview']
  },
  {
    name: 'NEXTAUTH_SECRET',
    required: true,
    category: 'Authentication',
    description: 'NextAuth encryption secret',
    environments: ['production', 'preview', 'development']
  },
  
  // AI Providers (at least one required)
  {
    name: 'OPENAI_API_KEY',
    required: false,
    category: 'AI Providers',
    description: 'OpenAI API key',
    environments: ['production', 'preview']
  },
  {
    name: 'ANTHROPIC_API_KEY',
    required: false,
    category: 'AI Providers',
    description: 'Anthropic API key',
    environments: ['production', 'preview']
  },
  {
    name: 'GEMINI_API_KEY',
    required: false,
    category: 'AI Providers',
    description: 'Google Gemini API key',
    environments: ['production', 'preview']
  },
  {
    name: 'GOOGLE_API_KEY',
    required: false,
    category: 'AI Providers',
    description: 'Google API key (alternative to GEMINI_API_KEY)',
    environments: ['production', 'preview']
  },
  {
    name: 'GROQ_API_KEY',
    required: false,
    category: 'AI Providers',
    description: 'Groq API key',
    environments: ['production', 'preview']
  },
  
  // OAuth Providers
  {
    name: 'GOOGLE_CLIENT_ID',
    required: false,
    category: 'OAuth',
    description: 'Google OAuth client ID',
    environments: ['production', 'preview']
  },
  {
    name: 'GOOGLE_CLIENT_SECRET',
    required: false,
    category: 'OAuth',
    description: 'Google OAuth client secret',
    environments: ['production', 'preview']
  },
  
  // TTS
  {
    name: 'ELEVENLABS_API_KEY',
    required: false,
    category: 'Text-to-Speech',
    description: 'ElevenLabs API key',
    environments: ['production', 'preview']
  },
];

function checkEnvironmentVariables() {
  console.log('\n🔍 Verifying Environment Variables\n');
  
  const currentEnv = process.env.VERCEL ? 'production' : 
                    process.env.CI ? 'preview' : 'development';
  
  console.log(`Current environment: ${currentEnv}\n`);
  
  const results = {
    required: { set: 0, missing: 0 },
    optional: { set: 0, missing: 0 },
    aiProviders: { set: 0, total: 0 }
  };
  
  const missingRequired: string[] = [];
  const invalidFormat: string[] = [];
  let lastCategory = '';
  
  for (const check of envVarChecks) {
    // Print category header
    if (check.category !== lastCategory) {
      console.log(`\n${check.category}:`);
      lastCategory = check.category;
    }
    
    const value = process.env[check.name];
    const isSet = !!value;
    const shouldCheckInEnv = check.environments.includes(currentEnv as any);
    
    // Track AI providers separately
    if (check.category === 'AI Providers') {
      results.aiProviders.total++;
      if (isSet) results.aiProviders.set++;
    }
    
    // Skip checks not relevant to current environment
    if (!shouldCheckInEnv) {
      console.log(`  ${check.name} - Not required in ${currentEnv}`);
      continue;
    }
    
    if (isSet) {
      // Check format if provided
      if (check.format && !check.format.test(value)) {
        console.log(`  ⚠️  ${check.name} - Set but invalid format`);
        invalidFormat.push(check.name);
      } else {
        console.log(`  ✅ ${check.name} - Set`);
      }
      
      if (check.required) {
        results.required.set++;
      } else {
        results.optional.set++;
      }
    } else {
      if (check.required) {
        console.log(`  ❌ ${check.name} - Missing (REQUIRED)`);
        missingRequired.push(check.name);
        results.required.missing++;
      } else {
        console.log(`  ⭕ ${check.name} - Not set (optional)`);
        results.optional.missing++;
      }
    }
  }
  
  // Summary
  console.log('\n📊 Summary:\n');
  
  console.log('Required Variables:');
  console.log(`  Set: ${results.required.set}`);
  console.log(`  Missing: ${results.required.missing}`);
  
  console.log('\nOptional Variables:');
  console.log(`  Set: ${results.optional.set}`);
  console.log(`  Missing: ${results.optional.missing}`);
  
  console.log('\nAI Providers:');
  console.log(`  Set: ${results.aiProviders.set} / ${results.aiProviders.total}`);
  
  // Validation results
  if (missingRequired.length > 0) {
    console.log('\n❌ Missing Required Variables:');
    missingRequired.forEach(name => {
      const check = envVarChecks.find(c => c.name === name);
      console.log(`  - ${name}: ${check?.description}`);
    });
  }
  
  if (invalidFormat.length > 0) {
    console.log('\n⚠️  Invalid Format:');
    invalidFormat.forEach(name => {
      const check = envVarChecks.find(c => c.name === name);
      console.log(`  - ${name}: ${check?.description}`);
    });
  }
  
  if (results.aiProviders.set === 0) {
    console.log('\n❌ No AI Provider Keys Set!');
    console.log('At least one AI provider API key is required.');
  }
  
  // Final status
  const hasAllRequired = missingRequired.length === 0;
  const hasAtLeastOneAI = results.aiProviders.set > 0;
  const hasNoFormatErrors = invalidFormat.length === 0;
  
  if (hasAllRequired && hasAtLeastOneAI && hasNoFormatErrors) {
    console.log('\n✅ All required environment variables are properly configured!\n');
    return 0;
  } else {
    console.log('\n❌ Environment configuration incomplete!\n');
    return 1;
  }
}

// Run the check
const exitCode = checkEnvironmentVariables();
process.exit(exitCode); 