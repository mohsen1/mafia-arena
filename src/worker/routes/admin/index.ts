/**
 * Admin API routes (protected by Basic Auth).
 */

import { Hono } from 'hono';
import type { Env } from '../../types.js';
import { adminAuthMiddleware } from '../../middleware/index.js';

// Core handlers
import * as handlers from './handlers.js';

// Game management handlers
import {
  handleRunLiveGame,
  getRunningGamesCount,
  handleGetFailedGames,
  handleResumeGame,
  handleKillHangingGames,
  handleFailGame,
  handleRepairGame,
  handleCompleteGame,
  handleRestartGame,
} from './handlers-games.js';

// Model management handlers
import {
  handleGetModels,
  handleCreateModel,
  handleUpdateModel,
  handleSyncModels,
  handleDeleteModel,
  handleBackfillELO,
} from './handlers-models.js';

// Maintenance handlers
import {
  handleRebuildLeaderboard,
  handleMergeModel,
  handleFindDuplicates,
  handleGetLowSampleModels,
} from './handlers-maintenance.js';

// User management handlers
import {
  handleGetUsers,
  handleGetUser,
  handleUpdateUser,
} from './handlers-users.js';

const admin = new Hono<{ Bindings: Env }>();

// Apply admin auth to all routes in this router
admin.use('*', adminAuthMiddleware);

// =============================================================================
// DEPRECATED BATCH ROUTES
// =============================================================================
// These admin batch routes are deprecated. Use /api/batches which handles
// both regular users and admins with unified logic.
// =============================================================================

admin.post('/batches', async (c) => {
  return c.json({
    error: 'This endpoint is deprecated. Use POST /api/batches instead.',
    hint: 'Sign in via Google and use /api/batches with useSystemKeys: true for system API keys.',
  }, 410);
});

admin.get('/batches', async (c) => {
  return c.json({
    error: 'This endpoint is deprecated. Use GET /api/batches instead.',
    hint: 'Sign in via Google to view all batches. Admin users see all batches by default.',
  }, 410);
});

admin.get('/batches/:id', async (c) => {
  const batchId = c.req.param('id');
  return c.json({
    error: 'This endpoint is deprecated. Use GET /api/batches/:id instead.',
    hint: `Sign in via Google and access /api/batches/${batchId}`,
  }, 410);
});

admin.post('/batches/:id/cancel', async (c) => {
  const batchId = c.req.param('id');
  return c.json({
    error: 'This endpoint is deprecated. Use POST /api/batches/:id/cancel instead.',
    hint: `Sign in via Google and use /api/batches/${batchId}/cancel`,
  }, 410);
});

// =============================================================================
// SYSTEM CONTROL ROUTES
// =============================================================================

admin.post('/system/pause', handlers.handlePauseProcessing);
admin.post('/system/resume', handlers.handleResumeProcessing);
admin.get('/stats/live', handlers.handleGetLiveStats);
admin.post('/estimate', handlers.handleEstimateCost);

// =============================================================================
// GAME MANAGEMENT ROUTES
// =============================================================================

admin.post('/games/run-live', handleRunLiveGame);
admin.get('/games/running', getRunningGamesCount);
admin.get('/games/failed', handleGetFailedGames);
admin.post('/games/:id/resume', handleResumeGame);
admin.post('/games/kill-hanging', handleKillHangingGames);
admin.post('/games/:id/fail', handleFailGame);
admin.post('/games/:id/repair', handleRepairGame);
admin.post('/games/:id/complete', handleCompleteGame);
admin.post('/games/:id/restart', handleRestartGame);

// =============================================================================
// DEAD LETTER QUEUE ROUTES
// =============================================================================

admin.get('/dlq', handlers.handleGetDLQ);
admin.post('/dlq/:id/retry', handlers.handleRetryDLQ);
admin.post('/dlq/:id/discard', handlers.handleDiscardDLQ);
admin.get('/dlq/stats', handlers.handleGetDLQStats);

// =============================================================================
// API KEY MANAGEMENT ROUTES
// =============================================================================

admin.get('/keys', handlers.handleGetKeys);

// =============================================================================
// MODEL MANAGEMENT ROUTES
// =============================================================================

admin.get('/models', handleGetModels);
admin.post('/models', handleCreateModel);
admin.patch('/models/*', handleUpdateModel);
admin.post('/models/sync', handleSyncModels);
admin.delete('/models/*', handleDeleteModel);
admin.post('/elo/backfill', handleBackfillELO);

// =============================================================================
// MAINTENANCE ROUTES
// =============================================================================

admin.post('/maintenance/rebuild-leaderboard', handleRebuildLeaderboard);
admin.post('/maintenance/merge-model', handleMergeModel);
admin.get('/maintenance/find-duplicates', handleFindDuplicates);
admin.get('/maintenance/low-sample-models', handleGetLowSampleModels);

// =============================================================================
// USER MANAGEMENT ROUTES
// =============================================================================

admin.get('/users', handleGetUsers);
admin.get('/users/:id', handleGetUser);
admin.patch('/users/:id', handleUpdateUser);

export default admin;
