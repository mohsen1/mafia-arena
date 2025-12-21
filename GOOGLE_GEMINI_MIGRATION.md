# Google Gemini API Migration

**Date:** December 21, 2025  
**Status:** ✅ Complete

## Overview

Google Gemini models now use the native Google Generative AI API instead of OpenRouter. This provides:

- **Direct API access** to Google's models
- **Native JSON schema support** for structured output (100% reliable)
- **Separate billing** - Google costs are billed directly to your Google account
- **Potential cost savings** from direct API pricing

## Changes Made

### 1. New Google Provider Implementation

Created `/src/worker/ai/providers/GoogleProvider.ts`:

- Implements native Google Generative AI API v1beta
- Full JSON schema support via `responseMimeType` and `responseSchema`
- Converts internal JsonSchema format to Google's schema format
- Handles system instructions, generation config, and token counting

### 2. Updated Provider Factory

Modified `/src/worker/ai/factory.ts`:

- Routes Google models to `GoogleProvider`
- Routes other models to `OpenRouterProvider`
- Requires `GEMINI_API_KEY` for Google models
- Requires `OPENROUTER_API_KEY` for other models

### 3. Updated Model Configuration

Modified `/src/worker/ai/models.ts`:

- Changed all `google/*` models from `provider: 'openrouter'` to `provider: 'google'`
- Updated documentation to reflect multi-provider architecture
- Maintained existing pricing (Google API pricing)

### 4. Environment Configuration

Updated `/src/worker/types.ts`:

- Renamed `GOOGLE_API_KEY` to `GEMINI_API_KEY` for clarity
- Added documentation for the environment variable

Updated `/wrangler.toml`:

- Added documentation about required secrets
- Included setup instructions for `GEMINI_API_KEY`

## Required Setup

### Set the Gemini API Key

For development:

```bash
wrangler secret put GEMINI_API_KEY --env development
```

For production:

```bash
wrangler secret put GEMINI_API_KEY --env production
```

### Get Your Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create a new API key or use an existing one
3. Use the key when prompted by `wrangler secret put`

## Models Affected

All Google Gemini models now use native API:

- `google/gemini-2.5-flash-lite-preview-09-2025` - Gemini 2.5 Flash Lite
- `google/gemini-2.5-flash-preview-09-2025` - Gemini 2.5 Flash
- `google/gemini-2.5-pro` - Gemini 2.5 Pro
- `google/gemini-2.5-pro-preview-05-06` - Gemini 2.5 Pro Preview
- `google/gemini-3-flash-preview` - Gemini 3 Flash
- `google/gemini-3-pro-preview` - Gemini 3 Pro

## Model ID Format

Model IDs in the database remain unchanged (`google/gemini-*`), but internally:

- The `google/` prefix is stripped when calling the API
- Example: `google/gemini-2.5-pro` → API calls `gemini-2.5-pro`

## Benefits

### Native Schema Support

Google models now use native JSON schema enforcement:

```typescript
generationConfig: {
  responseMimeType: 'application/json',
  responseSchema: {
    type: 'object',
    properties: { ... },
    required: [ ... ]
  }
}
```

This provides:
- 100% reliable structured output (schema-level guarantee)
- No need for fallback parsing
- Cleaner, more predictable responses

### Cost Transparency

- Google costs appear on your Google Cloud billing
- OpenRouter costs appear on your OpenRouter billing
- Clear separation for cost tracking and budgeting

## Testing

All existing tests pass:

```bash
pnpm test
```

Output: ✅ 13 test files, 178 tests passed

## Rollback Plan

If needed, revert to OpenRouter:

1. In `/src/worker/ai/models.ts`, change all Google models back to:
   ```typescript
   provider: 'openrouter'
   ```

2. No other changes needed - the OpenRouter provider will handle them

## Future Enhancements

Potential improvements for later:

1. **Caching**: Use Google's context caching for repeated prompts
2. **Batch API**: Investigate Google's batch API for cost savings
3. **Model variants**: Add thinking models when available
4. **Safety settings**: Configure harm category thresholds

## Related Files

- `/src/worker/ai/providers/GoogleProvider.ts` - New Google provider
- `/src/worker/ai/providers/index.ts` - Export Google provider
- `/src/worker/ai/factory.ts` - Provider routing logic
- `/src/worker/ai/models.ts` - Model configurations
- `/src/worker/types.ts` - Environment type definitions
- `/wrangler.toml` - Configuration and secrets documentation

