#!/usr/bin/env node
/**
 * Diagnostic script for batch API processing issues.
 * 
 * Usage: node scripts/diagnose-batch.js <batchId>
 * 
 * This script queries the production D1 database to understand:
 * - Batch status and progress
 * - Games in the batch and their states
 * - Batch API requests and their states (for discount pricing)
 * - Batch API jobs and their states
 */

import { execSync } from 'child_process';

const batchId = process.argv[2];

if (!batchId) {
  console.error('Usage: node scripts/diagnose-batch.js <batchId>');
  process.exit(1);
}

function runQuery(query, description) {
  console.log(`\n📊 ${description}...`);
  try {
    const result = execSync(
      `wrangler d1 execute mafia-arena --remote --json --command "${query.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
    const parsed = JSON.parse(result);
    if (parsed[0]?.results?.length > 0) {
      return parsed[0].results;
    }
    return [];
  } catch (error) {
    console.error(`❌ Query failed: ${error.message}`);
    return [];
  }
}

async function diagnose() {
  console.log(`\n🔍 Diagnosing batch: ${batchId}\n`);
  console.log('='.repeat(60));

  // 1. Get batch details
  const batches = runQuery(
    `SELECT * FROM batches WHERE id = '${batchId}'`,
    'Fetching batch details'
  );

  if (batches.length === 0) {
    console.log('❌ Batch not found in database');
    return;
  }

  const batch = batches[0];
  console.log('\n✅ Batch found:');
  console.log(`   ID: ${batch.id}`);
  console.log(`   Name: ${batch.name}`);
  console.log(`   Status: ${batch.status}`);
  console.log(`   Total Games: ${batch.total_games}`);
  console.log(`   Completed Games: ${batch.completed_games}`);
  console.log(`   Failed Games: ${batch.failed_games}`);
  console.log(`   Games Queued: ${batch.games_queued}`);
  console.log(`   Created At: ${batch.created_at ? new Date(batch.created_at * 1000).toISOString() : 'null'}`);
  console.log(`   Started At: ${batch.started_at ? new Date(batch.started_at * 1000).toISOString() : 'null'}`);
  console.log(`   Completed At: ${batch.completed_at ? new Date(batch.completed_at * 1000).toISOString() : 'null'}`);
  console.log(`   Estimated Cost: $${batch.estimated_cost_usd?.toFixed(4) || 'null'}`);
  console.log(`   Actual Cost: $${batch.actual_cost_usd?.toFixed(4) || 'null'}`);
  if (batch.error_message) {
    console.log(`   ⚠️  Error: ${batch.error_message}`);
  }

  // Parse config to check if discount pricing was used
  try {
    const config = JSON.parse(batch.config_json);
    console.log(`   Discount Pricing: ${config.gameConfig?.discountPricing ? 'YES' : 'NO'}`);
    console.log(`   Use Batch API: ${config.useBatchAPI ? 'YES' : 'NO'}`);
    if (config.gameConfig) {
      console.log(`   Player Count: ${config.gameConfig.playerCount}`);
      console.log(`   Mafia Count: ${config.gameConfig.mafiaCount}`);
    }
  } catch (e) {
    console.log(`   Config: Unable to parse`);
  }

  // 2. Get games in this batch
  console.log('\n' + '='.repeat(60));
  const gameStats = runQuery(
    `SELECT status, COUNT(*) as count FROM games WHERE batch_id = '${batchId}' GROUP BY status`,
    'Games by status'
  );

  console.log('\n✅ Games breakdown:');
  let totalGamesFound = 0;
  for (const stat of gameStats) {
    console.log(`   ${stat.status}: ${stat.count}`);
    totalGamesFound += stat.count;
  }
  console.log(`   Total games in DB: ${totalGamesFound}`);

  // 3. Get sample of running/queued games (these might be stuck)
  console.log('\n' + '='.repeat(60));
  const stuckGames = runQuery(
    `SELECT id, status, created_at, updated_at, last_activity, error_message 
     FROM games 
     WHERE batch_id = '${batchId}' AND status IN ('queued', 'running')
     ORDER BY created_at DESC
     LIMIT 10`,
    'Sample of running/queued games'
  );

  if (stuckGames.length > 0) {
    console.log('\n⚠️  Running/queued games (may be stuck):');
    for (const game of stuckGames) {
      const created = game.created_at ? new Date(game.created_at * 1000).toISOString() : 'null';
      const lastActivity = game.last_activity ? new Date(game.last_activity * 1000).toISOString() : 'null';
      const ageHours = game.created_at ? ((Date.now() / 1000 - game.created_at) / 3600).toFixed(1) : 'N/A';
      console.log(`   ${game.id.slice(0, 30)}... - ${game.status} - age: ${ageHours}h - last activity: ${lastActivity}`);
      if (game.error_message) {
        console.log(`      Error: ${game.error_message}`);
      }
    }
  } else {
    console.log('\n✅ No running/queued games found');
  }

  // 4. Check batch_api_requests for this batch's games
  console.log('\n' + '='.repeat(60));
  const batchApiStats = runQuery(
    `SELECT bar.status, COUNT(*) as count 
     FROM batch_api_requests bar
     INNER JOIN games g ON bar.game_id = g.id
     WHERE g.batch_id = '${batchId}'
     GROUP BY bar.status`,
    'Batch API requests by status'
  );

  if (batchApiStats.length > 0) {
    console.log('\n✅ Batch API requests breakdown:');
    for (const stat of batchApiStats) {
      console.log(`   ${stat.status}: ${stat.count}`);
    }

    // Check for pending/bundled requests (these are waiting)
    const pendingRequests = runQuery(
      `SELECT bar.id, bar.status, bar.model_id, bar.provider, bar.created_at, bar.batch_job_id, bar.error_message
       FROM batch_api_requests bar
       INNER JOIN games g ON bar.game_id = g.id
       WHERE g.batch_id = '${batchId}' AND bar.status IN ('pending', 'bundled', 'claiming')
       ORDER BY bar.created_at ASC
       LIMIT 20`,
      'Pending/bundled batch API requests'
    );

    if (pendingRequests.length > 0) {
      console.log('\n⚠️  Pending/bundled requests waiting for batch processing:');
      for (const req of pendingRequests) {
        const created = new Date(req.created_at).toISOString();
        const ageHours = ((Date.now() - req.created_at) / (1000 * 3600)).toFixed(1);
        console.log(`   ${req.id.slice(0, 20)}... - ${req.status} - ${req.provider}/${req.model_id} - age: ${ageHours}h`);
        if (req.batch_job_id) {
          console.log(`      Job ID: ${req.batch_job_id}`);
        }
      }
    }
  } else {
    console.log('\n✅ No batch API requests found (may use direct API)');
  }

  // 5. Check batch_api_jobs status
  console.log('\n' + '='.repeat(60));
  const activeJobs = runQuery(
    `SELECT id, provider, model_id, status, request_count, completed_count, failed_count, 
            provider_job_id, created_at, submitted_at, expires_at, error_message
     FROM batch_api_jobs
     WHERE status IN ('pending', 'uploading', 'submitted', 'processing')
     ORDER BY created_at DESC
     LIMIT 10`,
    'Active batch API jobs'
  );

  if (activeJobs.length > 0) {
    console.log('\n⚠️  Active batch API jobs:');
    for (const job of activeJobs) {
      const created = new Date(job.created_at).toISOString();
      const ageHours = ((Date.now() - job.created_at) / (1000 * 3600)).toFixed(1);
      console.log(`   ${job.id.slice(0, 20)}... - ${job.status} - ${job.provider}/${job.model_id}`);
      console.log(`      Requests: ${job.completed_count}/${job.request_count} completed, ${job.failed_count} failed`);
      console.log(`      Age: ${ageHours}h - Provider Job: ${job.provider_job_id || 'not submitted yet'}`);
      if (job.error_message) {
        console.log(`      Error: ${job.error_message}`);
      }
    }
  } else {
    console.log('\n✅ No active batch API jobs');
  }

  // 6. Check for recently failed batch jobs
  const failedJobs = runQuery(
    `SELECT id, provider, model_id, status, request_count, error_message, created_at, completed_at
     FROM batch_api_jobs
     WHERE status IN ('failed', 'expired')
     AND created_at > ${Date.now() - 48 * 60 * 60 * 1000}
     ORDER BY created_at DESC
     LIMIT 10`,
    'Recently failed batch API jobs (last 48h)'
  );

  if (failedJobs.length > 0) {
    console.log('\n❌ Recently failed/expired batch jobs:');
    for (const job of failedJobs) {
      const created = new Date(job.created_at).toISOString();
      console.log(`   ${job.id.slice(0, 20)}... - ${job.status} - ${job.provider}/${job.model_id}`);
      console.log(`      Created: ${created} - Requests: ${job.request_count}`);
      if (job.error_message) {
        console.log(`      Error: ${job.error_message}`);
      }
    }
  }

  // 7. Check error_log for this batch
  console.log('\n' + '='.repeat(60));
  const errors = runQuery(
    `SELECT id, message, context, created_at
     FROM error_log
     WHERE context LIKE '%${batchId}%'
     ORDER BY created_at DESC
     LIMIT 10`,
    'Error logs for this batch'
  );

  if (errors.length > 0) {
    console.log('\n❌ Recent errors:');
    for (const error of errors) {
      const created = error.created_at ? new Date(error.created_at).toISOString() : 'unknown';
      console.log(`   [${created}] ${error.message}`);
    }
  } else {
    console.log('\n✅ No errors found in error_log');
  }

  // 8. Summary and recommendations
  console.log('\n' + '='.repeat(60));
  console.log('\n📋 DIAGNOSIS SUMMARY:\n');
  
  const pendingGames = batch.total_games - batch.completed_games - batch.failed_games;
  const gamesNotQueued = batch.total_games - (batch.games_queued || 0);
  
  console.log(`   Batch Status: ${batch.status}`);
  console.log(`   Progress: ${batch.completed_games + batch.failed_games}/${batch.total_games} (${((batch.completed_games + batch.failed_games) / batch.total_games * 100).toFixed(1)}%)`);
  console.log(`   Pending Games: ${pendingGames}`);
  console.log(`   Games Not Yet Queued: ${gamesNotQueued}`);
  
  if (batchApiStats.length > 0) {
    const pending = batchApiStats.find(s => s.status === 'pending')?.count || 0;
    const bundled = batchApiStats.find(s => s.status === 'bundled')?.count || 0;
    console.log(`   Batch API Requests Pending: ${pending}`);
    console.log(`   Batch API Requests Bundled: ${bundled}`);
  }

  console.log('\n🔧 POSSIBLE ISSUES:\n');
  
  if (batch.status === 'queued' && gamesNotQueued > 0) {
    console.log('   ⚠️  Batch not fully queued - batch queue worker may be stuck');
    console.log('      → Check Cloudflare Queue dashboard for mafia-arena-batches');
  }
  
  if (stuckGames.length > 0) {
    console.log('   ⚠️  Games stuck in running/queued state');
    console.log('      → May be waiting for batch API results');
    console.log('      → Check Cloudflare Workflows dashboard');
  }

  if (batchApiStats.some(s => s.status === 'pending' && s.count > 0)) {
    console.log('   ⚠️  Batch API requests pending');
    console.log('      → Cron job should aggregate these every 5 minutes');
    console.log('      → Check cron job logs in Cloudflare dashboard');
  }
  
  if (batchApiStats.some(s => s.status === 'bundled' && s.count > 0)) {
    console.log('   ⚠️  Batch API requests bundled (in batch jobs)');
    console.log('      → Jobs submitted to provider, waiting for completion');
    console.log('      → Batch APIs can take up to 24 hours');
  }

  if (activeJobs.length > 0) {
    console.log('   ⚠️  Active batch API jobs');
    console.log('      → Jobs submitted to provider, waiting for completion');
    console.log('      → Batch APIs can take up to 24 hours');
    console.log('      → Check provider dashboard (Anthropic, OpenAI, etc.)');
  }

  if (failedJobs.length > 0) {
    console.log('   ❌ Failed batch API jobs');
    console.log('      → Check error messages above');
    console.log('      → May need to re-process games');
  }

  console.log('\n📌 USEFUL LINKS:\n');
  console.log('   Cloudflare Queues: https://dash.cloudflare.com/workers/queues');
  console.log('   Cloudflare Workflows: https://dash.cloudflare.com/workers/workflows');
  console.log('   Batch detail page: https://mafia-arena.com/batches/' + batchId);
}

diagnose().catch(console.error);
