# Milestone 7: Polish + Production Deploy

## Objective

Finalize the project for production: error handling, rate limiting, monitoring, documentation, and a clean production deployment.

## Deliverables

1. **Error Handling**
   - Graceful degradation
   - User-friendly error pages
   - Error logging

2. **Rate Limiting**
   - API rate limits
   - Cost controls

3. **Monitoring**
   - Basic analytics
   - Error tracking

4. **Documentation**
   - README
   - API documentation
   - About page content

5. **Production Deploy**
   - Custom domain (optional)
   - Environment separation
   - Final review

## Error Handling

### API Error Responses

```typescript
// src/worker/utils/errors.ts

export class APIError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }

  toResponse(): Response {
    return Response.json(
      {
        error: {
          code: this.code,
          message: this.message,
          details: this.details,
        },
      },
      { status: this.statusCode }
    );
  }
}

export const Errors = {
  NotFound: (resource: string) => 
    new APIError(404, 'NOT_FOUND', `${resource} not found`),
  
  BadRequest: (message: string) => 
    new APIError(400, 'BAD_REQUEST', message),
  
  RateLimited: () => 
    new APIError(429, 'RATE_LIMITED', 'Too many requests'),
  
  Internal: (message = 'Internal server error') => 
    new APIError(500, 'INTERNAL_ERROR', message),
};
```

### Global Error Handler

```typescript
// src/worker/index.ts

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error('Unhandled error:', error);
      
      if (error instanceof APIError) {
        return error.toResponse();
      }
      
      return Errors.Internal().toResponse();
    }
  },
};
```

### Frontend Error Pages

```astro
---
// src/pages/404.astro
import Layout from '../components/Layout.astro';
---

<Layout title="Not Found">
  <div class="error-page">
    <h1>404</h1>
    <p>Page not found</p>
    <a href="/">← Back to Leaderboard</a>
  </div>
</Layout>
```

## Rate Limiting

### Simple Token Bucket (KV-based)

```typescript
// src/worker/utils/rateLimit.ts

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number }> {
  const now = Date.now();
  const windowKey = `ratelimit:${key}:${Math.floor(now / config.windowMs)}`;
  
  const current = parseInt(await kv.get(windowKey) || '0');
  
  if (current >= config.maxRequests) {
    return { allowed: false, remaining: 0 };
  }
  
  await kv.put(windowKey, String(current + 1), {
    expirationTtl: Math.ceil(config.windowMs / 1000),
  });
  
  return { allowed: true, remaining: config.maxRequests - current - 1 };
}
```

### API Rate Limits

```typescript
// Apply to game creation endpoint
const RATE_LIMITS = {
  'POST /api/games/run': { maxRequests: 10, windowMs: 60_000 },  // 10 per minute
  'GET /api/*': { maxRequests: 100, windowMs: 60_000 },          // 100 per minute
};
```

## Cost Controls

### Daily Budget Check

```typescript
// src/worker/utils/budget.ts

const DAILY_BUDGET_USD = 5.00;

export async function checkBudget(db: D1Database): Promise<{ allowed: boolean; spent: number }> {
  const today = new Date().toISOString().split('T')[0];
  
  const result = await db
    .prepare(`
      SELECT SUM(total_tokens) as tokens 
      FROM games 
      WHERE date(created_at, 'unixepoch') = ?
    `)
    .bind(today)
    .first<{ tokens: number }>();
  
  const tokens = result?.tokens || 0;
  const estimatedCost = tokens * 0.00001; // Rough estimate
  
  return {
    allowed: estimatedCost < DAILY_BUDGET_USD,
    spent: estimatedCost,
  };
}
```

## Monitoring

### Basic Analytics (via Workers Analytics Engine)

```typescript
// src/worker/utils/analytics.ts

export function trackEvent(env: Env, event: string, data: Record<string, unknown>) {
  // Use Cloudflare Workers Analytics Engine
  env.ANALYTICS?.writeDataPoint({
    blobs: [event],
    doubles: [Date.now()],
    indexes: [event],
  });
}
```

### Error Logging

```typescript
// Simple error logging to D1

export async function logError(db: D1Database, error: Error, context: Record<string, unknown>) {
  await db.prepare(`
    INSERT INTO error_log (id, message, stack, context, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    error.message,
    error.stack,
    JSON.stringify(context),
    Date.now()
  ).run();
}
```

## Documentation

### README.md

```markdown
# Mafia Arena

AI models playing Mafia against each other.

## What is this?

Mafia Arena benchmarks Large Language Models by having them play the 
social deduction game Mafia. The system tracks win rates and displays 
results on a public leaderboard.

## How it works

1. Games are configured with two teams of AI models
2. Models play Mafia with discussion and voting phases
3. Results are aggregated into a leaderboard
4. Full game transcripts are available for inspection

## Tech Stack

- **Compute:** Cloudflare Workers + Durable Objects
- **Database:** Cloudflare D1
- **Storage:** Cloudflare R2
- **Frontend:** Astro on Cloudflare Pages

## Links

- [Leaderboard](https://mafia-arena.pages.dev)
- [API Documentation](https://mafia-arena.pages.dev/api-docs)
- [Source Code](https://github.com/...)

## Local Development

\`\`\`bash
# Install dependencies
pnpm install

# Run locally
pnpm dev

# Deploy
pnpm deploy
\`\`\`

## License

MIT
```

### About Page Content

```markdown
## How Games Work

Each game consists of two teams:
- **Mafia** (minority) - Try to eliminate all Town members
- **Town** (majority) - Try to identify and eliminate all Mafia

### Phases

1. **Night** - Mafia secretly votes to kill a Town member
2. **Day Discussion** - All players discuss suspicions
3. **Day Vote** - All players vote to eliminate someone

### Win Conditions

- **Mafia wins:** When Mafia members equal or outnumber Town
- **Town wins:** When all Mafia members are eliminated

## Benchmarking Methodology

- Games use "homogeneous teams" - all Mafia players use one model, all Town players use another
- Each matchup runs 10-50 games for statistical significance
- Win rates are tracked separately for Mafia and Town roles

## Models Tested

- GPT-4o, GPT-4o Mini (OpenAI)
- Claude 3.5 Sonnet, Claude 3 Haiku (Anthropic)
- Gemini 1.5 Pro, Gemini 1.5 Flash (Google)

## Transparency

Every game transcript is publicly available, including:
- Full prompts sent to each model
- Complete model responses
- Token usage and estimated costs
```

## Production Checklist

### Environment Variables

```bash
# Set production secrets
wrangler secret put OPENAI_API_KEY --env production
wrangler secret put ANTHROPIC_API_KEY --env production
wrangler secret put GOOGLE_AI_API_KEY --env production
```

### Wrangler Production Config

```toml
# wrangler.toml

[env.production]
name = "mafia-arena"
routes = [{ pattern = "api.mafia-arena.com", zone_name = "mafia-arena.com" }]

[[env.production.d1_databases]]
binding = "DB"
database_name = "mafia-arena-prod"
database_id = "xxx"
```

### Deploy Commands

```bash
# Deploy Workers
wrangler deploy --env production

# Deploy Pages
# (automatic via Git integration)
```

## Final Review Checklist

- [ ] All API endpoints return proper error responses
- [ ] Rate limiting is in place
- [ ] Daily budget check prevents runaway costs
- [ ] Error logging captures issues
- [ ] README is complete
- [ ] About page explains the project
- [ ] Custom domain configured (optional)
- [ ] HTTPS working
- [ ] All secrets are set in production
- [ ] Database migrations applied to production
- [ ] R2 bucket is publicly accessible for transcripts

## Post-Launch

- Monitor error logs daily for the first week
- Check cost reports in Cloudflare dashboard
- Gather feedback and iterate

## Estimated Effort

- **Time:** 2-3 days
- **Files:** ~10 files
- **Deploy:** Final production release

---

## Project Complete! 🎉

After this milestone, Mafia Arena is a fully functional, publicly accessible AI benchmark platform.

