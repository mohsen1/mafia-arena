#!/usr/bin/env bash

# Script to update Cloudflare API token in GitHub secrets
# This token needs Cloudflare Pages Edit permissions

set -e

echo "📝 To create a Cloudflare API token with the correct permissions:"
echo ""
echo "1. Go to: https://dash.cloudflare.com/profile/api-tokens"
echo "2. Click 'Create Token'"
echo "3. Use the 'Edit Cloudflare Workers' template (or create custom with these permissions):"
echo "   - Account / Cloudflare Pages / Edit"
echo "   - Account / Account Settings / Read"
echo "4. Copy the generated token"
echo ""

read -p "Enter your Cloudflare API token: " CLOUDFLARE_API_TOKEN

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "❌ No token provided"
  exit 1
fi

echo "🔑 Updating GitHub secret CLOUDFLARE_API_TOKEN..."
echo "$CLOUDFLARE_API_TOKEN" | gh secret set CLOUDFLARE_API_TOKEN

echo "✅ Token updated successfully!"
echo "🚀 Triggering deployment workflow..."
gh workflow run deploy.yml
echo "✅ Deployment triggered!"
