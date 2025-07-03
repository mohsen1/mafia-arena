# User API Keys Guide

Werewolf AI allows users to bring their own API keys for AI providers, giving you full control over your AI usage and costs.

## Overview

The user API key feature allows you to:
- Use your own API keys instead of system-provided ones
- Manage multiple keys for different providers
- Test keys before using them
- Switch between personal and system keys
- Keep your API usage separate and trackable

## Supported Providers

You can add your own API keys for:
- **OpenAI** - GPT models
- **Anthropic** - Claude models
- **Google Gemini** - Gemini models
- **Groq** - Fast inference for open models
- **Fireworks AI** - Optimized model serving

## Adding API Keys

### Step 1: Navigate to Your Profile

1. Sign in to Werewolf AI
2. Click your avatar in the top right
3. Select **Profile** from the dropdown

### Step 2: Add a New API Key

1. In the **Your API Keys** section, click **Add API Key**
2. Fill in the form:
   - **Provider**: Select the AI provider
   - **Key Name**: Give your key a friendly name (e.g., "Personal OpenAI")
   - **API Key**: Paste your actual API key
3. Click **Test Connection** to verify the key works
4. Click **Save** to store the key securely

### Step 3: Using Your Keys in Games

When creating a new game:
1. Go to **Start New Game**
2. In the AI Provider dropdown, you'll see:
   - **(System)** - Using the app's default key
   - **(Your Key Name)** - Using your personal key
   - **(System + Your Key Name)** - Both available

## Key Management

### Viewing Your Keys

Your API keys are displayed in the Profile page with:
- Provider name and badge
- Key name you provided
- Active/inactive status
- Date added

### Editing Keys

1. Click the **Edit** button next to any key
2. You can:
   - Change the key name
   - Update the API key
   - Test the new key
3. Click **Save** to update

### Deleting Keys

1. Click the **Delete** button next to any key
2. Confirm the deletion
3. The key is immediately removed

## Security

### How Keys Are Stored

- API keys are **encrypted** before storage
- Keys are never displayed after saving
- Only you can access your keys
- Keys are tied to your user account

### Best Practices

1. **Use descriptive names** - Help identify keys later
2. **Test before saving** - Ensure keys work properly
3. **Rotate regularly** - Update keys periodically
4. **Delete unused keys** - Remove keys you no longer need

## Testing API Keys

The **Test Connection** feature:
1. Validates the key format
2. Makes a test API call
3. Shows success/failure message
4. Helps diagnose issues

### Common Test Failures

- **Invalid format** - Key doesn't match expected pattern
- **Unauthorized** - Key is invalid or revoked
- **Quota exceeded** - API limits reached
- **Network error** - Connection issues

## Provider-Specific Instructions

### OpenAI
1. Get your key from [platform.openai.com](https://platform.openai.com/api-keys)
2. Keys start with `sk-`
3. Ensure billing is set up

### Anthropic (Claude)
1. Get your key from [console.anthropic.com](https://console.anthropic.com/)
2. Keys start with `sk-ant-`
3. Check your usage tier for model access

### Google Gemini
1. Get your key from [makersuite.google.com](https://makersuite.google.com/app/apikey)
2. Keys start with `AIza`
3. Enable the Generative AI API

### Groq
1. Get your key from [console.groq.com](https://console.groq.com/keys)
2. Keys start with `gsk_`
3. Free tier available

### Fireworks AI
1. Get your key from [app.fireworks.ai](https://app.fireworks.ai/account/api-keys)
2. Create an account and generate key
3. Check model availability

## Benefits of Using Your Own Keys

### Cost Control
- Pay directly for your usage
- No markup or hidden fees
- Use your existing credits

### Usage Tracking
- Monitor your API calls
- Track costs per provider
- Separate personal/work usage

### Access Control
- Use keys with specific permissions
- Rotate keys independently
- Maintain security compliance

### Model Access
- Access models available to your account
- Use higher tier models if available
- Test new models as they release

## Troubleshooting

### Key Not Working in Game

1. **Test the key** in your profile
2. **Check provider status** - Service might be down
3. **Verify key permissions** - Some keys have limited scope
4. **Check quotas** - You might have hit limits

### Provider Not Available

If a provider doesn't appear in the dropdown:
- Ensure you have an active key for that provider
- Check if the provider is supported
- Try refreshing the page

### Multiple Keys for Same Provider

- The system uses the first active key found
- You can have multiple keys but only one is used
- Deactivate keys you don't want to use

## FAQ

**Q: Are my API keys secure?**
A: Yes, keys are encrypted and never exposed after saving.

**Q: Can I use different keys for different games?**
A: Currently, the system uses your active key for each provider.

**Q: What happens if my key runs out of credits?**
A: The game will show an error. Add credits or switch providers.

**Q: Can I share my keys with other users?**
A: No, keys are private to your account only.

**Q: Do I need to add keys for all providers?**
A: No, add keys only for providers you want to use.

## Support

For API key issues:
1. Check the provider's documentation
2. Verify your key in the provider's dashboard
3. Test the key in your Werewolf AI profile
4. Contact support if issues persist 