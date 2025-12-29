/**
 * Batch module - handles both game batching and AI batch API operations.
 * 
 * Game Batching (service.ts):
 * - Create/manage batches of games
 * - Queue individual games from batches
 * - Track batch progress and costs
 * 
 * AI Batch APIs (BatchService.ts):
 * - Route discount pricing requests to provider batch APIs
 * - Aggregate requests and submit to Anthropic/OpenAI/Google/etc
 * - 40-50% cost savings on AI calls
 */

// =============================================================================
// Game Batch Processing (existing functionality)
// =============================================================================
export {
  createBatch,
  getBatch,
  listBatches,
  updateBatchStatus,
  incrementBatchProgress,
  cancelBatch,
  processBatchMessage,
  estimateCost,
  getSystemState,
  pauseProcessing,
  resumeProcessing,
  getAdminStats,
  updateDailyStats,
  MAX_BATCH_SIZE,
} from './service.js';

// =============================================================================
// AI Batch API Types (for multi-provider discount pricing)
// =============================================================================
export type {
  BatchProvider,
  BatchRequestStatus,
  BatchJobStatus,
  BatchRequest,
  BatchJob,
  BatchRequestResult,
  BatchProviderInterface,
  BatchServiceOptions,
  BatchStats,
} from './types.js';

// =============================================================================
// AI Batch API Service (for multi-provider discount pricing)
// =============================================================================
export { 
  BatchService, 
  modelSupportsBatchPricing, 
  getBatchPricingForModel,
} from './BatchService.js';

// Base provider (for implementing new providers)
export { BaseBatchProvider } from './providers/BaseBatchProvider.js';

// Provider implementations
export { AnthropicBatch } from './providers/AnthropicBatch.js';
export { OpenAIBatch } from './providers/OpenAIBatch.js';
export { GoogleBatch } from './providers/GoogleBatch.js';
export { CerebrasBatch } from './providers/CerebrasBatch.js';
export { FireworksBatch } from './providers/FireworksBatch.js';
