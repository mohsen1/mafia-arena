/**
 * ModelRegistry - Centralized model metadata lookup with caching.
 * 
 * Replaces brittle string parsing with database-driven configuration.
 * This is the single source of truth for model routing and pricing.
 * 
 * FEATURES:
 * - Request-scoped caching (Workers are ephemeral)
 * - Test model interception (returns synthetic context)
 * - OpenRouter fallback for unknown models
 * - Safe JSON parsing with defaults
 */

import type { ModelContext, ModelPricing, BatchPricingConfig, StructuredOutputLevel } from '../ai/types.js';
import type { ApiProvider } from '../types.js';
import type { BatchProvider } from '../batch/types.js';
import { isTestModel } from '../ai/providers/MockE2EProvider.js';
import { DEFAULT_PRICING } from '../ai/models.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default context length for unknown models (conservative) */
const DEFAULT_CONTEXT_LENGTH = 8192;

/**
 * Providers that support batch APIs and their discount percentages.
 * Used when deriving batch pricing from apiProvider.
 */
const BATCH_PROVIDER_MAP: Record<string, { provider: BatchProvider; discount: number }> = {
  anthropic: { provider: 'anthropic', discount: 50 },
  openai: { provider: 'openai', discount: 50 },
  google: { provider: 'google', discount: 50 },
  cerebras: { provider: 'cerebras', discount: 50 },
  fireworks: { provider: 'fireworks', discount: 40 },
};

/**
 * Known direct API providers that can be inferred from model ID prefix.
 * When a model is not in the database but its prefix matches one of these,
 * we route to that provider instead of defaulting to OpenRouter.
 */
const DIRECT_PROVIDERS = new Set<ApiProvider>([
  'openai', 'anthropic', 'google', 'cerebras', 'fireworks', 
  'minimax', 'xai', 'deepseek', 'together', 'groq', 
  'sambanova', 'hyperbolic', 'mistral', 'cohere', 'ai21',
]);

// =============================================================================
// DB RECORD TYPE
// =============================================================================

/**
 * Raw model record from D1 database.
 * Matches the schema in db/schema.ts
 */
interface ModelDbRecord {
  id: string;
  family: string;
  display_name: string;
  api_provider: string | null;
  api_model_id: string | null;
  config: string | null;
  supports_batch_pricing: number | null;
  elo_rating: number | null;
  created_at: number;
}

/**
 * Parsed config JSON from database.
 */
interface ModelConfigJson {
  contextLength?: number;
  pricing?: {
    inputPer1K?: number;
    outputPer1K?: number;
    cachedInputPer1K?: number;
    imageInputPer1K?: number;
  };
  maxOutputTokens?: number;
  structuredOutput?: StructuredOutputLevel;
}

// =============================================================================
// MODEL REGISTRY
// =============================================================================

/**
 * ModelRegistry - Centralized model metadata service.
 * 
 * Usage:
 * ```typescript
 * const registry = new ModelRegistry(env.DB);
 * const model = await registry.get('google/gemini-2.0-flash');
 * const provider = createProviderFromContext(model, env);
 * ```
 */
export class ModelRegistry {
  /** Request-scoped cache to prevent duplicate D1 lookups */
  private cache = new Map<string, ModelContext>();
  
  constructor(private readonly db: D1Database) {}

  /**
   * Get model context by ID.
   * 
   * Resolution order:
   * 1. Return from cache if present
   * 2. Return synthetic context for test models
   * 3. Lookup in D1 database
   * 4. Fall back to OpenRouter passthrough
   */
  async get(modelId: string): Promise<ModelContext> {
    // 1. Check cache
    const cached = this.cache.get(modelId);
    if (cached) {
      return cached;
    }

    // 2. Handle test models (no DB lookup needed)
    if (isTestModel(modelId)) {
      const ctx = this.createTestContext(modelId);
      this.cache.set(modelId, ctx);
      return ctx;
    }

    // 3. Lookup in D1
    const record = await this.fetchFromDb(modelId);
    if (record) {
      const ctx = this.mapRecordToContext(record);
      this.cache.set(modelId, ctx);
      return ctx;
    }

    // 4. Fallback to OpenRouter passthrough
    const fallback = this.createFallbackContext(modelId);
    this.cache.set(modelId, fallback);
    return fallback;
  }

  /**
   * Get multiple model contexts at once.
   * More efficient than individual lookups due to batch D1 query.
   */
  async getMany(modelIds: readonly string[]): Promise<Map<string, ModelContext>> {
    const results = new Map<string, ModelContext>();
    const uncachedIds: string[] = [];

    // Separate cached from uncached
    for (const id of modelIds) {
      const cached = this.cache.get(id);
      if (cached) {
        results.set(id, cached);
      } else if (isTestModel(id)) {
        const ctx = this.createTestContext(id);
        this.cache.set(id, ctx);
        results.set(id, ctx);
      } else {
        uncachedIds.push(id);
      }
    }

    // Batch fetch uncached from D1
    if (uncachedIds.length > 0) {
      const records = await this.fetchManyFromDb(uncachedIds);
      
      for (const id of uncachedIds) {
        const record = records.get(id);
        const ctx = record 
          ? this.mapRecordToContext(record)
          : this.createFallbackContext(id);
        
        this.cache.set(id, ctx);
        results.set(id, ctx);
      }
    }

    return results;
  }

  /**
   * Pre-warm cache for a list of model IDs.
   * Call at workflow/request start for optimal performance.
   */
  async warmCache(modelIds: readonly string[]): Promise<void> {
    await this.getMany(modelIds);
  }

  /**
   * Clear the cache (useful for testing).
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ===========================================================================
  // PRIVATE: Database Operations
  // ===========================================================================

  private async fetchFromDb(modelId: string): Promise<ModelDbRecord | null> {
    try {
      const result = await this.db
        .prepare('SELECT * FROM models WHERE id = ?')
        .bind(modelId)
        .first<ModelDbRecord>();
      return result;
    } catch (error) {
      console.warn(`[ModelRegistry] Failed to fetch model ${modelId}:`, error);
      return null;
    }
  }

  private async fetchManyFromDb(modelIds: string[]): Promise<Map<string, ModelDbRecord>> {
    const results = new Map<string, ModelDbRecord>();
    
    if (modelIds.length === 0) {
      return results;
    }

    try {
      // D1 doesn't support array binding, so we build the query with placeholders
      const placeholders = modelIds.map(() => '?').join(', ');
      const query = `SELECT * FROM models WHERE id IN (${placeholders})`;
      
      const { results: records } = await this.db
        .prepare(query)
        .bind(...modelIds)
        .all<ModelDbRecord>();

      for (const record of records) {
        results.set(record.id, record);
      }
    } catch (error) {
      console.warn(`[ModelRegistry] Failed to batch fetch models:`, error);
    }

    return results;
  }

  // ===========================================================================
  // PRIVATE: Context Creation
  // ===========================================================================

  /**
   * Map a database record to ModelContext.
   */
  private mapRecordToContext(record: ModelDbRecord): ModelContext {
    // Parse config JSON safely
    const config = this.parseConfig(record.config);
    
    // Extract pricing
    const pricing = this.extractPricing(config);
    
    // Determine batch pricing from apiProvider or DB flag
    const apiProvider = (record.api_provider || 'openrouter') as ApiProvider;
    const batchPricing = this.deriveBatchPricing(apiProvider, record.supports_batch_pricing);
    
    const context: ModelContext = {
      id: record.id,
      family: record.family || this.extractFamily(record.id),
      displayName: record.display_name || this.extractDisplayName(record.id),
      apiProvider,
      apiModelId: record.api_model_id || record.id,
      pricing,
      batchPricing,
      contextLength: config.contextLength ?? DEFAULT_CONTEXT_LENGTH,
      structuredOutput: config.structuredOutput ?? 'json_mode',
      isTest: false,
    };
    
    // Only add maxOutputTokens if defined (exactOptionalPropertyTypes)
    if (config.maxOutputTokens !== undefined) {
      context.maxOutputTokens = config.maxOutputTokens;
    }
    
    return context;
  }

  /**
   * Create synthetic context for test models.
   */
  private createTestContext(modelId: string): ModelContext {
    return {
      id: modelId,
      family: 'test',
      displayName: modelId.split('/')[1] || modelId,
      apiProvider: 'openrouter', // Not used for test models
      apiModelId: modelId,
      pricing: { input: 0, output: 0 },
      batchPricing: { supported: false, discountPercent: 0, batchProvider: null },
      contextLength: 128000, // Large enough for any test
      structuredOutput: 'json_mode',
      isTest: true,
    };
  }

  /**
   * Create fallback context for unknown models.
   * 
   * If the model ID prefix matches a known direct provider (e.g., "fireworks/"),
   * we route to that provider. Otherwise, we default to OpenRouter.
   * 
   * This prevents issues where a model like "fireworks/glm-4p7" exists in code
   * but not in D1, and would incorrectly be routed to OpenRouter.
   */
  private createFallbackContext(modelId: string): ModelContext {
    const family = this.extractFamily(modelId);
    const displayName = this.extractDisplayName(modelId);
    
    // Check if the prefix matches a known direct provider
    // e.g., "fireworks/glm-4p7" -> apiProvider: "fireworks", apiModelId: "glm-4p7"
    let apiProvider: ApiProvider = 'openrouter';
    let apiModelId = modelId;
    
    if (DIRECT_PROVIDERS.has(family as ApiProvider)) {
      apiProvider = family as ApiProvider;
      // For direct providers, use the display name (part after the prefix)
      // e.g., "fireworks/glm-4p7" -> "glm-4p7"
      apiModelId = displayName;
    }
    
    return {
      id: modelId,
      family,
      displayName,
      apiProvider,
      apiModelId,
      pricing: DEFAULT_PRICING,
      batchPricing: { supported: false, discountPercent: 0, batchProvider: null },
      contextLength: DEFAULT_CONTEXT_LENGTH,
      structuredOutput: 'json_mode',
      isTest: false,
    };
  }

  // ===========================================================================
  // PRIVATE: Parsing Helpers
  // ===========================================================================

  private parseConfig(configJson: string | null): ModelConfigJson {
    if (!configJson) {
      return {};
    }
    
    try {
      return JSON.parse(configJson) as ModelConfigJson;
    } catch {
      console.warn('[ModelRegistry] Failed to parse config JSON');
      return {};
    }
  }

  private extractPricing(config: ModelConfigJson): ModelPricing {
    const pricing = config.pricing;
    
    const result: ModelPricing = {
      input: pricing?.inputPer1K ?? DEFAULT_PRICING.input,
      output: pricing?.outputPer1K ?? DEFAULT_PRICING.output,
    };
    
    // Only add optional fields if defined (exactOptionalPropertyTypes)
    if (pricing?.cachedInputPer1K !== undefined) {
      result.cachedInput = pricing.cachedInputPer1K;
    }
    if (pricing?.imageInputPer1K !== undefined) {
      result.imageInput = pricing.imageInputPer1K;
    }
    
    return result;
  }

  private deriveBatchPricing(
    apiProvider: ApiProvider, 
    supportsBatchFlag: number | null
  ): BatchPricingConfig {
    // Check known batch providers
    const batchInfo = BATCH_PROVIDER_MAP[apiProvider];
    
    if (batchInfo && supportsBatchFlag !== 0) {
      return {
        supported: true,
        discountPercent: batchInfo.discount,
        batchProvider: batchInfo.provider,
      };
    }
    
    return {
      supported: false,
      discountPercent: 0,
      batchProvider: null,
    };
  }

  private extractFamily(modelId: string): string {
    return modelId.split('/')[0] || 'unknown';
  }

  private extractDisplayName(modelId: string): string {
    return modelId.split('/').slice(1).join('/') || modelId;
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a ModelRegistry instance.
 * Convenience function for one-off lookups.
 */
export function createModelRegistry(db: D1Database): ModelRegistry {
  return new ModelRegistry(db);
}

