# How to Enable OpenAI Models in Werewolf AI

OpenAI models are already integrated into Werewolf AI, but they need to be configured with an API key before they can be used. This guide explains how to enable OpenAI models.

## Prerequisites

- An OpenAI account with API access
- An OpenAI API key (get one from [platform.openai.com](https://platform.openai.com/api-keys))

## Available OpenAI Models

The following OpenAI models are available in Werewolf AI:

### GPT-4.1 Series (Latest)
- **GPT-4.1** - Advanced, API Optimized
- **GPT-4.1 Mini** - Default, Fast, API Optimized (Recommended)
- **GPT-4.1 Nano** - Fastest, Cost-Effective

### GPT-4o Series (Multimodal)
- **GPT-4o** - Flagship Multimodal
- **GPT-4o Mini** - Cost-Effective Multimodal (Good balance)

### Reasoning Models
- **o1-pro** - Max Reasoning (Requires Responses API)
- **o1** - Advanced Reasoning
- **o1-mini** - Fast Reasoning
- **o3** - Deep Reasoning
- **o3-mini** - Balanced Reasoning
- **o4-mini** - Fast & Efficient Reasoning

### Legacy Models
- **GPT-4 Turbo** - High Intelligence
- **GPT-3.5 Turbo** - Cost-Effective
- **GPT-3.5 Turbo Instruct** - Completions

## Method 1: Environment Variable (System-wide)

This method makes OpenAI models available to all users of your Werewolf AI instance.

### For Local Development

1. Open `.env.local` in your project root
2. Replace the placeholder with your actual API key:
   ```
   OPENAI_API_KEY="sk-your-actual-api-key-here"
   ```
3. Restart your development server:
   ```bash
   pnpm dev
   ```

### For Production (Vercel)

1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add:
   - **Key**: `OPENAI_API_KEY`
   - **Value**: Your OpenAI API key
   - **Environment**: Production, Preview, Development
4. Redeploy your application

### For Self-Hosted

Add to your environment:
```bash
export OPENAI_API_KEY="sk-your-actual-api-key-here"
```

## Method 2: User Profile (Per-User)

This method allows individual users to provide their own OpenAI API keys.

1. **Sign in** to Werewolf AI
2. Navigate to your **Profile** (click your avatar → Profile)
3. In the **API Keys** section:
   - Click **"Add API Key"**
   - Select **"OpenAI"** as the provider
   - Enter a name for your key (e.g., "My OpenAI Key")
   - Paste your OpenAI API key
   - Click **"Save"**
4. Click **"Test Connection"** to verify your key works

## Verifying OpenAI is Enabled

### Check Available Providers

1. Go to the home page or start a new game
2. Look at the AI Provider dropdown
3. You should see **"Official OpenAI API"** in the list

If you see it with:
- **(System)** - Using environment variable
- **(My OpenAI Key)** - Using your user-provided key
- **(System + My OpenAI Key)** - Both available

### Test OpenAI Models

1. Start a new game
2. Select **"Official OpenAI API"** as the provider
3. Choose a model (e.g., **"GPT-4.1 Mini"**)
4. Create the game

## Troubleshooting

### OpenAI Provider Not Showing

**Issue**: "Official OpenAI API" doesn't appear in the provider list

**Solutions**:
1. Verify your API key is correctly set (no quotes in .env.local)
2. Check the dev server logs for errors
3. Try adding the key via your user profile instead

### API Key Invalid

**Issue**: "Test Connection" fails or game creation errors

**Solutions**:
1. Verify your API key starts with `sk-`
2. Check your OpenAI account has credits
3. Ensure the key has proper permissions
4. Try regenerating the key on OpenAI's platform

### Model Not Available

**Issue**: Specific model fails with access error

**Solutions**:
1. Some models require specific API tiers
2. Reasoning models (o1, o3) may need special access
3. Try using GPT-4.1 Mini or GPT-4o Mini first

## Cost Considerations

- **Most Expensive**: GPT-4.1, o1-pro, o3
- **Balanced**: GPT-4.1 Mini, GPT-4o Mini, o1-mini
- **Most Affordable**: GPT-3.5 Turbo

For typical Werewolf games, GPT-4.1 Mini or GPT-4o Mini provide the best balance of quality and cost.

## Security Notes

- Never commit API keys to version control
- Use environment variables for shared instances
- User-provided keys are encrypted in the database
- Consider setting usage limits in your OpenAI account

## Next Steps

Once OpenAI is enabled:
1. Experiment with different models to find your preference
2. Use GPT-4.1 Mini for fast, quality responses
3. Try reasoning models (o1, o3) for complex strategic gameplay
4. Mix providers - use OpenAI for some players, other providers for variety 