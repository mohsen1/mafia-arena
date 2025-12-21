# Game Running Session - December 21, 2025

## Session Start: 2025-12-21 ~13:20 UTC

## Available Free/Low-Cost Models

### Google Models (Native API - Free tier):
1. `google/gemini-2.5-flash-lite-preview-09-2025`
2. `google/gemini-2.5-flash-preview-09-2025`
3. `google/gemini-2.5-pro`
4. `google/gemini-2.5-pro-preview-05-06`
5. `google/gemini-3-flash-preview`
6. `google/gemini-3-pro-preview`

### OpenRouter Free Models:
1. `mistralai/devstral-2512:free`
2. `xiaomi/mimo-v2-flash:free`

## API Endpoint
- Production: `https://mafia-arena.me-f9a.workers.dev`
- Run games: `POST /api/games/run` (queued) or `POST /api/games/run-direct` (direct)

## Progress Log

### Games to Run (for Heatmap)
Need pairwise matchups between models. With 8 models, we need:
- 8 × 8 = 64 matchup combinations
- Each model can be Mafia or Town
- Need multiple games per matchup for statistical significance

### Current Status (as of 13:25 UTC)
- **Total Games:** 42 completed
- **Total Tokens:** 20,826,957
- **Mafia Wins:** 23 | **Town Wins:** 19

### Current Models in Database
| Model | Provider | Games | Wins |
|-------|----------|-------|------|
| Gemini 3 Flash | google | 14 | 12 |
| MiMo V2 Flash (Free) | openrouter | 21 | 13 |
| Gemini 2.0 Flash | google | 4/7 | 2/3 |
| Devstral (Free) | openrouter | 21 | 8 |

### Models Available for Free Games
| Model ID | Provider | Notes |
|----------|----------|-------|
| `google/gemini-3-flash-preview` | google | ✅ Has games |
| `google/gemini-3-pro-preview` | google | ⚠️ Need games |
| `google/gemini-2.5-flash-preview-09-2025` | google | ⚠️ Need games |
| `google/gemini-2.5-flash-lite-preview-09-2025` | google | ⚠️ Need games |
| `google/gemini-2.5-pro` | google | ⚠️ Need games |
| `google/gemini-2.5-pro-preview-05-06` | google | ⚠️ Need games |
| `mistralai/devstral-2512:free` | openrouter | ✅ Has games |
| `xiaomi/mimo-v2-flash:free` | openrouter | ✅ Has games |

### Progress Log
| Time (UTC) | Action | Status | Notes |
|------------|--------|--------|-------|
| 13:25 | Initial check | ✅ Done | 42 games, need more variety |
| 13:28 | Budget increase | ✅ Done | $10 → $100 limit |
| 13:29 | Batch 1-6 queued | ✅ Done | 30 Google vs Google games |
| 13:30 | Batch 7-12 queued | ✅ Done | 30 mixed free model games |

### Issues Found and Fixed
1. **5-player config invalid** - Min 7 players required
2. **GEMINI_API_KEY missing** - Code used `GEMINI_API_KEY` but secret was `GOOGLE_API_KEY`
   - Fixed code to use `GOOGLE_API_KEY`
   - Redeployed at 14:40 UTC

### Configuration Requirements (from validateConfig):
- Minimum 7 players
- Minimum 2 mafia  
- Town must outnumber mafia by at least 3

**Valid config: 7 players, 2 mafia, 5 town**

### Batches After Fix

## Strategy
1. Run games between Google models (free tier)
2. Run games mixing Google + OpenRouter free models
3. Focus on filling heatmap gaps

## Commands Used
All commands use `--max-time` with curl to prevent hanging.

## Notes
- Using `--max-time 60` for API calls
- Games take ~30-60s to complete via queue, longer for direct
- Max 100 games per batch
- Queue is preferred for bulk games


