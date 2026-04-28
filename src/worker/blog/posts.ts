/**
 * Blog posts data.
 * Super simple: just an array of posts with markdown content.
 */

export interface BlogPost {
  slug: string;
  title: string;
  author: string;
  date: string; // ISO date
  summary: string;
  content: string;
}

export const posts: BlogPost[] = [
  {
    slug: 'external-workers-api-key-isolation',
    title: 'External Workers: Zero-Trust API Key Isolation for AI Benchmarks',
    author: 'Mohsen Azimi',
    date: '2025-01-04',
    summary: 'How we built a system that lets users bring their own API keys while maintaining cryptographic isolation and benchmark integrity.',
    content: `
When you're running an AI benchmark like Mafia Arena, you face a fundamental tension: **users want to use their own API keys** (to control costs, use private models, or avoid rate limits), but **you need to verify they're not cheating**.

We solved this with **External Workers**—a zero-trust architecture where API keys never touch our servers, but we can still verify game integrity.

## The Problem

Traditional approaches have tradeoffs:

1. **Platform-managed keys**: Safe for the benchmark, but users can't bring their own models or manage costs.
2. **User-submitted keys**: Users get control, but now you're storing their secrets. If you're compromised, so are they.
3. **Honor system**: Just trust users not to cheat. Obviously doesn't work for a competitive benchmark.

## The Solution: User-Hosted Workers

Users deploy their own Cloudflare Worker that:
- Stores their API keys (as Cloudflare secrets—we never see them)
- Proxies AI requests from our game engine
- Responds to verification challenges

\`\`\`
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Mafia Arena   │────▶│  User's Worker   │────▶│  AI Provider    │
│   (our server)  │     │  (their account) │     │  (OpenAI, etc)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │
        │ Bearer Token          │ API Keys
        │ (user controls)       │ (never shared)
\`\`\`

The user's worker runs in **their** Cloudflare account. We authenticate with a bearer token they set. Their API keys are stored as Cloudflare secrets that even Cloudflare can't read (they're encrypted at rest).

## The Verification Problem

Here's the tricky part: if the worker is in the user's account, how do we know they're running our code and not some modified version that cheats?

Perfect verification is **cryptographically impossible**. There's no Cloudflare API to get a hash of deployed worker code. We can't prove what code is running—only observe its behavior.

So we use **defense in depth**:

### 1. Challenge-Response Protocol

Our game engine occasionally sends a challenge:

\`\`\`json
{
  "nonce": "a7f3b2c1...",
  "timestamp": 1704369600000
}
\`\`\`

The worker must respond with \`SHA-256(nonce + version)\`. If you've modified the code, you'd need to re-implement this exactly—and any bug would be detectable.

### 2. Timing Analysis

We measure response latency. Legitimate AI calls take 200ms-30s. If responses come back in 10ms, something's wrong (cached responses? pre-computed moves?).

\`\`\`typescript
if (latencyMs < 50) {
  anomalyScore = 1.0; // Suspiciously fast
}
\`\`\`

### 3. Behavioral Patterns

Over many games, we track:
- Win rates (is this model suddenly winning 95% of games?)
- Vote patterns (always voting the same way?)
- Response distribution (are responses too similar?)

Outliers get flagged for review.

### 4. Trust Scores

Every user has a trust score (0-100%) based on verification history. Low trust? Your games contribute less to the leaderboard until you build up history.

\`\`\`sql
UPDATE user_reputation
SET trust_score = MIN(1.0, trust_score + 0.1)
WHERE user_id = ? AND verification_passed = true
\`\`\`

## Why This Works

Perfect verification isn't possible, but we don't need it. We need cheating to be:

1. **Detectable**: Multiple signals that correlate
2. **Risky**: Your trust score tanks if caught
3. **Not worth it**: The effort to cheat exceeds the benefit

For a competitive leaderboard, this is enough. Casual cheaters get caught quickly. Sophisticated cheaters would need to perfectly mimic legitimate AI behavior—at which point, why not just run the real model?

## Getting Started

Deploy your own external worker in 5 minutes:

\`\`\`bash
git clone https://github.com/mohsen1/mafia-arena.git
cd mafia-arena/external-worker-template
npm install
npx wrangler deploy

# Add your secrets
npx wrangler secret put AUTH_TOKEN
npx wrangler secret put OPENAI_API_KEY
\`\`\`

Then register it at [mafia-arena.com/account](https://mafia-arena.com/account).

## What's Next

We're considering:
- **Delayed ELO**: Hold ratings in escrow for 24h while verification runs
- **Community flagging**: Let users flag suspicious games for review
- **Model fingerprinting**: Detect if responses match known model signatures

The goal isn't perfect security—it's making honest participation the path of least resistance.

---

Read the [full documentation](/docs/EXTERNAL_WORKERS.md) or [browse the code](https://github.com/mohsen1/mafia-arena/tree/main/external-worker-template).
    `.trim(),
  },
  {
    slug: 'building-mafia-arena',
    title: 'Building Mafia Arena: Benchmarking LLM Social Intelligence',
    author: 'Mohsen Azimi',
    date: '2025-12-30',
    summary: 'Why Mafia is the perfect game for testing AI social intelligence, and how I built a serverless platform to run thousands of games.',
    content: `
**[Mafia Arena](https://mafia-arena.com)** is a benchmarking playground where LLMs play the social deduction game *Mafia* against each other.

Why Mafia? Because it forces the interesting stuff:
- Keeping a story consistent across many turns
- Reading what other players believe (and how they'll react)
- Persuasion under uncertainty
- Lying as a first-class mechanic

## Benchmarking "Social Intelligence"

Benchmarks like MMLU test knowledge. They don't really test **social intelligence**.

There's a growing pile of research that treats social games as the best testbed we have right now:
- **Cicero (Meta)**: language + strategy to play [Diplomacy](https://noambrown.github.io/papers/22-Science-Diplomacy-TR.pdf).
- **Park et al.**: [Generative Agents](https://arxiv.org/abs/2304.03442) (memory + reflection in a simulated town).
- **Werewolf Arena**: LLM evaluation through a deduction game ([paper](https://arxiv.org/pdf/2407.13943)).
- **WOLF**: a framework that quantifies deception in Werewolf and highlights a big problem: the [Deception-Detection Gap](https://arxiv.org/html/2512.09187v1).
- **WereAlign / Beyond Survival**: "human-aligned" evaluation for SDGs ([paper](https://arxiv.org/html/2510.11389v1)).
- **Mini-Mafia**: deceptively small game, surprisingly useful for measuring deceive/detect/disclose dynamics ([paper](https://www.researchgate.net/publication/395969659_Deceive_Detect_and_Disclose_Large_Language_Models_Play_Mini-Mafia)).

One theme I keep seeing: models can be *very* good at sounding confident and normal, but they're not equally good at catching lies. Also, the ecosystem is full of weird emergent behaviors (Mini-Mafia has a "name bias" where models trust "Bob" more than "Diana", which is both funny and depressing).

I built Mafia Arena because I wanted something practical: not just a paper result, but a system where anyone can run thousands of games and get real data.

## The Architecture (the fun part)

I had a few hard constraints:
- I didn't want servers.
- I wanted reliability in the face of flaky and super slow AI APIs.
- The real villain is cost.

So the platform lives on Cloudflare:
- Workers for HTTP APIs
- Queues for batch fan-out
- Workflows for the long-running game loop
- D1 for structured data (games, leaderboard, stats)
- R2 for large transcripts
- Durable Objects for live WebSockets

### 1) A pure game engine (boring on purpose)

The game logic is a pure TypeScript module. No DB, no fetches, no Cloudflare APIs. It's pure state transitions, which means it's testable and replayable.

\`\`\`typescript
const nextState = gameEngine.process(state, event);
\`\`\`

### 2) Workflows, because batch pricing is worth the pain

If you run LLM games naïvely, it gets expensive fast.

Batch APIs can cut costs by ~50%, but they're asynchronous. You submit a big job, then you wait up to 24 hours for a response. 

This is why I leaned hard on **Cloudflare Workflows**. A Workflow can "pause", persist state, and resume later when results show up, without me building a custom distributed state machine.

### 3) Two queues, because scale is messy

A batch is one message. The batch consumer explodes it into N games (game events really) and pushes them into a game queue. Game consumers then start Workflows per game. 

### 4) D1 + R2: SQL for queries, blobs for reality

Transcripts get big. D1 is great for leaderboard queries, not for megabytes of text. So metadata goes to D1, and full transcripts go to R2.


## Run some games

If you're curious, go to **[mafia-arena.com](https://mafia-arena.com)** and run a batch.

*   **Run a Batch**: Pit GPT-5.2 against Claude 4.5 Sonnet (or whatever models you're into).
*   **Read the Transcripts**: Look for the [Deception-Detection Gap](https://arxiv.org/html/2512.09187v1) in the wild.

Let's find out which AI is the best liar—and if any of them can actually catch one.
    `.trim(),
  },
];

/**
 * Get all posts (for listing).
 */
export function getAllPosts(): Omit<BlogPost, 'content'>[] {
  return posts.map(({ content, ...rest }) => rest);
}

/**
 * Get a single post by slug.
 */
export function getPostBySlug(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}

