'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { db } from '@/lib/db/config';
import { userApiKeys } from '@/lib/db/schema';
import { encrypt, decrypt, validateApiKeyFormat } from '@/lib/crypto';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export interface UserApiKeyInfo {
  id: string;
  provider: string;
  keyName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateApiKeyData {
  provider: string;
  keyName: string;
  apiKey: string;
  customEndpoint?: string;
}

export interface UpdateApiKeyData {
  id: string;
  keyName?: string;
  apiKey?: string;
  isActive?: boolean;
  customEndpoint?: string;
}

/**
 * Get all API keys for the current user (without exposing the actual keys)
 */
export async function getUserApiKeys(): Promise<UserApiKeyInfo[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error('Authentication required');
  }

  try {
    const keys = await db
      .select({
        id: userApiKeys.id,
        provider: userApiKeys.provider,
        keyName: userApiKeys.keyName,
        isActive: userApiKeys.isActive,
        createdAt: userApiKeys.createdAt,
        updatedAt: userApiKeys.updatedAt,
      })
      .from(userApiKeys)
      .where(eq(userApiKeys.userId, session.user.id))
      .orderBy(userApiKeys.createdAt);

    return keys;
  } catch (error) {
    console.error('Failed to get user API keys:', error);
    throw new Error('Failed to retrieve API keys');
  }
}

/**
 * Create a new API key for the current user
 */
export async function createApiKey(
  data: CreateApiKeyData
): Promise<{ success: boolean; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { success: false, error: 'Authentication required' };
  }

  // Validate API key format
  if (!validateApiKeyFormat(data.provider, data.apiKey)) {
    return {
      success: false,
      error: 'Invalid API key format for the selected provider',
    };
  }

  // Validate input
  if (!data.keyName.trim() || data.keyName.length > 100) {
    return {
      success: false,
      error: 'Key name must be between 1 and 100 characters',
    };
  }

  if (!data.provider.trim()) {
    return { success: false, error: 'Provider is required' };
  }

  try {
    // Check if user already has a key with this name for this provider
    const existingKey = await db
      .select({ id: userApiKeys.id })
      .from(userApiKeys)
      .where(
        and(
          eq(userApiKeys.userId, session.user.id),
          eq(userApiKeys.provider, data.provider),
          eq(userApiKeys.keyName, data.keyName)
        )
      )
      .limit(1);

    if (existingKey.length > 0) {
      return {
        success: false,
        error: 'A key with this name already exists for this provider',
      };
    }

    // Encrypt the API key
    const encryptedApiKey = encrypt(data.apiKey);

    // Insert the new API key
    await db.insert(userApiKeys).values({
      userId: session.user.id,
      provider: data.provider,
      keyName: data.keyName,
      encryptedApiKey,
      isActive: true,
    });

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Failed to create API key:', error);
    return { success: false, error: 'Failed to save API key' };
  }
}

/**
 * Update an existing API key
 */
export async function updateApiKey(
  data: UpdateApiKeyData
): Promise<{ success: boolean; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { success: false, error: 'Authentication required' };
  }

  try {
    // Verify the key belongs to the current user
    const existingKey = await db
      .select({ id: userApiKeys.id, provider: userApiKeys.provider })
      .from(userApiKeys)
      .where(
        and(
          eq(userApiKeys.id, data.id),
          eq(userApiKeys.userId, session.user.id)
        )
      )
      .limit(1);

    if (existingKey.length === 0) {
      return { success: false, error: 'API key not found' };
    }

    // Prepare update data
    const updateData: {
      updatedAt: Date;
      keyName?: string;
      encryptedApiKey?: string;
      isActive?: boolean;
    } = {
      updatedAt: new Date(),
    };

    if (data.keyName !== undefined) {
      if (!data.keyName.trim() || data.keyName.length > 100) {
        return {
          success: false,
          error: 'Key name must be between 1 and 100 characters',
        };
      }
      updateData.keyName = data.keyName;
    }

    if (data.apiKey !== undefined) {
      if (!validateApiKeyFormat(existingKey[0].provider, data.apiKey)) {
        return {
          success: false,
          error: 'Invalid API key format for this provider',
        };
      }
      updateData.encryptedApiKey = encrypt(data.apiKey);
    }

    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }

    // Update the API key
    await db
      .update(userApiKeys)
      .set(updateData)
      .where(
        and(
          eq(userApiKeys.id, data.id),
          eq(userApiKeys.userId, session.user.id)
        )
      );

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Failed to update API key:', error);
    return { success: false, error: 'Failed to update API key' };
  }
}

/**
 * Delete an API key
 */
export async function deleteApiKey(
  keyId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { success: false, error: 'Authentication required' };
  }

  try {
    // Delete the API key (only if it belongs to the current user)
    await db
      .delete(userApiKeys)
      .where(
        and(eq(userApiKeys.id, keyId), eq(userApiKeys.userId, session.user.id))
      );

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete API key:', error);
    return { success: false, error: 'Failed to delete API key' };
  }
}

/**
 * Get a decrypted API key for use in the application (internal use only)
 * This should only be used by server-side code that needs the actual key
 */
export async function getDecryptedApiKey(
  userId: string,
  provider: string
): Promise<string | null> {
  try {
    const result = await db
      .select({ encryptedApiKey: userApiKeys.encryptedApiKey })
      .from(userApiKeys)
      .where(
        and(
          eq(userApiKeys.userId, userId),
          eq(userApiKeys.provider, provider),
          eq(userApiKeys.isActive, true)
        )
      )
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return decrypt(result[0].encryptedApiKey);
  } catch (error) {
    console.error('Failed to get decrypted API key:', error);
    return null;
  }
}
