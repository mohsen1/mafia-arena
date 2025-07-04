/**
 * Runtime environment validation
 * This runs when the application starts to ensure all required environment variables are present
 */

export interface RuntimeEnvValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateRuntimeEnvironment(): RuntimeEnvValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Core requirements
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is not set');
  } else if (!process.env.DATABASE_URL.startsWith('postgresql://')) {
    errors.push('DATABASE_URL must be a PostgreSQL connection string');
  }

  if (!process.env.NEXTAUTH_URL) {
    errors.push('NEXTAUTH_URL is not set');
  }

  if (!process.env.NEXTAUTH_SECRET) {
    errors.push('NEXTAUTH_SECRET is not set');
  }

  // AI Provider requirements - at least one must be present
  const aiProviders = {
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
  };

  const availableProviders = Object.entries(aiProviders)
    .filter(([, value]) => value)
    .map(([key]) => key);

  if (availableProviders.length === 0) {
    errors.push(
      'No AI provider API keys found. At least one of GOOGLE_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY is required.'
    );
  }

  // Validate API key formats
  if (
    process.env.GROQ_API_KEY &&
    !process.env.GROQ_API_KEY.startsWith('gsk_')
  ) {
    warnings.push('GROQ_API_KEY should start with "gsk_"');
  }

  // Production-specific warnings
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.RESEND_API_KEY) {
      warnings.push(
        'RESEND_API_KEY is not set - email functionality will be disabled'
      );
    }
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      warnings.push(
        'Rate limiting is not configured (missing KV_REST_API_URL or KV_REST_API_TOKEN)'
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Throws an error if runtime environment is invalid
 * Call this early in your application initialization
 */
export function ensureRuntimeEnvironment(): void {
  const validation = validateRuntimeEnvironment();

  if (!validation.valid) {
    console.error('❌ Runtime Environment Validation Failed:\n');
    validation.errors.forEach((error) => console.error(`  • ${error}`));

    throw new Error(
      'Missing required environment variables. Please check your configuration.'
    );
  }

  if (validation.warnings.length > 0) {
    console.warn('⚠️  Runtime Environment Warnings:\n');
    validation.warnings.forEach((warning) => console.warn(`  • ${warning}`));
  }
}
