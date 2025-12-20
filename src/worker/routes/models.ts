/**
 * Models API routes.
 */

import { Hono } from 'hono';
import type { Env } from '../types.js';
import { SUPPORTED_MODELS } from '../ai/types.js';

const models = new Hono<{ Bindings: Env }>();

/**
 * GET /api/models - List available models.
 * Only returns models that are currently supported (in SUPPORTED_MODELS).
 */
models.get('/', async (c) => {
  const env = c.env;
  const result = await env.DB.prepare('SELECT * FROM models ORDER BY display_name').all();

  // Filter to only include currently supported models
  const supportedModelIds = Object.keys(SUPPORTED_MODELS);
  const filteredModels = result.results.filter((model) =>
    supportedModelIds.includes((model as { id: string }).id)
  );

  return c.json({ models: filteredModels });
});

export default models;

