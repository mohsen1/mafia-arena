#!/bin/bash

# Melody Authentication Configuration Validation Script
# Phase 4.1: Testing environment variable validation logic

echo "🔍 Melody Auth Configuration Validation"
echo "======================================"

# Source environment variables
source .env

# Test feature flags
echo ""
echo "📊 Feature Flags:"
echo "  Melody Enabled: $FEATURE_MELODY_AUTH"
echo "  NextAuth Fallback: $AUTH_NEXTAUTH_FALLBACK"
echo "  Test Mode: $AUTH_TEST_MODE"

# Test environment variables
echo ""
echo "🔧 Configuration Status:"
echo "  Auth Server URL: $AUTH_SERVER_URL"
echo "  JWT Secret Length: ${#AUTH_JWT_SECRET} chars"
echo "  Cookie Secret Length: ${#AUTH_COOKIE_SECRET} chars"
echo "  Public Auth Server URL: $NEXT_PUBLIC_AUTH_SERVER_URL"

# Test OAuth providers
echo ""
echo "🌐 OAuth Providers:"
echo "  Google Client ID: $([ -n "$AUTH_GOOGLE_CLIENT_ID" ] && echo "✅ Configured" || echo "❌ Missing")"
echo "  GitHub Client ID: $([ -n "$AUTH_GITHUB_CLIENT_ID" ] && echo "✅ Configured" || echo "❌ Missing")"

# Test secrets validation
echo ""
echo "🔑 Secret Validation:"
JWT_VALID=$([[ ${#AUTH_JWT_SECRET} -ge 32 ]] && echo "✅" || echo "❌")
COOKIE_VALID=$([[ ${#AUTH_COOKIE_SECRET} -ge 32 ]] && echo "✅" || echo "❌")
echo "  JWT Secret (32+ chars): $JWT_VALID"
echo "  Cookie Secret (32+ chars): $COOKIE_VALID"

# Test required variables
echo ""
echo "📋 Required Variables Check:"
REQUIRED_VARS=("DATABASE_URL" "AUTH_JWT_SECRET" "AUTH_COOKIE_SECRET" "AUTH_SERVER_URL")
ALL_VALID=true

for var in "${REQUIRED_VARS[@]}"; do
    if [[ -n "${!var}" ]]; then
        echo "  ✅ $var: Configured"
    else
        echo "  ❌ $var: Missing"
        ALL_VALID=false
    fi
done

# Test logging and metrics
echo ""
echo "📈 Monitoring & Logging:"
echo "  Auth Log Level: $AUTH_LOG_LEVEL"
echo "  Auth Log Activity: $AUTH_LOG_ACTIVITY"
echo "  Auth Metrics Enabled: $AUTH_METRICS_ENABLED"

# Test Cloudflare configuration
echo ""
echo "☁️  Cloudflare Configuration:"
echo "  Project Name: $CLOUDFLARE_PROJECT_NAME"
echo "  Environment: $CLOUDFLARE_ENVIRONMENT"
echo "  Token: $([ -n "$CLOUDFLARE_TOKEN" ] && echo "✅ Configured" || echo "❌ Missing")"

# Summary
echo ""
echo "======================================"
if $ALL_VALID && [[ "$JWT_VALID" == "✅" ]] && [[ "$COOKIE_VALID" == "✅" ]]; then
    echo "🎉 Configuration Status: ✅ VALID"
    echo ""
    echo "✅ Ready for Melody testing!"
    echo ""
    echo "🚀 Next Steps:"
    echo "  1. Start Melody auth server"
    echo "  2. Run authentication flow tests"
    echo "  3. Test protected routes"
    echo "  4. Deploy to Cloudflare"
    exit 0
else
    echo "🚫 Configuration Status: ❌ INVALID"
    echo ""
    echo "Please fix the above issues before proceeding with Melody testing."
    exit 1
fi