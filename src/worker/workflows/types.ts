/**
 * Workflow type definitions for MafiaWorkflow.
 */

import type { GameQueueConfig } from '../types.js';
import type { GameEvent } from '../../engine/types.js';

/**
 * Encrypted user API keys stored for workflow execution.
 */
export interface EncryptedUserKeys {
  [provider: string]: {
    encrypted: string;
    iv: string;
  };
}

/**
 * Parameters passed to MafiaWorkflow.create().
 */
export interface WorkflowParams {
  /** Unique game identifier */
  gameId: string;
  /** Game configuration */
  config: GameQueueConfig;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /** Batch ID if part of a batch run */
  batchId?: string;
  /** Encrypted user API keys for custom providers */
  encryptedUserKeys?: EncryptedUserKeys;
  /** Whether to use discount pricing (batch API) */
  discountPricing?: boolean;
}

/**
 * Message structure for broadcasting to WebSocket clients via GameRunner DO.
 */
export interface BroadcastMessage {
  type: 'SYNC' | 'EVENT' | 'STATUS' | 'ERROR';
  gameId: string;
  status: 'running' | 'completed' | 'failed';
  events?: GameEvent[];
  event?: GameEvent;
  error?: string;
  /** Current round number */
  round?: number;
  /** Current phase */
  phase?: string;
}

/**
 * Result of workflow execution returned to caller.
 */
export interface WorkflowResult {
  gameId: string;
  winner: 'mafia' | 'town';
  rounds: number;
  durationMs: number;
}

