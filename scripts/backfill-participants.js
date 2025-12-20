#!/usr/bin/env node
/**
 * Backfill game_participants from R2 transcripts.
 * 
 * Usage:
 *   node scripts/backfill-participants.js
 * 
 * This script:
 * 1. Fetches all completed games that don't have participants
 * 2. For each game, fetches the transcript from R2
 * 3. Inserts participants into game_participants table
 */

const API_URL = 'https://mafia-arena.me-f9a.workers.dev';

async function fetchGames() {
  const res = await fetch(`${API_URL}/api/games?limit=100&status=completed`);
  const data = await res.json();
  return data.games;
}

async function fetchTranscript(gameId) {
  const res = await fetch(`${API_URL}/api/games/${gameId}/transcript`);
  if (!res.ok) {
    console.error(`  Failed to fetch transcript for ${gameId}: ${res.status}`);
    return null;
  }
  return res.json();
}

async function main() {
  console.log('Fetching games...');
  const games = await fetchGames();
  console.log(`Found ${games.length} completed games`);
  
  const inserts = [];
  
  for (const game of games) {
    if (game.participants && game.participants.length > 0) {
      console.log(`  ${game.id}: already has participants, skipping`);
      continue;
    }
    
    console.log(`  ${game.id}: fetching transcript...`);
    const transcript = await fetchTranscript(game.id);
    
    if (!transcript || !transcript.result || !transcript.result.participants) {
      console.log(`    No participants in transcript, skipping`);
      continue;
    }
    
    for (const p of transcript.result.participants) {
      inserts.push({
        id: `${game.id}_${p.modelId}_${p.team}`,
        game_id: game.id,
        model_id: p.modelId,
        team: p.team,
        player_count: p.playerCount,
        won: p.won ? 1 : 0,
        consistency_score: p.consistencyScore || null,
      });
    }
    console.log(`    Found ${transcript.result.participants.length} participants`);
  }
  
  if (inserts.length === 0) {
    console.log('\nNo participants to insert.');
    return;
  }
  
  console.log(`\n--- SQL to run via wrangler d1 execute ---\n`);
  
  for (const p of inserts) {
    const consistencyValue = p.consistency_score !== null ? p.consistency_score : 'NULL';
    console.log(
      `INSERT OR IGNORE INTO game_participants (id, game_id, model_id, team, player_count, won, consistency_score) ` +
      `VALUES ('${p.id}', '${p.game_id}', '${p.model_id}', '${p.team}', ${p.player_count}, ${p.won}, ${consistencyValue});`
    );
  }
}

main().catch(console.error);

