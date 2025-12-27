# Roadmap

## 1. Providers & Models Expansion

**Goal:**  
Broaden support for major AI model providers and continually update supported model lists.

### a. Direct API Provider Integrations ✅ (Implemented Dec 2024)
- **XAI (Grok)** ✅
  - Provider: `XAIProvider` via `https://api.x.ai/v1`
  - Supports Grok 2, Grok 2 Mini, Grok 2 Vision via official APIs
- **DeepSeek** ✅
  - Provider: `DeepSeekProvider` via `https://api.deepseek.com/v1`
  - Supports DeepSeek V3, DeepSeek R1 direct API
- **Mistral** ✅
  - Provider: `MistralProvider` via `https://api.mistral.ai/v1`
  - Supports Mistral Large and Mistral 8B/14B direct API
- **Cohere** ✅
  - Provider: `CohereProvider` via `https://api.cohere.ai/v2`
  - Supports Command-R+, Command-R, Command models
- **AI21 Labs** ✅
  - Provider: `AI21Provider` via `https://api.ai21.com/studio/v1`
  - Supports Jamba 2 Mini, Jamba 2 Large
- **Together AI** ✅
  - Provider: `TogetherProvider` via `https://api.together.xyz/v1`
  - Supports open-source models: Llama, Mixtral, etc.
- **Amazon Bedrock** ⏸️
  - Deferred: Requires AWS SDK which is complex for Cloudflare Workers
  - Use OpenRouter for Nova Pro, Nova Lite, Titan models instead

### b. Google Models
- Add Gemini 2.5 Flash Lite (already in DB, add to static config)
- Add Gemini 2.0 Flash Lite
- Add Gemma 2 27B (open weights)

### c. OpenRouter Coverage Gaps
- Yi models (01.AI)
- Reka models (Reka Flash, Core)
- Zhipu GLM-4 family
- Alibaba Qwen 2.5 Turbo
- Expand coverage for Moonshot Kimi

### d. Free & Low-Cost Model Options ✅ (Implemented Dec 2024)
- **SambaNova** ✅ - `SambaNovaProvider` via `https://api.sambanova.ai/v1` (free Llama 3.1 405B)
- **Groq** ✅ - `GroqProvider` via `https://api.groq.com/openai/v1` (fast inference, free tier)
- **Hyperbolic** ✅ - `HyperbolicProvider` via `https://api.hyperbolic.xyz/v1` (free tier)

---

## 2. Google Auth Integration & Per-User API Keys

**Goal:**  
Enhance security and flexibility by tying all access to Google-authenticated users and individual API keys. Remove legacy authentication in favor of an `ADMIN_EMAIL` environment variable.

### a. OAuth & User Session Management
- Integrate Google OAuth for web and API endpoints
- Require Google sign-in for all management actions
- Store user info in sessions/cookies

### b. API Key Management UI & Backend
- Allow each user to add, edit, or revoke their own provider API keys
- Securely store API keys (never exposed to others)

### c. Game Execution Permissions
- When running a game, require user selection of API keys for enabled providers
- Only `ADMIN_EMAIL` is allowed to run games using free-tier/shared models (prevents API abuse)
- Non-admins are blocked from free/shared models in both UI and backend

### d. Remove Admin Pass System
- Migrate from admin-password to email-based admin checks
- Remove legacy authentication code
- Ensure clear error and permission messages throughout

### e. Considerations
- Devise a migration plan for existing users/data to the new auth flow, if needed
- Add audit logging of sensitive actions (API key usage, permission errors)
- Clear UX for onboarding new users and warning when lacking API keys
- Tests for all new auth logic and permission boundaries

---

## 3. Standardize Game Configuration

**Goal:**  
Ensure consistent, balanced gameplay by enforcing a standard game format.

### Tasks
- Set default game format to 9 Town vs. 2 Mafia (no manual team sizing/configuration)
- Remove UI/backend options for custom team splits—only allow the official format
- Update documentation and onboarding to clarify the "official" game setup
- Ensure engine and API enforce standard config and validate attempts to bypass

### Rationale
9v2 offers the most fair and balanced play based on analysis; keeps leaderboard meaningful and ensures comparability.

---

## 4. Blog & Updates Page

**Goal:**  
Launch a "Blog & Updates" page to share progress, technical breakdowns, and major news.

### Features
- Development diaries and feature release notes
- Behind-the-scenes insights and technical deep-dives
- Changelog and milestone highlights
- Integrated into main site navigation for improved user engagement

---

## 5. FAQ Page

**Goal:**  
Develop and launch a comprehensive FAQ page to address common questions.

### Topics to Address
- **Core Mafia Roles Only:** Rationale for focusing solely on core Mafia roles (excluding doctor, seer, etc.), including design goals and game balance considerations
- **Fixed Team Size:** Explanation for 9 Town vs. 2 Mafia standardization, with supporting reasoning and data
- **Mafia Difficulty:** Address community feedback about perceived mafia difficulty; explain intended challenge and fairness calibration
- **Project Origin:** How the game was conceptualized, technology stack choices, and high-level overview of the build process

### Considerations
- Ensure responses are concise, informative, and approachable for both new and experienced users
- Link to relevant documentation or blog posts for deeper dives
- Allow for future expansion as new common questions emerge
