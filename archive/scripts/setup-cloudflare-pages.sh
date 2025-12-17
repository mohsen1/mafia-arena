#!/bin/bash
# Setup script for Cloudflare Pages deployment via GitHub Actions

echo "🚀 Setting up Cloudflare Pages deployment..."
echo ""

# Step 1: Create Cloudflare API Token
echo "📝 Step 1: Create a Cloudflare API Token"
echo "----------------------------------------"
echo "1. Open: https://dash.cloudflare.com/profile/api-tokens"
echo "2. Click 'Create Token'"
echo "3. Click 'Use template' on 'Edit Cloudflare Workers'"
echo "4. Or create custom token with these permissions:"
echo "   - Account > Cloudflare Pages > Edit"
echo "   - Account > Account Settings > Read"
echo "5. Set Account Resources to: Include > Specific account > Me@azimi.me's Account"
echo "6. Click 'Continue to summary' then 'Create Token'"
echo "7. COPY the token (you won't see it again!)"
echo ""
read -p "Press Enter after you've copied the token..."

# Step 2: Add token to GitHub
echo ""
echo "🔐 Step 2: Add token to GitHub Secrets"
echo "--------------------------------------"
echo "Now paste your Cloudflare API token when prompted:"
echo ""
read -s -p "Cloudflare API Token: " CF_TOKEN
echo ""

# Add the secret using gh CLI
if gh secret set CLOUDFLARE_API_TOKEN --body "$CF_TOKEN" --repo mohsen1/werewolf-ai; then
    echo "✅ Successfully added CLOUDFLARE_API_TOKEN to GitHub secrets!"
else
    echo "❌ Failed to add secret. You can add it manually:"
    echo "   1. Go to: https://github.com/mohsen1/werewolf-ai/settings/secrets/actions"
    echo "   2. Click 'New repository secret'"
    echo "   3. Name: CLOUDFLARE_API_TOKEN"
    echo "   4. Value: <paste your token>"
    echo "   5. Click 'Add secret'"
    exit 1
fi

# Step 3: Trigger deployment
echo ""
echo "🚢 Step 3: Trigger deployment"
echo "-----------------------------"
read -p "Would you like to trigger a deployment now? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Triggering GitHub Actions workflow..."
    if gh workflow run deploy.yml --ref copilot/fix-133; then
        echo "✅ Deployment triggered! View progress at:"
        echo "   https://github.com/mohsen1/werewolf-ai/actions"
    else
        echo "❌ Failed to trigger workflow. You can trigger it manually:"
        echo "   1. Go to: https://github.com/mohsen1/werewolf-ai/actions/workflows/deploy.yml"
        echo "   2. Click 'Run workflow'"
        echo "   3. Select branch: copilot/fix-133"
        echo "   4. Click 'Run workflow'"
    fi
fi

echo ""
echo "✨ Setup complete!"
echo ""
echo "📚 Next steps:"
echo "1. Wait for deployment to complete"
echo "2. Visit: https://werewolf-ai.pages.dev"
echo "3. Bind D1 database in Cloudflare dashboard:"
echo "   https://dash.cloudflare.com/f9a5434fcf66ee00d67b61f2f67e0e22/pages/view/werewolf-ai/settings/functions"
echo "4. Add environment variables in the same settings page"
echo "5. Run database migration:"
echo "   wrangler d1 execute werewolf-ai-db --file=drizzle/0000_safe_ultragirl.sql"
