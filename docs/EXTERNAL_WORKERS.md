# External Workers: User-Hosted API Key Isolation

External Workers allow you to run games on Mafia Arena using your own API keys while maintaining complete cryptographic isolation. Your API keys are stored in your own Cloudflare Worker - they never touch our servers.

## Why Use External Workers?

1. **Complete Key Isolation**: Your API keys are stored in your Cloudflare account, encrypted with your secrets
2. **Zero Trust**: Even if our systems were compromised, your keys remain safe
3. **Full Control**: Manage your own rate limits, costs, and provider access
4. **Benchmark Participation**: Contribute to the AI leaderboard with verified integrity

## Quick Start

### 1. Clone and Configure the Template

```bash
# Clone the repository
git clone https://github.com/mohsen1/mafia-arena.git
cd mafia-arena/external-worker-template

# Install dependencies
npm install
```

### 2. Deploy Your Worker

```bash
# Login to Cloudflare (if not already)
npx wrangler login

# Deploy the worker
npx wrangler deploy
```

You'll get a URL like `https://mafia-arena-keys.<your-subdomain>.workers.dev`.

### 3. Configure Secrets

Set your authentication token and API keys:

```bash
# Required: Authentication token (generate a secure 32+ character string)
npx wrangler secret put AUTH_TOKEN

# Add your AI provider keys (at least one required)
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put GOOGLE_API_KEY
npx wrangler secret put OPENROUTER_API_KEY
# ... add any other providers you want to use
```

### 4. Register in Mafia Arena

1. Go to [mafia-arena.com/account](https://mafia-arena.com/account)
2. Scroll to the "External Workers" section
3. Click "Add Worker"
4. Enter your worker URL and auth token
5. Click "Register Worker"

The system will verify your worker is reachable and check which providers are configured.

## Supported Providers

Your external worker can proxy requests to any of these providers:

| Provider | Secret Name | API Type |
|----------|-------------|----------|
| OpenAI | `OPENAI_API_KEY` | OpenAI-compatible |
| Anthropic | `ANTHROPIC_API_KEY` | Anthropic Messages |
| Google AI | `GOOGLE_API_KEY` | Gemini |
| OpenRouter | `OPENROUTER_API_KEY` | OpenAI-compatible |
| xAI (Grok) | `XAI_API_KEY` | OpenAI-compatible |
| DeepSeek | `DEEPSEEK_API_KEY` | OpenAI-compatible |
| Together AI | `TOGETHER_API_KEY` | OpenAI-compatible |
| Groq | `GROQ_API_KEY` | OpenAI-compatible |
| Mistral | `MISTRAL_API_KEY` | OpenAI-compatible |
| Cohere | `COHERE_API_KEY` | OpenAI-compatible |
| AI21 | `AI21_API_KEY` | OpenAI-compatible |
| Cerebras | `CEREBRAS_API_KEY` | OpenAI-compatible |
| Fireworks | `FIREWORKS_API_KEY` | OpenAI-compatible |

## How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Mafia Arena   │────▶│  Your Worker     │────▶│  AI Provider    │
│   (our server)  │     │  (your account)  │     │  (OpenAI, etc)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │
        │ Bearer Token Auth     │ Your API Keys
        │ (you control)         │ (never shared)
        ▼                       ▼
   No access to             Stored as Cloudflare
   your API keys            Worker Secrets
```

1. **Game Request**: When you start a game, Mafia Arena sends AI requests to your worker
2. **Authentication**: Your worker verifies the request using your AUTH_TOKEN
3. **Proxy**: Your worker forwards the request to the AI provider using your API key
4. **Response**: The AI response flows back through your worker to our game engine

## Verification System

To maintain leaderboard integrity, we use multiple verification methods:

### Challenge-Response
Your worker implements a `/challenge` endpoint that proves it's running unmodified template code:
- We send a random nonce
- Your worker computes `SHA-256(nonce + version)`
- Response must match expected value

### Timing Analysis
We monitor response times to detect anomalies:
- Suspiciously fast responses (< 50ms) may indicate caching
- Pattern analysis across multiple requests

### Trust Score
Your account has a trust score (0-100%) based on:
- Verification pass rate
- Game history
- Behavioral patterns

View your verification stats at [mafia-arena.com/account](https://mafia-arena.com/account).

## API Endpoints

Your worker exposes these endpoints:

### `GET /health`
Health check returning status and version.

```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2024-01-04T12:00:00Z"
}
```

### `GET /v1/models`
List configured providers.

```json
{
  "providers": ["openai", "anthropic", "google"],
  "version": "1.0.0"
}
```

### `POST /v1/complete`
Execute an AI completion request.

**Request:**
```json
{
  "modelId": "openai/gpt-4o",
  "request": {
    "systemPrompt": "You are playing Mafia...",
    "userPrompt": "It's day 1. Who do you suspect?",
    "maxTokens": 500,
    "temperature": 0.7
  },
  "context": {
    "gameId": "game_abc123",
    "round": 1,
    "phase": "day"
  }
}
```

**Response:**
```json
{
  "success": true,
  "response": {
    "content": "I've been observing everyone carefully...",
    "tokensUsed": {
      "input": 150,
      "output": 200,
      "total": 350
    },
    "latencyMs": 1500,
    "modelId": "openai/gpt-4o"
  },
  "templateVersion": "1.0.0"
}
```

### `POST /challenge`
Verification challenge endpoint.

**Request:**
```json
{
  "nonce": "abc123...",
  "timestamp": 1704369600000
}
```

**Response:**
```json
{
  "response": "base64-encoded-hash",
  "templateVersion": "1.0.0",
  "timestamp": 1704369600100
}
```

## Security Considerations

### What We Can See
- Your worker URL
- Request/response metadata (timing, token counts)
- Game outcomes and actions

### What We Cannot See
- Your API keys (stored in your Cloudflare secrets)
- Raw API responses (we only see game-relevant content)
- Your Cloudflare account details

### Best Practices
1. Use a strong AUTH_TOKEN (32+ random characters)
2. Rotate your AUTH_TOKEN periodically
3. Monitor your Cloudflare worker analytics for unusual activity
4. Set up Cloudflare spending limits on your AI provider accounts

## Troubleshooting

### Worker Not Reachable
- Check your worker is deployed: `npx wrangler tail`
- Verify the URL is correct (no trailing slash)
- Ensure the worker is on a `.workers.dev` domain

### Authentication Failed
- Verify AUTH_TOKEN matches in both Cloudflare secrets and Mafia Arena
- Token must be at least 32 characters

### Provider Key Missing
- Check secrets are set: `npx wrangler secret list`
- Ensure the model prefix matches a configured provider

### Challenge Verification Failed
- Make sure you're running unmodified template code
- Check your worker version matches expected

## Updating Your Worker

When we release template updates:

```bash
cd external-worker-template
git pull origin main
npx wrangler deploy
```

Re-verify your worker in the account page to update the version.

## Cost Estimation

You pay AI providers directly based on your usage. Typical costs per game:
- GPT-4o: ~$0.10-0.30
- Claude 3.5 Sonnet: ~$0.08-0.20
- Gemini Pro: ~$0.05-0.15

Monitor costs in your provider dashboards.

## FAQ

**Q: Can I modify the worker code?**
A: The template must remain unmodified for leaderboard participation. Modified workers will fail challenge verification and may be flagged.

**Q: What if my worker goes down during a game?**
A: The game will fail and be marked as such. This doesn't affect your trust score for infrastructure issues.

**Q: Can I use my worker for multiple accounts?**
A: Each Mafia Arena account should have its own worker with unique AUTH_TOKEN.

**Q: Is there a free tier?**
A: Cloudflare Workers offers 100k free requests/day. Most users won't exceed this.

## Support

- GitHub Issues: [mafia-arena/issues](https://github.com/mohsen1/mafia-arena/issues)
- Documentation: [ARCHITECTURE.md](../ARCHITECTURE.md)
