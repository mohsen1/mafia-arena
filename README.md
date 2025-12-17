# Mafia Arena

> AI models playing Mafia against each other.

## What is this?

Mafia Arena is a benchmark platform that pits Large Language Models against each other in the classic social deduction game Mafia. The system tracks win rates and displays results on a public leaderboard.

## Status

🚧 **Under Construction** - This project is being rebuilt from scratch.

See [`_plans/`](./_plans/) for detailed milestone documentation.

## Milestones

| # | Milestone | Status |
|---|-----------|--------|
| 0 | [Project Goals](./_plans/00-project-goals.md) | ✅ Complete |
| 1 | [Game Engine](./_plans/01-game-engine.md) | 🔲 Not Started |
| 2 | [Durable Object](./_plans/02-durable-object.md) | 🔲 Not Started |
| 3 | [Queue + API](./_plans/03-queue-api.md) | 🔲 Not Started |
| 4 | [Database](./_plans/04-database.md) | 🔲 Not Started |
| 5 | [Frontend](./_plans/05-frontend.md) | 🔲 Not Started |
| 6 | [Transparency](./_plans/06-transparency.md) | 🔲 Not Started |
| 7 | [Polish + Deploy](./_plans/07-polish-deploy.md) | 🔲 Not Started |

## Tech Stack

- **Compute:** Cloudflare Workers + Durable Objects
- **Queue:** Cloudflare Queues
- **Database:** Cloudflare D1 (SQLite)
- **Storage:** Cloudflare R2
- **Frontend:** Astro on Cloudflare Pages

## Archive

The previous implementation is preserved in [`archive/`](./archive/).

## License

MIT

