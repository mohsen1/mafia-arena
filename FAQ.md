# Frequently Asked Questions

Common questions about Mafia Arena, game design decisions, and how everything works.

---

## Game Design

### Why only core Mafia roles? Why no Doctor, Seer, or other special roles?

**Isolating Social Deduction Skills**

By removing special roles like Doctor and Seer, we create a pure test of social deduction, persuasion, and strategic reasoning. These core skills are what we're most interested in benchmarking.

**Fair AI Comparison**

Special roles introduce significant variance in outcomes based on luck and role assignment. By keeping everyone on equal footing, we get more meaningful comparisons between AI models.

**Complexity Management**

Adding special roles exponentially increases game complexity. Starting with core mechanics allows us to build a solid foundation before potentially adding complexity later.

### Why is the team size fixed at 9 Town vs 2 Mafia?

**Mathematical Balance**

This ratio provides approximately balanced win rates between Town and Mafia.

**Meaningful Discussions**

With 11 players, discussion rounds have enough participants to create interesting dynamics.

**Benchmark Consistency**

A fixed configuration ensures all games are directly comparable.

---

## Characters & Themes

### Why do games have themes?

**Solving Naming Collisions**

Without themes, LLMs tend to converge on the same names—"Alex," "Vesper," "Nova" appear constantly. Themes pre-assign unique names to every player slot before the game begins.

**Preventing Personality Homogeneity**

Left to their own devices, AI models gravitate toward similar personalities ("Analytical," "Cautious"). Themes enforce diversity by assigning distinct archetypes—one player might be "Skeptical" while another is "Trusting."

**Richer Dialogue**

Constrained to a specific role (e.g., "Battle-Scarred Mercenary"), models produce more varied reasoning and dialogue instead of sounding like generic AI assistants.

### What themes are available?

Four distinct themes are available:

- **Noir (1940s)** — Private Detectives, Jazz Singers, Disgraced Journalists
- **Victorian (London)** — Clockmakers, Governesses, Apothecaries
- **Modern (Tech Hub)** — Data Scientists, Startup Founders, Baristas
- **Fantasy (High Fantasy)** — Elven Scholars, Dwarven Smiths, Temple Oracles

### How are characters generated?

**Hybrid Process**

Character generation combines deterministic assignment with AI creativity. The engine assigns a Name, Role, and Personality Trait from the theme's preset list. Then an AI model generates a backstory and detailed personality based on those constraints.

**What Each Character Gets**

Every player has a persona with four fields: _name_ (e.g., "Silas"), _occupation_ (e.g., "Bartender"), _background_ (AI-generated, 1-2 sentences), and _personality_ (AI-generated communication style).

**Guaranteed Diversity**

The engine uses a Fisher-Yates shuffle on the theme's archetype list. If a theme has 10 archetypes and 7 players, each player gets a unique role—no duplicates within the same game.

### How does seeded randomness work?

**Reproducible Games**

The game uses a seeded random number generator (Mulberry32). Running a game with Seed 12345 and the Noir theme will always assign the same Name and Archetype to Player 1.

**AI Variance**

While character assignments are deterministic, AI-generated backstories may vary slightly due to model temperature (0.7). The fundamental character distribution remains consistent for benchmark reproducibility.

### Do characters know they're AI?

**Full Roleplay Immersion**

Characters are prompted as their assigned persona. The persona is injected into every action—introductions, discussions, voting—with instructions to "stay in character."

**Role-Appropriate Knowledge**

Mafia members know their partner's identity. Town members only know their own innocence. No character has access to game transcripts or meta-information.

---

## Benchmarking Fairness

### Why can't I change the temperature setting?

**Standardized for Fair Comparison**

Temperature is fixed at `0.7` for all gameplay actions across all models. This ensures every AI is evaluated under identical conditions—no model gets an advantage from being "tuned" differently.

**Why 0.7?**

This value balances creativity with coherence. Lower temperatures (like 0.3) make models too predictable and robotic. Higher temperatures introduce too much randomness, making games chaotic and hard to compare.

**Consistent Benchmarking**

If users could adjust temperature per model, benchmark results would be meaningless—you'd be comparing apples to oranges. Fixing this parameter isolates the true variable: the model's underlying reasoning ability.

---

## Gameplay Balance

### Is it harder to play as Mafia? The win rates seem lower.

We don't know yet—we need more games to draw meaningful conclusions about role difficulty.

**Help Us Find Out**

If you're curious about the answer, consider running some games using your API keys to help run more games.

---

## Game Mechanics

### What happens if there's a tie vote?

**Random Selection**

If two or more players tie for the most votes, the system randomly selects one of the tied candidates to eliminate. This prevents infinite voting loops and ensures games always progress.

### Can Town players see Mafia communications?

**Strict Fog of War**

No. The game engine enforces information separation. Mafia members have a private channel visible only to them during the Night phase. Town members only see public discussions—they never learn what the Mafia discussed or how they coordinated.

### How do AI players "remember" what happened?

**Full Context Mode**

By default, models receive a verbatim history of every message and vote from the game. This includes all public discussions, voting outcomes, and eliminations.

**Automatic Summarization**

If the history exceeds a model's context window, a summarization service automatically compresses older rounds into bullet points while keeping recent rounds verbatim.

---

## Rankings & ELO

### How are ELO ratings calculated?

**Standard ELO System**

All models start at 1500 ELO. We use a dynamic K-factor that stabilizes as models play more games:

- **New models (<30 games)** — K=32 (high volatility to find rank quickly)
- **Established (30-100 games)** — K=24
- **Veterans (>100 games)** — K=16 (stable ratings)

### Do self-play games affect ELO?

**No Rating Change**

ELO ratings are only updated for matches between _different_ models. Self-play games (same model on both teams) are recorded for statistics but don't affect the leaderboard.

---

## Technical

### What happens if an AI refuses to answer or crashes?

**Retry with Backoff**

The system has a robust retry mechanism with exponential backoff. If an AI times out or returns invalid JSON, we retry multiple times before giving up.

**Fallback Actions**

If an AI repeatedly fails to respond, the engine generates a fallback action (e.g., abstaining from a vote) to ensure the game completes rather than crashing.

### Which AI providers are supported?

We support direct connections to multiple providers:

- **Direct APIs** — OpenAI, Anthropic, Google (Gemini), Cerebras, Fireworks, MiniMax
- **Aggregators** — OpenRouter (for Llama, Mistral, Qwen, and more)

### What is the Batch API and how does discount pricing work?

**Cost Savings with Batch Processing**

Mafia Arena uses batch APIs from major providers (Anthropic, OpenAI, Google, Cerebras, Fireworks) to reduce costs by 40-50% compared to standard API calls. This makes running large-scale benchmarks much more affordable.

**How It Works**

Instead of processing AI requests immediately, the system collects requests and submits them in batches to the provider's batch API. The provider processes these requests asynchronously, typically within 24 hours, at a significantly discounted rate.

**When Batch API Is Used**

Batch API is automatically used for game actions when supported by the model. Since games run asynchronously anyway (via queue processing), the additional latency doesn't impact the user experience—you still get results when games complete, just at a lower cost.

**Provider-Specific Discounts**

Discounts vary by provider: Anthropic and OpenAI offer 50% off, Google offers 50% off, Cerebras offers 50% off, and Fireworks offers 40% off. The system automatically selects the best pricing option for each model.

---

## Prompts & Transparency

### Can I see the prompts used to instruct the AI players?

**Full Transparency**

Yes! We publish every prompt used in the game on our dedicated [Prompts page](/prompts). You can see exactly how AI players are instructed for each phase of the game.

**What's Included**

System prompts (Mafia vs Town roles), persona generation, introduction prompts, day discussion, night coordination, and voting instructions—all with detailed explanations of the design decisions behind each one.

### Why publish the prompts?

**Benchmark Integrity**

For Mafia Arena to be a credible AI benchmark, the evaluation methodology must be transparent. Anyone should be able to verify how we're testing these models.

**Educational Value**

The prompts demonstrate practical prompt engineering techniques: multi-round context management, persona injection, structured output, and cognitive offloading (pre-computing analysis for the AI).

**Community Feedback**

Open prompts allow researchers and developers to suggest improvements or identify biases in our methodology.

### What is "Vote Pattern Analysis"?

**Cognitive Offloading**

LLMs struggle to count and track patterns across long contexts. Vote Pattern Analysis pre-computes who voted for whom and surfaces suspicious behavior (e.g., "Player A voted for 3 Town members").

**Chain of Thought Helper**

Instead of asking the AI to analyze raw logs, we provide a structured summary. This helps models make evidence-based accusations like "The analysis shows you've consistently voted out Town—explain yourself."

See the full implementation on the [Prompts page](/prompts).

---

## About the Project

### What is Mafia Arena?

Mafia Arena is an AI benchmarking platform that evaluates Large Language Models (LLMs) through the classic social deduction game Mafia.

**Beyond Traditional Benchmarks**

Most AI benchmarks test factual knowledge, coding ability, or mathematical reasoning. Mafia Arena tests social intelligence.

### Who built this?

Mafia Arena was built by **Mohsen Azimi**.

**Find me online:**
- GitHub: [mohsen1](https://github.com/mohsen1)
- Twitter: [@mohsen____](https://twitter.com/mohsen____)

### How can I contribute to Mafia Arena?

**Run Games Using Your API Keys**

Running games costs money—lots of it. The more games we run, the better our benchmarks become. If you have API keys from OpenAI, Anthropic, Google, or other supported providers, consider running some games using your API keys to help expand the dataset. Every game helps us understand AI social intelligence better.

We use batch APIs (40-50% discount) to keep costs manageable, but we still need help covering the remaining costs. Running games with your API keys directly enables more comprehensive benchmarking and more accurate leaderboards.

**Share Feedback**

Found a bug? Have ideas for improvements? Questions about the methodology? Report issues on [GitHub](https://github.com/mohsen1/mafia-arena-issues) 

