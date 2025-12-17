# Mafia Arena - Project Goals

## Vision Statement

**Mafia Arena** is a public demo/portfolio project that benchmarks Large Language Models by having them play the social deduction game Mafia against each other. The system tracks win rates, displays results on a leaderboard, and exposes full game transcripts for transparency.

## Target Audience

1. **AI/ML enthusiasts** curious about how different models perform at deception and social reasoning
2. **Potential employers/clients** evaluating engineering skills
3. **Developers** interested in Cloudflare's edge computing primitives

---

## Core Decisions

| Category | Decision |
|----------|----------|
| **Project Name** | Mafia Arena |
| **Scale** | Demo/Portfolio |
| **Infrastructure** | Cloudflare-native (Workers, D1, R2, Queues, Durable Objects) |
| **Player Count** | Configurable per game |
| **Roles** | Mafia + Villager only (no special roles) |
| **Discussion Phase** | Yes - AIs discuss before voting |
| **Model List** | Fixed, curated |
| **API Keys** | Project owner's keys only |
| **Matchup Style** | Homogeneous teams (Mafia = Model A, Town = Model B) |
| **Sample Size** | 10-50 games per matchup |
| **Triggering** | Manual only |
| **Concurrency** | 10+ simultaneous games |
| **AI Failure Handling** | Retry with backoff (up to 3 attempts) |
| **Leaderboard View** | Role-based (separate Mafia/Town rankings) |
| **Transparency** | Full debug (prompts, responses, tokens) |
| **UI Style** | Minimal, data-focused |
| **Access** | Fully public |
| **MVP Priority** | Games running reliably first |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Trigger Layer                            │
│                   (CLI / Admin API Endpoint)                    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare Compute                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │  CF Worker  │───▶│  CF Queue   │───▶│  Durable Objects    │ │
│  │    (API)    │    │ (Game Queue)│    │  (Game Runners)     │ │
│  └─────────────┘    └─────────────┘    └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
        │   OpenAI    │ │  Anthropic  │ │  Google AI  │
        └─────────────┘ └─────────────┘ └─────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare Storage                          │
│  ┌─────────────────────────┐    ┌─────────────────────────────┐│
│  │  D1 (Games and Stats)   │    │  R2 (Full Transcripts)      ││
│  └─────────────────────────┘    └─────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Cloudflare Pages                           │
│  ┌───────────┐  ┌───────────┐  ┌───────────────────────────┐   │
│  │Leaderboard│  │ Game List │  │      Game Replay          │   │
│  └───────────┘  └───────────┘  └───────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Non-Goals (Explicitly Out of Scope)

| Feature | Rationale |
|---------|-----------|
| Human players | Adds real-time complexity |
| Live game streaming | Games run async in background |
| Multiple game types | Focus on Mafia only |
| User accounts | Public demo, no auth needed |
| Bring Your Own Key | Simplifies key management |

---

## Success Criteria

1. **Reliability:** 95%+ of triggered games complete without errors
2. **Performance:** Average game completes in under 3 minutes
3. **Transparency:** Any game can be fully audited (prompts, responses, decisions)
4. **Accessibility:** Leaderboard loads in under 2 seconds worldwide
5. **Cost:** Stays within Cloudflare free tier for typical usage

---

## Milestones

| # | Name | Description | Deploy |
|---|------|-------------|--------|
| 1 | Game Engine | Pure TS engine, fully tested | N/A (library) |
| 2 | Durable Object | DO wrapper for game execution | Workers |
| 3 | Queue + API | Game scheduling system | Workers |
| 4 | Database | D1 schema, stats aggregation | D1 |
| 5 | Frontend | Leaderboard, game list | Pages |
| 6 | Transparency | Full prompt/response visibility | Pages |
| 7 | Polish | Error handling, rate limiting | Production |

Each milestone is documented in `_plans/0X-*.md`.

---

## Deployment

- **Domain:** Single domain, deployed incrementally (e.g., `mafia-arena.pages.dev`)
- **Repository:** Same git repo, archived legacy code in `/archive`
- **CI/CD:** Deploy after each milestone completion

