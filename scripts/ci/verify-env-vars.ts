#!/usr/bin/env tsx

/**
 * Script to verify all required environment variables are properly set
 * Run this locally or in CI to ensure configuration is complete
 */

// Mock chalk since it's a dev dependency
interface ChalkFunction {
  (s: string): string;
  bold?: ChalkFunction;
  blue?: ChalkFunction;
  red?: ChalkFunction;
  green?: ChalkFunction;
  yellow?: ChalkFunction;
  gray?: ChalkFunction;
}

const createChalkFunction = (): ChalkFunction => {
  const fn: ChalkFunction = (s: string) => s;
  return fn;
};

const chalk = {
  bold: Object.assign(createChalkFunction(), {
    blue: createChalkFunction(),
    red: createChalkFunction(),
    green: createChalkFunction(),
    yellow: createChalkFunction(),
  }),
  green: createChalkFunction(),
  red: Object.assign(createChalkFunction(), {
    bold: createChalkFunction(),
  }),
  yellow: Object.assign(createChalkFunction(), {
    bold: createChalkFunction(),
  }),
  gray: createChalkFunction(),
};

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
    format: /^sk-[a-zA-Z0-9]+$/,
    environments: ['production', 'preview']
  },
  {
    name: 'ANTHROPIC_API_KEY',
    required: false,
    category: 'AI Providers',
    description: 'Anthropic API key',
    format: /^sk-ant-[a-zA-Z0-9-]+$/,
    environments: ['production', 'preview']
  },
  {
    name: 'GEMINI_API_KEY',
    required: false,
    category: 'AI Providers',
    description: 'Google Gemini API key',
    format: /^[a-zA-Z0-9_-]+$/,
    environments: ['production', 'preview']
  },
  {
    name: 'GOOGLE_API_KEY',
    required: false,
    category: 'AI Providers',
    description: 'Google API key (alternative to GEMINI_API_KEY)',
    format: /^[a-zA-Z0-9_-]+$/,
    environments: ['production', 'preview']
  },
  {
    name: 'GROQ_API_KEY',
    required: false,
    category: 'AI Providers',
    description: 'Groq API key',
    format: /^gsk_[a-zA-Z0-9]+$/,
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
  {
    name: 'GITHUB_CLIENT_ID',
    required: false,
    category: 'OAuth',
    description: 'GitHub OAuth client ID',
    environments: ['production', 'preview']
  },
  {
    name: 'GITHUB_CLIENT_SECRET',
    required: false,
    category: 'OAuth',
    description: 'GitHub OAuth client secret',
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
  
  // Email
  {
    name: 'RESEND_API_KEY',
    required: false,
    category: 'Email',
    description: 'Resend API key for email sending',
    format: /^re_[a-zA-Z0-9]+$/,
    environments: ['production']
  },
  {
    name: 'EMAIL_FROM',
    required: false,
    category: 'Email',
    description: 'From email address',
    format: /^.+<.+@.+>$/,
    environments: ['production']
  },
  
  // Rate Limiting
  {
    name: 'KV_REST_API_URL',
    required: false,
    category: 'Rate Limiting',
    description: 'Upstash KV REST API URL',
    format: /^https:\/\/.+/,
    environments: ['production']
  },
  {
    name: 'KV_REST_API_TOKEN',
    required: false,
    category: 'Rate Limiting',
    description: 'Upstash KV REST API token',
    environments: ['production']
  },
  
  // Error Tracking
  {
    name: 'SENTRY_DSN',
    required: false,
    category: 'Error Tracking',
    description: 'Sentry DSN for error tracking',
    format: /^https:\/\/.+@.+\.ingest\.sentry\.io\/.+$/,
    environments: ['production', 'preview']
  },
  {
    name: 'SENTRY_TOKEN',
    required: false,
    category: 'Error Tracking',
    description: 'Sentry auth token for releases',
    environments: ['production', 'preview']
  },
  {
    name: 'NEXT_PUBLIC_SENTRY_DSN',
    required: false,
    category: 'Error Tracking',
    description: 'Sentry DSN for client-side error tracking',
    format: /^https:\/\/.+@.+\.ingest\.sentry\.io\/.+$/,
    environments: ['production', 'preview']
  }
];

function checkEnvironmentVariables() {
  console.log(chalk.bold.blue('\n🔍 Verifying Environment Variables\n'));
  
  const currentEnv = process.env.VERCEL ? 'production' : 
                    process.env.CI ? 'preview' : 'development';
  
  console.log(chalk.gray(`Current environment: ${currentEnv}\n`));
  
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
      console.log(chalk.bold(`\n${check.category}:`));
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
      console.log(chalk.gray(`  ${check.name} - Not required in ${currentEnv}`));
      continue;
    }
    
    if (isSet) {
      // Check format if provided
      if (check.format && !check.format.test(value)) {
        console.log(chalk.yellow(`  ⚠️  ${check.name} - Set but invalid format`));
        invalidFormat.push(check.name);
      } else {
        console.log(chalk.green(`  ✅ ${check.name} - Set`));
      }
      
      if (check.required) {
        results.required.set++;
      } else {
        results.optional.set++;
      }
    } else {
      if (check.required) {
        console.log(chalk.red(`  ❌ ${check.name} - Missing (REQUIRED)`));
        missingRequired.push(check.name);
        results.required.missing++;
      } else {
        console.log(chalk.gray(`  ⭕ ${check.name} - Not set (optional)`));
        results.optional.missing++;
      }
    }
  }
  
  // Summary
  console.log(chalk.bold.blue('\n📊 Summary:\n'));
  
  console.log(chalk.bold('Required Variables:'));
  console.log(`  Set: ${chalk.green(String(results.required.set))}`);
  console.log(`  Missing: ${chalk.red(String(results.required.missing))}`);
  
  console.log(chalk.bold('\nOptional Variables:'));
  console.log(`  Set: ${chalk.green(String(results.optional.set))}`);
  console.log(`  Missing: ${chalk.gray(String(results.optional.missing))}`);
  
  console.log(chalk.bold('\nAI Providers:'));
  console.log(`  Set: ${chalk.green(String(results.aiProviders.set))} / ${results.aiProviders.total}`);
  
  // Validation results
  if (missingRequired.length > 0) {
    console.log(chalk.red.bold('\n❌ Missing Required Variables:'));
    missingRequired.forEach(name => {
      const check = envVarChecks.find(c => c.name === name);
      console.log(chalk.red(`  - ${name}: ${check?.description}`));
    });
  }
  
  if (invalidFormat.length > 0) {
    console.log(chalk.yellow.bold('\n⚠️  Invalid Format:'));
    invalidFormat.forEach(name => {
      const check = envVarChecks.find(c => c.name === name);
      console.log(chalk.yellow(`  - ${name}: ${check?.description}`));
    });
  }
  
  if (results.aiProviders.set === 0) {
    console.log(chalk.red.bold('\n❌ No AI Provider Keys Set!'));
    console.log(chalk.red('At least one AI provider API key is required.'));
  }
  
  // Final status
  const hasAllRequired = missingRequired.length === 0;
  const hasAtLeastOneAI = results.aiProviders.set > 0;
  const hasNoFormatErrors = invalidFormat.length === 0;
  
  if (hasAllRequired && hasAtLeastOneAI && hasNoFormatErrors) {
    console.log(chalk.green.bold ? chalk.green.bold('\n✅ All required environment variables are properly configured!\n') : '\n✅ All required environment variables are properly configured!\n');
    return 0;
  } else {
    console.log(chalk.red.bold ? chalk.red.bold('\n❌ Environment configuration incomplete!\n') : '\n❌ Environment configuration incomplete!\n');
    return 1;
  }
}

// Run the check
const exitCode = checkEnvironmentVariables();
process.exit(exitCode); 