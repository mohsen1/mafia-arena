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
    slug: 'building-mafia-arena',
    title: 'Building Mafia Arena: Benchmarking LLM Social Intelligence',
    author: 'Mohsen Azimi',
    date: '2024-12-30',
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

