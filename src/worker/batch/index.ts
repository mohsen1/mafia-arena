/**
 * Batch processing module exports.
 */

export {
  // Batch CRUD
  createBatch,
  getBatch,
  listBatches,
  updateBatchStatus,
  incrementBatchProgress,
  cancelBatch,
  
  // Batch processing
  processBatchMessage,
  
  // Cost estimation
  estimateCost,
  MAX_BATCH_SIZE,
  
  // System state
  getSystemState,
  pauseProcessing,
  resumeProcessing,
  getAdminStats,
  
  // Daily stats
  updateDailyStats,
} from './service.js';

