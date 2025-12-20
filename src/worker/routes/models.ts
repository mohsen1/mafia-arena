/**
 * Models API routes.
 */

import { Hono } from 'hono';
import type { Env } from '../types.js';

const models = new Hono<{ Bindings: Env }>();

/**
 * GET /api/models - List available models.
 */
models.get('/', async (c) => {
  const env = c.env;
  const result = await env.DB.prepare('SELECT * FROM models ORDER BY display_name').all();

  return c.json({ models: result.results });
});

export default models;

