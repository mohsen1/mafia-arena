#!/usr/bin/env node
/**
 * Diagnostic script to check why a game is stuck.
 * 
 * Usage: node scripts/diagnose-game.js <gameId> [apiUrl]
 * 
 * Checks:
 * - Health endpoint
 * - Events endpoint
 * - Game details endpoint
 */

const gameId = process.argv[2];
const apiUrl = process.argv[3] || 'https://mafia-arena.com';

if (!gameId) {
  console.error('Usage: node scripts/diagnose-game.js <gameId> [apiUrl]');
  process.exit(1);
}

async function diagnose() {
  console.log(`\n🔍 Diagnosing game: ${gameId}\n`);
  console.log(`🌐 API URL: ${apiUrl}\n`);

  // Check health endpoint
  console.log('🏥 Checking health endpoint...');
  try {
    const healthRes = await fetch(`${apiUrl}/api/games/${gameId}/health`);
    if (healthRes.ok) {
      const health = await healthRes.json();
      console.log('✅ Health check:');
      console.log(`   Status: ${health.healthStatus}`);
      console.log(`   Message: ${health.healthMessage}`);
      console.log(`   Event Count: ${health.eventCount}`);
      console.log(`   Heartbeat: ${health.heartbeat?.timestamp ? new Date(health.heartbeat.timestamp).toISOString() : 'null'} (age: ${health.heartbeat?.ageMs ? Math.round(health.heartbeat.ageMs / 1000) + 's' : 'N/A'})`);
      console.log(`   Last Activity: ${health.activity?.timestamp ? new Date(health.activity.timestamp).toISOString() : 'null'} (age: ${health.activity?.ageMs ? Math.round(health.activity.ageMs / 1000) + 's' : 'N/A'})`);
      console.log(`   Current Phase: ${health.execution?.currentPhase || 'null'}`);
      console.log(`   Current Round: ${health.execution?.currentRound || 'null'}`);
      console.log(`   Duration: ${health.execution?.durationMs ? Math.round(health.execution.durationMs / 1000) + 's' : 'N/A'}`);
      if (health.zombie?.isZombie) {
        console.log(`   ⚠️  ZOMBIE DETECTED: ${health.zombie.timeSinceActivityMs ? Math.round(health.zombie.timeSinceActivityMs / (60 * 60 * 1000)) + 'h' : 'N/A'} since last activity`);
      }
      if (health.recommendedAction) {
        console.log(`   Recommended Action: ${health.recommendedAction}`);
      }
      if (health.suspenseReason) {
        console.log(`   Suspense Reason: ${health.suspenseReason}`);
      }
    } else {
      const text = await healthRes.text();
      console.log(`❌ Health check failed: ${healthRes.status} ${healthRes.statusText}`);
      console.log(`   Response: ${text}`);
    }
  } catch (error) {
    console.log(`❌ Health check error: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Check events endpoint
  console.log('\n📡 Checking events endpoint...');
  try {
    const eventsRes = await fetch(`${apiUrl}/api/games/${gameId}/events`);
    if (eventsRes.ok) {
      const events = await eventsRes.json();
      console.log('✅ Events check:');
      console.log(`   Status: ${events.status}`);
      console.log(`   Event Count: ${events.eventCount || 0}`);
      console.log(`   Events Array Length: ${events.events?.length || 0}`);
      if (events.batchStatus) {
        console.log(`   Batch Status: ${JSON.stringify(events.batchStatus, null, 2)}`);
      }
      if (events.progress) {
        console.log(`   Progress: ${events.progress.current}/${events.progress.total} - ${events.progress.label}`);
      }
      if (events.waitingFor) {
        console.log(`   Waiting For: ${JSON.stringify(events.waitingFor, null, 2)}`);
      }
      if (events.events && events.events.length > 0) {
        console.log(`   First Event: ${events.events[0].type} at ${new Date(events.events[0].timestamp).toISOString()}`);
        console.log(`   Last Event: ${events.events[events.events.length - 1].type} at ${new Date(events.events[events.events.length - 1].timestamp).toISOString()}`);
      } else {
        console.log(`   ⚠️  No events found - game may not have started yet`);
      }
    } else {
      const text = await eventsRes.text();
      console.log(`❌ Events check failed: ${eventsRes.status} ${eventsRes.statusText}`);
      console.log(`   Response: ${text}`);
    }
  } catch (error) {
    console.log(`❌ Events check error: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Check game details endpoint
  console.log('\n📊 Checking game details endpoint...');
  try {
    const gameRes = await fetch(`${apiUrl}/api/games/${gameId}`);
    if (gameRes.ok) {
      const game = await gameRes.json();
      console.log('✅ Game details:');
      console.log(`   Status: ${game.status}`);
      console.log(`   Created: ${game.createdAt ? new Date(game.createdAt).toISOString() : 'null'}`);
      console.log(`   Updated: ${game.updatedAt ? new Date(game.updatedAt).toISOString() : 'null'}`);
      console.log(`   Last Activity: ${game.lastActivity ? new Date(game.lastActivity).toISOString() : 'null'}`);
      console.log(`   Discount Pricing: ${game.discountPricing ? 'Yes' : 'No'}`);
      console.log(`   Trace ID: ${game.traceId || 'null'}`);
      if (game.errorMessage) {
        console.log(`   Error: ${game.errorMessage}`);
      }
    } else {
      const text = await gameRes.text();
      console.log(`❌ Game details check failed: ${gameRes.status} ${gameRes.statusText}`);
      console.log(`   Response: ${text}`);
    }
  } catch (error) {
    console.log(`❌ Game details check error: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log('\n📋 Summary:');
  console.log(`   Check Cloudflare Dashboard for workflow status:`);
  console.log(`   https://dash.cloudflare.com/workers/workflows`);
  console.log(`   Look for workflow ID: ${gameId}`);
}

diagnose().catch(console.error);
