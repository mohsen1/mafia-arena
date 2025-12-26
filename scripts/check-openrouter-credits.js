#!/usr/bin/env node

/**
 * Check OpenRouter account credits/balance
 * 
 * Usage:
 *   node scripts/check-openrouter-credits.js
 * 
 * Requires OPENROUTER_API_KEY environment variable
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error('❌ Error: OPENROUTER_API_KEY environment variable not set');
  console.error('\nSet it with:');
  console.error('  export OPENROUTER_API_KEY="your-key-here"');
  console.error('\nOr run with:');
  console.error('  OPENROUTER_API_KEY="your-key" node scripts/check-openrouter-credits.js');
  process.exit(1);
}

async function checkCredits() {
  try {
    console.log('🔍 Checking OpenRouter account balance...\n');

    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${error}`);
    }

    const data = await response.json();

    console.log('📊 Account Information:');
    console.log('━'.repeat(50));
    
    if (data.data) {
      const info = data.data;
      
      // Credits/balance
      if (info.limit !== undefined) {
        const limit = parseFloat(info.limit);
        const usage = parseFloat(info.usage || 0);
        const remaining = limit - usage;
        
        console.log(`💰 Total Credit Limit: $${limit.toFixed(2)}`);
        console.log(`📈 Total Usage:        $${usage.toFixed(2)}`);
        console.log(`💵 Credits Remaining:  $${remaining.toFixed(2)}`);
        
        if (remaining < 1) {
          console.log('\n⚠️  WARNING: Low credits! Add more at https://openrouter.ai/settings/credits');
        } else if (remaining < 5) {
          console.log('\n⚡ Note: Credits running low. Consider adding more soon.');
        } else {
          console.log('\n✅ Credit balance looks good!');
        }
      }
      
      // Rate limit info
      if (info.rate_limit) {
        console.log('\n🚦 Rate Limits:');
        console.log(`   Requests: ${info.rate_limit.requests || 'N/A'}`);
        console.log(`   Interval: ${info.rate_limit.interval || 'N/A'}`);
      }
      
      // Key label
      if (info.label) {
        console.log(`\n🏷️  Key Label: ${info.label}`);
      }
      
      // Is free tier?
      if (info.is_free_tier !== undefined) {
        console.log(`\n🎁 Free Tier: ${info.is_free_tier ? 'Yes' : 'No'}`);
      }
      
    } else {
      // Fallback: show raw response
      console.log(JSON.stringify(data, null, 2));
    }
    
    console.log('━'.repeat(50));
    console.log('\n💳 Add credits: https://openrouter.ai/settings/credits');
    console.log('📊 View usage:  https://openrouter.ai/activity');
    
  } catch (error) {
    console.error('❌ Error checking credits:', error.message);
    process.exit(1);
  }
}

checkCredits();



