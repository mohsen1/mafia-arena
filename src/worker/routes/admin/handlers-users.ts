/**
 * User management route handlers for admin API.
 */

import type { Context } from 'hono';
import type { Env } from '../../types.js';
import { eq, desc, sql, or, like, inArray } from 'drizzle-orm';
import { Errors, errorHandler, createLogger } from '../../utils/index.js';
import { createDb } from '../../db/drizzle.js';
import * as schema from '../../db/schema.js';
import type { UpdateUserRequest } from './validation.js';

const log = createLogger('admin:users');

export async function handleGetUsers(c: Context<{ Bindings: Env }>) {
  const db = createDb(c.env.DB);
  const url = new URL(c.req.url);

  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const search = url.searchParams.get('search') ?? '';

  try {
    // Build query with optional search
    let usersQuery = db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        picture: schema.users.picture,
        isAdmin: schema.users.isAdmin,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })
      .from(schema.users);

    // Apply search filter if provided
    if (search) {
      const searchPattern = `%${search}%`;
      usersQuery = usersQuery.where(
        or(
          like(schema.users.email, searchPattern),
          like(schema.users.name, searchPattern)
        )!
      ) as typeof usersQuery;
    }

    const users = await usersQuery
      .orderBy(desc(schema.users.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    let countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(schema.users);

    if (search) {
      const searchPattern = `%${search}%`;
      countQuery = countQuery.where(
        or(
          like(schema.users.email, searchPattern),
          like(schema.users.name, searchPattern)
        )!
      ) as typeof countQuery;
    }

    const countResult = await countQuery;
    const total = countResult[0]?.count ?? 0;

    // Get statistics for each user
    const userIds = users.map(u => u.id);
    const statsMap = new Map<string, {
      apiKeysCount: number;
      batchesCount: number;
      batchesCompleted: number;
      lastBatchAt: number | null;
    }>();

    if (userIds.length > 0) {
      // Get API key counts
      const apiKeysResult = await db
        .select({
          userId: schema.userApiKeys.userId,
          count: sql<number>`count(*)`,
        })
        .from(schema.userApiKeys)
        .where(inArray(schema.userApiKeys.userId, userIds))
        .groupBy(schema.userApiKeys.userId);

      // Get batch counts
      const batchesResult = await db
        .select({
          createdBy: schema.batches.createdBy,
          total: sql<number>`count(*)`,
          completed: sql<number>`sum(case when ${schema.batches.status} = 'completed' then 1 else 0 end)`,
          lastBatchAt: sql<number>`max(${schema.batches.createdAt})`,
        })
        .from(schema.batches)
        .where(inArray(schema.batches.createdBy, userIds))
        .groupBy(schema.batches.createdBy);

      // Build stats map
      for (const userId of userIds) {
        const apiKeys = apiKeysResult.find(r => r.userId === userId);
        const batches = batchesResult.find(r => r.createdBy === userId);

        statsMap.set(userId, {
          apiKeysCount: apiKeys?.count ?? 0,
          batchesCount: batches?.total ?? 0,
          batchesCompleted: batches?.completed ?? 0,
          lastBatchAt: batches?.lastBatchAt ?? null,
        });
      }
    }

    // Combine users with stats
    const usersWithStats = users.map(user => ({
      ...user,
      stats: statsMap.get(user.id) ?? {
        apiKeysCount: 0,
        batchesCount: 0,
        batchesCompleted: 0,
        lastBatchAt: null,
      },
    }));

    return c.json({
      users: usersWithStats,
      total,
      hasMore: offset + limit < total,
      limit,
      offset,
    });
  } catch (error) {
    return errorHandler.handleApiError(error, {
      route: 'getUsers',
      action: 'fetch',
      search,
    }, log);
  }
}

export async function handleGetUser(c: Context<{ Bindings: Env }>) {
  const db = createDb(c.env.DB);
  const userId = c.req.param('id');

  try {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });

    if (!user) {
      throw Errors.NotFound('User');
    }

    // Get API keys (fingerprints only)
    const apiKeys = await db
      .select({
        provider: schema.userApiKeys.provider,
        keyFingerprint: schema.userApiKeys.keyFingerprint,
        createdAt: schema.userApiKeys.createdAt,
        updatedAt: schema.userApiKeys.updatedAt,
      })
      .from(schema.userApiKeys)
      .where(eq(schema.userApiKeys.userId, userId))
      .orderBy(schema.userApiKeys.provider);

    // Get batch statistics
    const batches = await db
      .select({
        id: schema.batches.id,
        name: schema.batches.name,
        status: schema.batches.status,
        totalGames: schema.batches.totalGames,
        completedGames: schema.batches.completedGames,
        createdAt: schema.batches.createdAt,
      })
      .from(schema.batches)
      .where(eq(schema.batches.createdBy, userId))
      .orderBy(desc(schema.batches.createdAt))
      .limit(10);

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      apiKeys,
      recentBatches: batches,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'User') {
      throw Errors.NotFound('User');
    }
    return errorHandler.handleApiError(error, {
      route: 'getUser',
      action: 'fetch',
      userId,
    }, log);
  }
}

export async function handleUpdateUser(c: Context<{ Bindings: Env }>) {
  const db = createDb(c.env.DB);
  const userId = c.req.param('id');

  let body: UpdateUserRequest;
  try {
    body = await c.req.json<UpdateUserRequest>();
  } catch {
    throw Errors.BadRequest('Invalid JSON body');
  }

  try {
    // Prevent self-demotion
    if (body.isAdmin === false) {
      // Use atomic UPDATE with WHERE clause to prevent race condition
      // This ensures that between checking and updating, another admin isn't removed
      const result = await db
        .update(schema.users)
        .set({
          isAdmin: false,
          updatedAt: new Date(),
        })
        .where(
          sql<boolean>`(
            ${schema.users.id} = ${userId}
            AND (
              SELECT COUNT(*) FROM ${schema.users}
              WHERE ${schema.users.isAdmin} = 1
            ) > 1
          )`
        );

      // Check if update was successful
      if ('meta' in result && result.meta && result.meta.changes === 0) {
        // Either user doesn't exist or would be the last admin
        const user = await db.query.users.findFirst({
          where: eq(schema.users.id, userId),
        });

        if (!user) {
          throw Errors.NotFound('User');
        }

        // User exists but update failed - means they're the last admin
        throw Errors.BadRequest('Cannot remove the last admin user');
      }

      return c.json({
        success: true,
        message: `User ${userId} updated`,
      });
    }

    // Handle other updates (promoting to admin or other fields)
    const updateData: Partial<typeof schema.users.$inferInsert> = {};
    if (body.isAdmin !== undefined) {
      updateData.isAdmin = body.isAdmin;
    }

    if (Object.keys(updateData).length === 0) {
      return c.json({ success: true, message: 'No changes to apply' });
    }

    updateData.updatedAt = new Date();

    await db
      .update(schema.users)
      .set(updateData)
      .where(eq(schema.users.id, userId));

    return c.json({
      success: true,
      message: `User ${userId} updated`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'User') {
      throw Errors.NotFound('User');
    }
    return errorHandler.handleApiError(error, {
      route: 'updateUser',
      action: 'update',
      userId,
    }, log);
  }
}
