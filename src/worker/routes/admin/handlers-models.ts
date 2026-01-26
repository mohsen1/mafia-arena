/**
 * Model management route handlers for admin API.
 */

import type { Context } from 'hono';
import type { Env } from '../../types.js';
import { eq, sql } from 'drizzle-orm';
import { Errors, createLogger } from '../../utils/index.js';
import { createDb } from '../../db/drizzle.js';
import * as schema from '../../db/schema.js';
import type { CreateModelRequest, UpdateModelRequest, OpenRouterResponse } from './validation.js';

const log = createLogger('admin:models');

export async function handleGetModels(c: Context<{ Bindings: Env }>) {
  const db = createDb(c.env.DB);

  const result = await db.query.models.findMany({
    orderBy: [schema.models.family, schema.models.displayName],
  });

  return c.json({
    models: result.map(m => ({
      id: m.id,
      family: m.family,
      display_name: m.displayName,
      // Routing configuration
      api_provider: m.apiProvider ?? 'openrouter',
      api_model_id: m.apiModelId,
      supports_batch_pricing: m.supportsBatchPricing ?? false,
      // ELO rating
      elo_rating: m.eloRating ?? 1500,
      elo_games_played: m.eloGamesPlayed ?? 0,
      // Pricing from config
      pricing: m.config?.pricing ?? null,
      context_length: m.config?.contextLength ?? null,
      created_at: m.createdAt,
    })),
    total: result.length,
  });
}

export async function handleCreateModel(c: Context<{ Bindings: Env }>) {
  const db = createDb(c.env.DB);

  let body: CreateModelRequest;
  try {
    body = await c.req.json<CreateModelRequest>();
  } catch {
    throw Errors.BadRequest('Invalid JSON body');
  }

  // Validate required fields
  if (!body.id || !body.display_name || !body.family || !body.api_provider) {
    throw Errors.BadRequest('Missing required fields: id, display_name, family, api_provider');
  }

  // Check if model already exists
  const existing = await db.query.models.findFirst({
    where: eq(schema.models.id, body.id),
  });

  if (existing) {
    throw Errors.BadRequest(`Model ${body.id} already exists`);
  }

  // Build config object
  const config: { contextLength?: number; pricing?: { inputPer1K: number; outputPer1K: number } } = {};
  if (body.context_length) {
    config.contextLength = body.context_length;
  }
  if (body.pricing) {
    // Convert per 1M to per 1K (divide by 1000)
    config.pricing = {
      inputPer1K: body.pricing.input / 1000,
      outputPer1K: body.pricing.output / 1000,
    };
  }

  // Insert new model
  await db.insert(schema.models).values({
    id: body.id,
    family: body.family,
    displayName: body.display_name,
    apiProvider: body.api_provider,
    apiModelId: body.api_model_id || body.id,
    supportsBatchPricing: body.supports_batch_pricing ?? false,
    config: Object.keys(config).length > 0 ? config : null,
  });

  return c.json({
    success: true,
    message: `Model ${body.id} created`,
    model: {
      id: body.id,
      family: body.family,
      display_name: body.display_name,
      api_provider: body.api_provider,
      api_model_id: body.api_model_id || body.id,
      supports_batch_pricing: body.supports_batch_pricing ?? false,
    },
  });
}

export async function handleUpdateModel(c: Context<{ Bindings: Env }>) {
  const db = createDb(c.env.DB);
  // Extract model ID from wildcard - handles IDs with slashes like "fireworks/deepseek-r1"
  const modelId = decodeURIComponent(c.req.param('*') || '');

  if (!modelId) {
    throw Errors.BadRequest('Model ID is required');
  }

  let body: UpdateModelRequest;
  try {
    body = await c.req.json<UpdateModelRequest>();
  } catch {
    throw Errors.BadRequest('Invalid JSON body');
  }

  // Get existing model
  const existing = await db.query.models.findFirst({
    where: eq(schema.models.id, modelId),
  });

  if (!existing) {
    throw Errors.NotFound('Model');
  }

  // Build update data
  const updateData: Partial<typeof schema.models.$inferInsert> = {};

  if (body.display_name !== undefined) {
    updateData.displayName = body.display_name;
  }
  if (body.api_provider !== undefined) {
    updateData.apiProvider = body.api_provider;
  }
  if (body.api_model_id !== undefined) {
    updateData.apiModelId = body.api_model_id;
  }
  if (body.supports_batch_pricing !== undefined) {
    updateData.supportsBatchPricing = body.supports_batch_pricing;
  }

  // Update pricing/context in config JSON if provided
  if (body.pricing !== undefined || body.context_length !== undefined) {
    const existingConfig = existing.config ?? {};
    const newConfig = { ...existingConfig };

    if (body.pricing) {
      newConfig.pricing = {
        inputPer1K: body.pricing.input / 1000,
        outputPer1K: body.pricing.output / 1000,
      };
    }
    if (body.context_length !== undefined) {
      newConfig.contextLength = body.context_length;
    }

    updateData.config = newConfig;
  }

  // Only update if there are changes
  if (Object.keys(updateData).length === 0) {
    return c.json({ success: true, message: 'No changes to apply' });
  }

  await db.update(schema.models)
    .set(updateData)
    .where(eq(schema.models.id, modelId));

  return c.json({
    success: true,
    message: `Model ${modelId} updated`,
  });
}

export async function handleSyncModels(c: Context<{ Bindings: Env }>) {
  const env = c.env;
  const db = createDb(env.DB);

  // Fetch from OpenRouter
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    log.error('OpenRouter API error', {
      status: response.status,
      error: errorText,
      route: 'syncModels',
      action: 'fetch',
    });
    throw Errors.Internal('Failed to fetch models from OpenRouter');
  }

  const data = await response.json() as OpenRouterResponse;

  // Get existing models from DB
  const existing = await db
    .select({ id: schema.models.id })
    .from(schema.models);
  const existingIds = new Set(existing.map(m => m.id));

  // Track sync results
  const added: string[] = [];
  const updated: string[] = [];

  // Upsert each model
  for (const model of data.data) {
    // Extract provider from model ID (e.g., "google/gemini-2.5-pro" -> "google")
    const provider = model.id.split('/')[0] || 'unknown';

    // Normalize display name: strip redundant "Provider: " prefix since we store provider separately
    let displayName = model.name;
    const providerPrefixes = ['Google: ', 'Anthropic: ', 'OpenAI: ', 'Meta: ', 'Mistral: ', 'Microsoft: ', 'Xiaomi: ', 'DeepSeek: ', 'Qwen: '];
    for (const prefix of providerPrefixes) {
      if (displayName.startsWith(prefix)) {
        displayName = displayName.slice(prefix.length);
        break;
      }
    }

    // Store pricing in config JSON
    const config = {
      contextLength: model.context_length,
      pricing: {
        inputPer1K: parseFloat(model.pricing.prompt) * 1000,
        outputPer1K: parseFloat(model.pricing.completion) * 1000,
      },
    };

    if (existingIds.has(model.id)) {
      // Update existing model
      await db
        .update(schema.models)
        .set({
          displayName,
          family: provider,
          config,
        })
        .where(eq(schema.models.id, model.id));
      updated.push(model.id);
    } else {
      // Insert new model
      await db.insert(schema.models).values({
        id: model.id,
        family: provider,
        displayName,
        config,
        apiProvider: 'openrouter',
        apiModelId: model.id,
      });
      added.push(model.id);
    }
  }

  // Clear OpenRouter cache so next fetch gets fresh data
  await env.RATE_LIMIT.delete('openrouter:models');

  return c.json({
    success: true,
    added: added.length,
    updated: updated.length,
    skipped: 0,
    total: data.data.length,
    addedModels: added.slice(0, 20), // Return first 20 for display
    message: `Synced ${data.data.length} models from OpenRouter`,
  });
}

export async function handleDeleteModel(c: Context<{ Bindings: Env }>) {
  const db = createDb(c.env.DB);
  // Extract model ID from wildcard - handles IDs with slashes like "fireworks/deepseek-r1"
  const modelId = decodeURIComponent(c.req.param('*') || '');

  if (!modelId) {
    throw Errors.BadRequest('Model ID is required');
  }

  // Check if model exists
  const model = await db.query.models.findFirst({
    where: eq(schema.models.id, modelId),
  });

  if (!model) {
    throw Errors.NotFound('Model');
  }

  // Check if model has any game participation
  const participations = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.gameParticipants)
    .where(eq(schema.gameParticipants.modelId, modelId));

  if (participations[0] && participations[0].count > 0) {
    throw Errors.BadRequest(`Cannot delete model with ${participations[0].count} game participations`);
  }

  await db.delete(schema.models).where(eq(schema.models.id, modelId));

  return c.json({
    success: true,
    message: `Model ${modelId} deleted`,
  });
}

export async function handleBackfillELO(c: Context<{ Bindings: Env }>) {
  const env = c.env;
  const db = createDb(env.DB);

  // Get all completed games between different models, ordered chronologically
  const gamesResult = await db
    .select({
      id: schema.games.id,
      winner: schema.games.winner,
      created_at: schema.games.createdAt,
      mafia_model: sql<string>`mafia.model_id`,
      town_model: sql<string>`town.model_id`,
    })
    .from(schema.games)
    .innerJoin(
      sql`game_participants mafia`,
      sql`${schema.games.id} = mafia.game_id AND mafia.team = 'mafia'`
    )
    .innerJoin(
      sql`game_participants town`,
      sql`${schema.games.id} = town.game_id AND town.team = 'town'`
    )
    .where(
      sql`${schema.games.status} = 'completed'
        AND ${schema.games.rounds} > 1
        AND mafia.model_id != town.model_id
        AND mafia.model_id NOT LIKE 'test/%'
        AND town.model_id NOT LIKE 'test/%'`
    )
    .orderBy(schema.games.createdAt);

  const INITIAL_RATING = 1500;
  const ratings: Map<string, { rating: number; games: number; peak: number }> = new Map();

  function getOrCreate(modelId: string) {
    if (!ratings.has(modelId)) {
      ratings.set(modelId, { rating: INITIAL_RATING, games: 0, peak: INITIAL_RATING });
    }
    return ratings.get(modelId)!;
  }

  function getKFactor(games: number): number {
    if (games < 30) return 32;
    if (games < 100) return 24;
    return 16;
  }

  // Process each game chronologically
  for (const game of gamesResult) {
    const mafiaData = getOrCreate(game.mafia_model);
    const townData = getOrCreate(game.town_model);

    const mafiaK = getKFactor(mafiaData.games);
    const townK = getKFactor(townData.games);

    const mafiaExpected = 1 / (1 + Math.pow(10, (townData.rating - mafiaData.rating) / 400));
    const townExpected = 1 - mafiaExpected;

    const mafiaWon = game.winner === 'mafia';
    const mafiaActual = mafiaWon ? 1 : 0;
    const townActual = mafiaWon ? 0 : 1;

    // Update ratings
    mafiaData.rating = Math.round(mafiaData.rating + mafiaK * (mafiaActual - mafiaExpected));
    townData.rating = Math.round(townData.rating + townK * (townActual - townExpected));

    // Update games played
    mafiaData.games++;
    townData.games++;

    // Track peak
    mafiaData.peak = Math.max(mafiaData.peak, mafiaData.rating);
    townData.peak = Math.max(townData.peak, townData.rating);
  }

  // Update all models in the database using batch
  const updates: D1PreparedStatement[] = [];
  const now = Date.now();

  for (const [modelId, data] of ratings) {
    updates.push(
      env.DB.prepare(`
        UPDATE models SET
          elo_rating = ?,
          elo_games_played = ?,
          elo_peak = ?,
          elo_updated_at = ?
        WHERE id = ?
      `).bind(data.rating, data.games, data.peak, now, modelId)
    );
  }

  // Use D1's native batch() for atomic execution of multiple updates
  if (updates.length > 0) {
    await env.DB.batch(updates);
  }

  return c.json({
    success: true,
    gamesProcessed: gamesResult.length,
    modelsUpdated: ratings.size,
    topRatings: Array.from(ratings.entries())
      .sort((a, b) => b[1].rating - a[1].rating)
      .slice(0, 10)
      .map(([id, data]) => ({ id, ...data })),
  });
}
