# Milestone 5: Frontend MVP

## Objective

Build a minimal, data-focused frontend using Cloudflare Pages that displays the leaderboard and lists completed games.

## Deliverables

1. **Leaderboard Page** (`/`)
   - Role-based rankings (Mafia / Town tabs)
   - Model stats table

2. **Games List Page** (`/games`)
   - Reverse chronological list
   - Basic filtering

3. **Game Detail Page** (`/games/:id`)
   - Game metadata
   - Participant summary
   - Link to full transcript

4. **Shared Layout**
   - Navigation
   - Minimal styling

## Tech Stack Decision

**Recommended: Astro with CF Pages adapter**

| Option | Pros | Cons |
|--------|------|------|
| **Astro** | Zero JS by default, fast, CF adapter | Less familiar |
| Next.js | Familiar, full-featured | Heavier, complex CF setup |
| SvelteKit | Fast, good DX | Another framework to learn |
| Plain HTML | Simplest | No templating, tedious |

Astro is ideal for a data-display site: server-renders pages, minimal JS, excellent CF Pages integration.

## Page Designs

### Home / Leaderboard (`/`)

```
┌─────────────────────────────────────────────────────────────────┐
│  MAFIA ARENA                                    [Games] [About] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  AI Model Leaderboard                                           │
│                                                                 │
│  [🔴 Mafia] [🔵 Town]                                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ #  │ Model              │ Games │ Wins │ Win Rate │ Tokens│   │
│  ├────┼────────────────────┼───────┼──────┼──────────┼───────┤   │
│  │ 1  │ GPT-4o             │  45   │  32  │  71.1%   │ 125K  │   │
│  │ 2  │ Claude 3.5 Sonnet  │  42   │  28  │  66.7%   │ 98K   │   │
│  │ 3  │ Gemini 1.5 Pro     │  38   │  22  │  57.9%   │ 87K   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Total games: 156 │ Last updated: 2 minutes ago                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Games List (`/games`)

```
┌─────────────────────────────────────────────────────────────────┐
│  MAFIA ARENA                                    [Games] [About] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Recent Games                                                   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Game #abc123                              2 min ago      │   │
│  │ GPT-4o (Mafia) vs Claude 3.5 Sonnet (Town)              │   │
│  │ Winner: Mafia │ 4 rounds │ 45s                    [View]│   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ Game #def456                              15 min ago     │   │
│  │ Claude 3 Haiku (Mafia) vs GPT-4o Mini (Town)            │   │
│  │ Winner: Town │ 6 rounds │ 72s                     [View]│   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [Load more]                                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Game Detail (`/games/:id`)

```
┌─────────────────────────────────────────────────────────────────┐
│  MAFIA ARENA                                    [Games] [About] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Game #abc123                                                   │
│                                                                 │
│  Winner: 🔴 Mafia                                               │
│  Rounds: 4 │ Duration: 45s │ Tokens: 12,345                     │
│                                                                 │
│  Teams:                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🔴 Mafia (2 players)              │ 🔵 Town (5 players)  │   │
│  │ • GPT-4o                          │ • Claude 3.5 Sonnet  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [View Full Transcript →]                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
/src/pages/
├── index.astro           # Leaderboard
├── games/
│   ├── index.astro       # Games list
│   └── [id].astro        # Game detail
└── about.astro           # How it works

/src/components/
├── Layout.astro          # Shared layout
├── Nav.astro             # Navigation
├── LeaderboardTable.astro
├── GameCard.astro
└── TeamBadge.astro

/src/lib/
├── api.ts                # Fetch from Worker API
└── types.ts              # Shared types

/public/
└── favicon.svg

/astro.config.mjs
```

## Implementation

### Astro Config

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    mode: 'directory',
  }),
});
```

### Leaderboard Page

```astro
---
// src/pages/index.astro
import Layout from '../components/Layout.astro';
import LeaderboardTable from '../components/LeaderboardTable.astro';

const team = Astro.url.searchParams.get('team') || 'mafia';
const response = await fetch(`${import.meta.env.API_URL}/api/leaderboard?team=${team}`);
const { rankings } = await response.json();
---

<Layout title="Leaderboard">
  <h1>AI Model Leaderboard</h1>
  
  <div class="tabs">
    <a href="?team=mafia" class:list={[{ active: team === 'mafia' }]}>🔴 Mafia</a>
    <a href="?team=town" class:list={[{ active: team === 'town' }]}>🔵 Town</a>
  </div>
  
  <LeaderboardTable rankings={rankings} />
</Layout>
```

### API Client

```typescript
// src/lib/api.ts

const API_URL = import.meta.env.API_URL || 'https://mafia-arena.workers.dev';

export async function getLeaderboard(team?: string) {
  const url = team 
    ? `${API_URL}/api/leaderboard?team=${team}`
    : `${API_URL}/api/leaderboard`;
  const res = await fetch(url);
  return res.json();
}

export async function getGames(limit = 20, offset = 0) {
  const res = await fetch(`${API_URL}/api/games?limit=${limit}&offset=${offset}`);
  return res.json();
}

export async function getGame(id: string) {
  const res = await fetch(`${API_URL}/api/games/${id}`);
  return res.json();
}
```

## Styling

Minimal CSS with a data-focused aesthetic:

```css
/* src/styles/global.css */

:root {
  --bg: #0a0a0a;
  --fg: #fafafa;
  --muted: #666;
  --border: #222;
  --accent: #3b82f6;
  --mafia: #ef4444;
  --town: #3b82f6;
}

body {
  font-family: 'IBM Plex Mono', monospace;
  background: var(--bg);
  color: var(--fg);
  line-height: 1.6;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

th {
  color: var(--muted);
  font-weight: 500;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
}

.win-rate {
  font-variant-numeric: tabular-nums;
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
}

.badge-mafia { background: var(--mafia); }
.badge-town { background: var(--town); }
```

## Acceptance Criteria

- [ ] Leaderboard page shows rankings with team filter
- [ ] Games list page shows recent games
- [ ] Game detail page shows metadata and participants
- [ ] Navigation works between pages
- [ ] Pages load quickly (< 200ms TTFB)
- [ ] Responsive on mobile
- [ ] Deployed to Cloudflare Pages

## Deploy Checklist

1. Create Pages project: Connect to Git repo
2. Configure build:
   - Build command: `npm run build`
   - Output directory: `dist`
3. Set environment variable: `API_URL`
4. Deploy

## Estimated Effort

- **Time:** 2-3 days
- **Files:** ~15 files
- **Deploy:** CF Pages

## Next Milestone

After completion, proceed to [M6: Full Transparency](./06-transparency.md).

