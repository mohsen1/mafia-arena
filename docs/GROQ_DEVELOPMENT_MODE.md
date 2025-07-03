# Groq Development Mode

## Overview

In development mode, Werewolf AI automatically prioritizes Groq as the default AI provider for faster development iterations. This feature helps developers by:

1. **Automatically selecting Groq** as the primary AI provider when available
2. **Using the fastest Groq model** (Llama 3.1 8B Instant) for quick responses
3. **Applying Groq to both regular and Mafia agents** for consistency
4. **Showing a "DEV" badge** in the UI to indicate development mode

## Configuration

### Default Behavior

When `NODE_ENV=development` and Groq is available (either through environment variables or user API keys), the system will:

- Sort Groq to the top of the provider list
- Auto-select Groq for both global and Mafia-specific AI configurations
- Use `llama-3.1-8b-instant` as the default model for fastest performance

### Disabling Groq Development Mode

If you prefer to manually select AI providers in development, you can disable this feature by setting:

```bash
NEXT_PUBLIC_DISABLE_GROQ_DEV_MODE=true
```

Add this to your `.env.local` file to permanently disable the feature during development.

## Visual Indicators

When Groq is auto-selected in development mode, you'll see:

- A "DEV" badge next to the Groq provider in the dropdown
- Console log: `[SimpleStartGameForm] Development mode: Auto-selecting Groq provider`

## Benefits

1. **Faster Development**: Groq's high-speed inference reduces wait times during testing
2. **Cost Efficiency**: Groq offers competitive pricing for development use
3. **Consistency**: Ensures all developers use the same AI provider for reproducible results

## Requirements

To use this feature, you need:

1. A valid Groq API key (set as `GROQ_API_KEY` environment variable or added through the user profile)
2. Development environment (`NODE_ENV=development`)

## Technical Details

The feature is implemented in:

- `src/lib/utils/providerUtils.ts`: Provider sorting logic
- `src/components/SimpleStartGameForm.tsx`: Auto-selection logic
- `src/components/EnhancedProviderModelSelector.tsx`: Visual indicators

This feature only affects development mode and has no impact on production deployments. 