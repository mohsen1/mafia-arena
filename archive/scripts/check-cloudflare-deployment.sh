#!/usr/bin/env bash

# Check Cloudflare Pages deployment status
# Usage: ./scripts/check-cloudflare-deployment.sh

set -euo pipefail

CLOUDFLARE_ACCOUNT_ID="f9a5434fcf66ee00d67b61f2f67e0e22"
PROJECT_NAME="werewolf-ai"

if [ -z "${CLOUDFLARE_TOKEN:-}" ]; then
    echo "❌ CLOUDFLARE_TOKEN environment variable not set"
    echo "Please export your Cloudflare API token:"
    echo "  export CLOUDFLARE_TOKEN=your-token-here"
    exit 1
fi

echo "🔍 Checking Cloudflare Pages project: $PROJECT_NAME"
echo ""

# Get project info
echo "📋 Project Information:"
curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT_NAME" \
  -H "Authorization: Bearer $CLOUDFLARE_TOKEN" \
  -H "Content-Type: application/json" | jq -r '.result | {
    name,
    subdomain,
    production_branch,
    created_on,
    deployment_configs: {
      production: .deployment_configs.production.env_vars
    }
  }'

echo ""
echo "📦 Recent Deployments:"
curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT_NAME/deployments" \
  -H "Authorization: Bearer $CLOUDFLARE_TOKEN" \
  -H "Content-Type: application/json" | jq -r '.result[:5] | .[] | {
    id,
    url,
    environment,
    created_on,
    latest_stage: .latest_stage.name,
    status: .latest_stage.status
  }'

echo ""
echo "✅ Check complete"
