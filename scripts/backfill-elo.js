#!/usr/bin/env node
/**
 * Backfill ELO ratings from historical games.
 * Run with: node scripts/backfill-elo.js
 */

import { execSync } from 'child_process';

const INITIAL_ELO = 1500;
const K_NEW = 32;      // K-factor for new players (< 30 games)
const K_ESTABLISHED = 16;  // K-factor for established players

// Get games from D1
function runD1Query(query) {
  const cmd = `npx wrangler d1 execute mafia-arena --remote --command "${query.replace(/"/g, '\\"')}" --json`;
  const result = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() });
  const parsed = JSON.parse(result);
  return parsed[0]?.results || [];
}

// Calculate expected score
function expectedScore(playerElo, opponentElo) {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

// Calculate K-factor based on games played
function getKFactor(gamesPlayed) {
  return gamesPlayed < 30 ? K_NEW : K_ESTABLISHED;
}

async function main() {
  console.log('Fetching games...');
  
  // Get all completed games between different models, chronologically
  const games = runD1Query(`
    SELECT 
      g.id,
      g.winner,
      g.created_at,
      mafia.model_id as mafia_model,
      town.model_id as town_model
    FROM games g
    JOIN game_participants mafia ON g.id = mafia.game_id AND mafia.team = 'mafia'
    JOIN game_participants town ON g.id = town.game_id AND town.team = 'town'
    WHERE g.status = 'completed'
      AND g.rounds > 1
      AND mafia.model_id != town.model_id
      AND mafia.model_id NOT LIKE 'test/%'
      AND town.model_id NOT LIKE 'test/%'
    ORDER BY g.created_at ASC
  `);

  console.log(`Found ${games.length} games to process`);

  // Track ELO ratings and games played
  const elo = {};
  const gamesPlayed = {};
  const peakElo = {};

  for (const game of games) {
    const mafiaModel = game.mafia_model;
    const townModel = game.town_model;

    // Initialize if needed
    if (elo[mafiaModel] === undefined) {
      elo[mafiaModel] = INITIAL_ELO;
      gamesPlayed[mafiaModel] = 0;
      peakElo[mafiaModel] = INITIAL_ELO;
    }
    if (elo[townModel] === undefined) {
      elo[townModel] = INITIAL_ELO;
      gamesPlayed[townModel] = 0;
      peakElo[townModel] = INITIAL_ELO;
    }

    const mafiaElo = elo[mafiaModel];
    const townElo = elo[townModel];

    // Calculate expected scores
    const mafiaExpected = expectedScore(mafiaElo, townElo);
    const townExpected = expectedScore(townElo, mafiaElo);

    // Actual scores (1 for win, 0 for loss)
    const mafiaActual = game.winner === 'mafia' ? 1 : 0;
    const townActual = game.winner === 'town' ? 1 : 0;

    // K-factors
    const mafiaK = getKFactor(gamesPlayed[mafiaModel]);
    const townK = getKFactor(gamesPlayed[townModel]);

    // Update ELO
    const mafiaNewElo = Math.round(mafiaElo + mafiaK * (mafiaActual - mafiaExpected));
    const townNewElo = Math.round(townElo + townK * (townActual - townExpected));

    elo[mafiaModel] = mafiaNewElo;
    elo[townModel] = townNewElo;
    gamesPlayed[mafiaModel]++;
    gamesPlayed[townModel]++;

    // Track peak
    if (mafiaNewElo > peakElo[mafiaModel]) peakElo[mafiaModel] = mafiaNewElo;
    if (townNewElo > peakElo[townModel]) peakElo[townModel] = townNewElo;

    console.log(`${game.id}: ${mafiaModel} (${mafiaElo}→${mafiaNewElo}) vs ${townModel} (${townElo}→${townNewElo}) | Winner: ${game.winner}`);
  }

  // Update database
  console.log('\nUpdating database...');
  
  const updates = Object.keys(elo).map(modelId => ({
    modelId,
    elo: elo[modelId],
    games: gamesPlayed[modelId],
    peak: peakElo[modelId],
  }));

  // Sort by ELO
  updates.sort((a, b) => b.elo - a.elo);

  console.log('\nFinal Rankings:');
  for (const u of updates) {
    console.log(`  ${u.modelId}: ELO ${u.elo} (${u.games} games, peak ${u.peak})`);
  }

  // Execute updates
  for (const u of updates) {
    const escapedId = u.modelId.replace(/'/g, "''");
    const query = `UPDATE models SET elo_rating = ${u.elo}, elo_games_played = ${u.games}, elo_peak = ${u.peak}, elo_updated_at = ${Date.now()} WHERE id = '${escapedId}'`;
    try {
      runD1Query(query);
      console.log(`✓ Updated ${u.modelId}`);
    } catch (err) {
      console.error(`✗ Failed to update ${u.modelId}:`, err.message);
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);

