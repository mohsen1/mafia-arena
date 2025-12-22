/**
 * Models API routes.
 */

import { Hono } from 'hono';
import type { Env } from '../types.js';
import { SUPPORTED_MODELS, MODEL_PRICING } from '../ai/models.js';

const models = new Hono<{ Bindings: Env }>();

/**
 * GET /api/models - List available models.
 * Only returns models that are currently supported (in SUPPORTED_MODELS).
 * Includes pricing information.
 */
models.get('/', async (c) => {
  const env = c.env;
  
  interface ModelRow {
    id: string;
    display_name: string;
    provider: string;
    description: string | null;
    created_at: number;
  }
  
  const result = await env.DB.prepare('SELECT * FROM models ORDER BY display_name').all<ModelRow>();

  // Filter to only include currently supported models and add pricing
  const filteredModels = result.results
    .filter((model) => model.id in SUPPORTED_MODELS)
    .map((model) => ({
      ...model,
      pricing: MODEL_PRICING[model.id] || null,
    }));

  return c.json({ models: filteredModels });
});

export default models;

