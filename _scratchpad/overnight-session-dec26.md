# Overnight DevOps Session - December 26, 2025

## Session Start: ~10:30 AM

### System Status Check

**Live Games (from screenshot):**
1. Qwen: Qwen-Turbo vs xAI: Grok 4.1 Fast
2. NVIDIA: Nemotron Nano 12B 2 VL (free) vs Tongyi DeepResearch 30B A3B (free)
3. Google: Gemini 3 Flash Preview vs OpenAI: GPT-5
4. Z.AI: GLM 4.7 vs Google: Gemini 3 Flash Preview

**Stats:** 92 completed, 4 live

---

## Investigation Log

### [10:30] Initial Health Check
- 2 games healthy, 2 critical
- Critical games: GLM vs Gemini (R2 not found), Nemotron vs Tongyi (AI failing)

### [10:35] Bug #1: Claim Check Race Condition
**Error:** `Offloaded request not found in R2`
**Root Cause:** Duplicate queue messages from punt/resume, first worker deletes R2 object
**Fix Applied:**
1. Don't delete R2 objects after processing (use TTL instead)
2. Handle missing R2 objects gracefully (ack instead of retry)
**Commit:** `c32c640 - fix(worker): make Claim Check pattern idempotent`

### [10:50] Bug #2: OpenRouter API Key Limit Exceeded
**Error:** `Key limit exceeded (total limit)` - HTTP 403
**Root Cause:** OpenRouter credits exhausted
**Status:** BLOCKING - Need new API key or top up credits

### Games Killed
- game_mjl943z5_aotkmt_live (GLM vs Gemini)
- game_mjl96woq_fsuk33_live (Gemini 3 vs GPT-5)
- game_mjl988ev_e5smlb_live (Nemotron vs Tongyi)
- game_mjl997fq_bxz7hj_live (Qwen vs Grok)

---

## ACTION REQUIRED
**Need to top up OpenRouter credits or get new API key!**
Visit: https://openrouter.ai/settings/keys


