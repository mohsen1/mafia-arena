/**
 * Business logic services for admin routes.
 */

import type { Env, ApiProvider } from '../../types.js';
import { Errors } from '../../utils/index.js';
import { PROVIDER_ENV_KEYS } from './validation.js';
import { inferProviderFromModelId } from '../../ai/factory.js';

/**
 * Get required providers for a list of model IDs.
 */
export async function getRequiredProviders(modelIds: string[], env: Env): Promise<Set<string>> {
  const providers = new Set<string>();

  const uniqueModelIds = [...new Set(modelIds)];
  if (uniqueModelIds.length > 0) {
    const placeholders = uniqueModelIds.map(() => '?').join(',');
    const result = await env.DB.prepare(
      `SELECT id, api_provider FROM models WHERE id IN (${placeholders})`
    ).bind(...uniqueModelIds).all<{ id: string; api_provider: string }>();

    const dbProviderMap = new Map(
      (result.results ?? []).map(m => [m.id, m.api_provider])
    );

    for (const modelId of modelIds) {
      const dbProvider = dbProviderMap.get(modelId);
      if (dbProvider) {
        providers.add(dbProvider);
      } else {
        providers.add(inferProviderFromModelId(modelId));
      }
    }
  }

  return providers;
}

/**
 * Validate that system API keys are configured for all required providers.
 * Throws Errors.BadRequest if any required keys are missing.
 */
export function validateSystemKeys(requiredProviders: Set<string>, env: Env): void {
  const missingKeys: string[] = [];

  for (const provider of requiredProviders) {
    const envKey = PROVIDER_ENV_KEYS[provider as ApiProvider];
    if (!envKey) continue;

    const keyValue = (env as unknown as Record<string, string | undefined>)[envKey];
    if (!keyValue) {
      missingKeys.push(`${provider} (${envKey})`);
    }
  }

  if (missingKeys.length > 0) {
    throw Errors.BadRequest(
      `System API keys not configured for: ${missingKeys.join(', ')}. ` +
      `Please contact the administrator to add the missing keys.`
    );
  }
}

/**
 * Categorize error messages into types for filtering.
 */
export function categorizeError(error: string | null | undefined): {
  category: 'rate_limit' | 'timeout' | 'auth' | 'model_error' | 'network' | 'unknown';
  recoverable: boolean;
} {
  if (!error) {
    return { category: 'unknown', recoverable: true };
  }

  if (/rate.?limit|429|quota/i.test(error)) {
    return { category: 'rate_limit', recoverable: true };
  } else if (/timeout|504|502|timed? out/i.test(error)) {
    return { category: 'timeout', recoverable: true };
  } else if (/auth|401|403|invalid.*key|api.?key/i.test(error)) {
    return { category: 'auth', recoverable: false };
  } else if (/network|connection|ECONNREFUSED|ENOTFOUND/i.test(error)) {
    return { category: 'network', recoverable: true };
  } else if (/model.*not.*found|404|context.*length|invalid.*model/i.test(error)) {
    return { category: 'model_error', recoverable: false };
  } else {
    return { category: 'unknown', recoverable: true };
  }
}

/**
 * Parse config hash to extract game configuration.
 * Format: "11-2-google/gemini-3-flash:2,anthropic/claude-opus-4.5:9"
 */
export function parseConfigHash(configHash: string): {
  playerCount: number;
  mafiaCount: number;
  teams: Array<{ modelId: string; team: 'mafia' | 'town'; count: number }>;
} {
  const [_playerCount, ...teamParts] = configHash.split('-');
  const playerCount = parseInt(_playerCount ?? '0', 10);
  const mafiaCountFromHash = parseInt(teamParts[0] ?? '0', 10);
  const teamsStr = teamParts.slice(1).join('-'); // Rejoin in case modelId has dashes

  // Parse teams: "google/gemini-3-flash:2,anthropic/claude-opus-4.5:9"
  const teamEntries = teamsStr.split(',');
  const teams: Array<{ modelId: string; team: 'mafia' | 'town'; count: number }> = [];

  let mafiaAssigned = 0;
  for (const entry of teamEntries) {
    const lastColon = entry.lastIndexOf(':');
    if (lastColon === -1) continue;
    const modelId = entry.slice(0, lastColon);
    const count = parseInt(entry.slice(lastColon + 1), 10);

    // Assign to mafia first, then town
    if (mafiaAssigned < mafiaCountFromHash) {
      const mafiaCount = Math.min(count, mafiaCountFromHash - mafiaAssigned);
      if (mafiaCount > 0) {
        teams.push({ modelId, team: 'mafia', count: mafiaCount });
        mafiaAssigned += mafiaCount;
      }
      const townCount = count - mafiaCount;
      if (townCount > 0) {
        teams.push({ modelId, team: 'town', count: townCount });
      }
    } else {
      teams.push({ modelId, team: 'town', count });
    }
  }

  return { playerCount, mafiaCount: mafiaCountFromHash, teams };
}
