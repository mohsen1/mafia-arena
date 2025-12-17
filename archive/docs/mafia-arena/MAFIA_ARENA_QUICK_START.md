# Mafia Arena - Quick Start Guide

**For Developers Starting Implementation**

---

## 🚀 Getting Started (First Day)

### 1. Review Documents (1 hour)

Read in this order:
1. `Mafia-Arena-Critique.md` - Understand what NOT to do
2. `Mafia-Arena-Design-v2.md` - Understand the correct approach
3. `MAFIA_ARENA_IMPLEMENTATION_PLAN.md` - Your roadmap (this is your bible)

### 2. Environment Setup (30 minutes)

```bash
# 1. Create feature branch
git checkout -b feature/mafia-arena

# 2. Create directories
mkdir -p src/lib/arena/{tests,types}
mkdir -p src/app/api/arena
mkdir -p src/components/arena
mkdir -p scripts/arena
mkdir -p docs/arena

# 3. Install any missing dependencies
pnpm install

# 4. Verify database is working
pnpm db:studio
# Should open Drizzle Studio - verify you see existing tables
```

### 3. Baseline Test (30 minutes)

**Create:** `scripts/arena/test-baseline.ts`

```typescript
/**
 * Quick test: Can we run AI vs AI games?
 */
import { Game } from '@/lib/engine/core/Game';
import { createAgentInstance } from '@/lib/agentFactory';

async function testOneGame() {
  console.log('🎮 Testing AI vs AI baseline...\n');
  
  const startTime = Date.now();
  
  try {
    // Create 4 Gemini Flash agents (cheapest option)
    const agents = await Promise.all(
      Array(4).fill(null).map(() => 
        createAgentInstance({
          agentType: 'Gemini',
          modelName: 'gemini-1.5-flash',
          providerValue: 'google',
        }, {
          apiKey: process.env.GOOGLE_API_KEY,
        })
      )
    );

    // Create game
    const game = await Game.createNewGame({
      theme: 'UK_VILLAGE_1900S',
      language: 'en',
      agents,
    });

    console.log('🎲 Starting game...');
    
    // Run to completion
    await game.runGameLoop();
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log('\n✅ Game completed!');
    console.log(`   Winner: ${game.getWinner()}`);
    console.log(`   Rounds: ${game.getRound()}`);
    console.log(`   Duration: ${duration.toFixed(1)}s`);
    console.log(`   Est. Cost: $${(duration * 0.0001).toFixed(4)}`); // Rough estimate
    
    return true;
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    return false;
  }
}

testOneGame().then(success => {
  process.exit(success ? 0 : 1);
});
```

**Run:**
```bash
pnpm tsx scripts/arena/test-baseline.ts
```

**Expected Output:**
```
🎮 Testing AI vs AI baseline...

🎲 Starting game...
[Game logs...]

✅ Game completed!
   Winner: Town
   Rounds: 8
   Duration: 145.3s
   Est. Cost: $0.0145
```

**If this fails:** Fix game engine issues before proceeding!

---

## 📋 Implementation Checklist

Use this to track progress:

### Phase 0: Foundation ✓
- [ ] Documents reviewed
- [ ] Environment setup
- [ ] Baseline test passed
- [ ] Cost modeling reviewed

### Phase 1: Core System ✓
- [ ] Database schema created (`schema-arena.ts`)
- [ ] Migration generated and applied
- [ ] Model registry implemented
- [ ] Models seeded (at least 3)
- [ ] ELO system implemented
- [ ] ELO tests passing (100%)
- [ ] Game queue implemented
- [ ] Game runner implemented
- [ ] Batch API route created
- [ ] First 10 test games run successfully

### Phase 2: Leaderboard ✓
- [ ] Leaderboard API endpoint
- [ ] Leaderboard UI component
- [ ] Model detail page
- [ ] Match history component
- [ ] Arena dashboard page
- [ ] Navigation updated

### Phase 3: Cost Controls ✓
- [ ] Cost tracking system
- [ ] Budget guards implemented
- [ ] Admin controls panel
- [ ] Cost analytics dashboard
- [ ] Alert system configured

### Phase 4: Polish ✓
- [ ] All unit tests passing (>90% coverage)
- [ ] Integration tests passing
- [ ] Performance optimized
- [ ] Caching implemented
- [ ] Rate limiting added
- [ ] Documentation complete

### Phase 5: Deploy ✓
- [ ] Staging deployment successful
- [ ] Smoke tests passed
- [ ] Production deployment successful
- [ ] Monitoring configured
- [ ] Soft launch complete
- [ ] Public launch! 🎉

---

## 🎯 Daily Goals (For Solo Developer)

### Week 1
- **Day 1:** Foundation + schema design
- **Day 2:** Database migration + model registry
- **Day 3:** ELO system + tests
- **Day 4:** Game queue
- **Day 5:** Game runner + batch API

### Week 2
- **Day 6:** Test batch runner (run 50 games)
- **Day 7:** Fix bugs from batch test
- **Day 8:** Leaderboard API
- **Day 9:** Leaderboard UI
- **Day 10:** Model detail pages

### Week 3
- **Day 11:** Match history + arena dashboard
- **Day 12:** Cost tracking system
- **Day 13:** Admin controls
- **Day 14:** Analytics dashboard
- **Day 15:** Buffer day / catch up

### Week 4
- **Day 16-18:** Testing + bug fixes
- **Day 19-20:** Performance optimization

### Week 5
- **Day 21-23:** Documentation
- **Day 24-25:** Staging deployment

### Week 6
- **Day 26-28:** Production deployment
- **Day 29-30:** Monitoring + soft launch

---

## ⚡ Quick Commands Reference

### Development
```bash
# Start dev server
pnpm dev

# Run tests
pnpm test
pnpm test:e2e

# Database
pnpm db:studio          # Open Drizzle Studio
pnpm db:generate        # Generate migration
pnpm db:push            # Apply migration
```

### Arena-Specific
```bash
# Seed models
pnpm tsx scripts/arena/seed-models.ts

# Run baseline test
pnpm tsx scripts/arena/test-baseline.ts

# Queue a game
curl -X POST http://localhost:3099/api/arena/queue \
  -H "Content-Type: application/json" \
  -d '{"aiModels":[{"aiModelId":"model-1"}], "themeKey":"UK_VILLAGE_1900S", "matchType":"ranked"}'

# Process queue
curl -X POST http://localhost:3099/api/arena/batch \
  -H "Content-Type: application/json" \
  -d '{"maxGames":5}'

# View leaderboard
curl http://localhost:3099/api/arena/leaderboard
```

### Database Queries
```bash
# Check queue status
wrangler d1 execute DB --command="SELECT status, COUNT(*) FROM arena_matches GROUP BY status"

# View recent matches
wrangler d1 execute DB --command="SELECT * FROM arena_matches ORDER BY created_at DESC LIMIT 10"

# Check model ratings
wrangler d1 execute DB --command="SELECT ai_models.name, model_ratings.rating FROM model_ratings JOIN ai_models ON model_ratings.ai_model_id = ai_models.id ORDER BY rating DESC"
```

---

## 🐛 Common Issues & Solutions

### Issue: "Database schema not found"
```bash
# Solution: Generate and apply migration
pnpm db:generate
pnpm db:push
```

### Issue: "Model not found in registry"
```bash
# Solution: Seed models
pnpm tsx scripts/arena/seed-models.ts
```

### Issue: "API key missing"
```bash
# Solution: Add to .env.local
echo "GOOGLE_API_KEY=your-key-here" >> .env.local
echo "OPENAI_API_KEY=your-key-here" >> .env.local
```

### Issue: "Game hangs/never completes"
```bash
# Solution: Add timeout to game runner
# In gameRunner.ts:
const timeout = setTimeout(() => {
  throw new Error('Game timeout after 30 minutes');
}, 30 * 60 * 1000);
```

### Issue: "Cost too high"
```bash
# Solution: Switch to cheaper models
# Use Gemini Flash or GPT-3.5 instead of GPT-4
```

---

## 📊 Success Metrics by Week

### Week 1: Core System
- ✅ 50+ games completed
- ✅ ELO ratings calculated
- ✅ Cost < $5
- ✅ 95% success rate

### Week 3: UI Complete
- ✅ 500+ games completed
- ✅ Leaderboard shows 5+ models
- ✅ Cost < $20
- ✅ UI loads in < 2s

### Week 6: Launch
- ✅ 2000+ games completed
- ✅ 10+ models ranked
- ✅ First user visits arena
- ✅ Cost < $50
- ✅ Zero crashes

---

## 🎓 Learning Resources

### SQLite/D1
- [D1 Documentation](https://developers.cloudflare.com/d1/)
- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [SQLite Tutorial](https://www.sqlitetutorial.net/)

### ELO Rating
- [ELO Rating System Explained](https://en.wikipedia.org/wiki/Elo_rating_system)
- [Team-based ELO](https://www.gautamnarula.com/rating/)

### Cloudflare Workers
- [Workers Docs](https://developers.cloudflare.com/workers/)
- [Workers Limitations](https://developers.cloudflare.com/workers/platform/limits/)

---

## 💡 Tips for Success

1. **Start Small:** Test with 1 model, 1 game before scaling
2. **Use Cheap Models:** Gemini Flash costs 50x less than GPT-4
3. **Log Everything:** You'll need logs when debugging
4. **Cache Aggressively:** D1 queries can be slow
5. **Set Budget Alerts:** Don't spend $1000 by accident
6. **Test in Production-Like Environment:** Use Cloudflare Pages preview
7. **Document As You Go:** Future you will thank you
8. **Ask for Help:** Share issues early, don't struggle alone

---

## 🚨 Red Flags - Stop and Fix!

**STOP IMMEDIATELY IF:**
- ❌ Daily cost exceeds $10
- ❌ Game success rate drops below 70%
- ❌ Average game duration exceeds 20 minutes
- ❌ Database queries take > 5 seconds
- ❌ Memory usage grows unbounded
- ❌ API rate limits hit frequently

---

## 📞 Getting Help

### Before Asking:
1. Check the critique document (common mistakes)
2. Review implementation plan (step-by-step guide)
3. Search existing issues
4. Check logs for error messages

### When Asking:
- Share full error message
- Include relevant code snippet
- Describe what you tried
- Share environment (local/staging/prod)

---

## 🎉 Milestones to Celebrate

- ✅ First game completes successfully
- ✅ First migration applied
- ✅ First model registered
- ✅ First ELO rating calculated
- ✅ Leaderboard shows data
- ✅ First user views arena
- ✅ 100 games milestone
- ✅ 1000 games milestone
- ✅ Production launch! 🚀

---

## Next Steps

1. **Read the critique** - Learn from mistakes
2. **Read the design** - Understand the system
3. **Read the plan** - Follow the roadmap
4. **Run the baseline test** - Validate everything works
5. **Start Phase 1** - Create database schema

**You're ready to build Mafia Arena! 🎮**

---

## Quick Reference: File Structure

```
werewolf-ai/
├── src/
│   ├── lib/
│   │   └── arena/
│   │       ├── types/
│   │       │   └── index.ts
│   │       ├── tests/
│   │       │   ├── elo.test.ts
│   │       │   ├── gameQueue.test.ts
│   │       │   └── gameRunner.test.ts
│   │       ├── modelRegistry.ts
│   │       ├── elo.ts
│   │       ├── gameQueue.ts
│   │       ├── gameRunner.ts
│   │       └── costTracking.ts
│   ├── app/
│   │   └── api/
│   │       └── arena/
│   │           ├── queue/route.ts
│   │           ├── batch/route.ts
│   │           ├── leaderboard/route.ts
│   │           └── costs/route.ts
│   └── components/
│       └── arena/
│           ├── Leaderboard.tsx
│           ├── ModelCard.tsx
│           ├── MatchHistory.tsx
│           └── AnalyticsDashboard.tsx
├── scripts/
│   └── arena/
│       ├── test-baseline.ts
│       ├── seed-models.ts
│       ├── cost-estimator.ts
│       └── run-batch.ts
└── docs/
    └── arena/
        ├── API.md
        ├── ADMIN.md
        └── USER_GUIDE.md
```

Good luck! 🚀
