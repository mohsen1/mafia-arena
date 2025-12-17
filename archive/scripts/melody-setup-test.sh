#!/bin/bash

# Melody Server Setup Test Script
# Phase 4.2: Comprehensive Melody Server Configuration Test

echo "🎵 Melody Server Setup Validation"
echo "=================================="

# Source environment variables
source .env

# Test 1: Environment Configuration
echo ""
echo "📋 Test 1: Environment Configuration"
echo "-----------------------------------"

ENV_OK=true

if [[ "$FEATURE_MELODY_AUTH" == "true" ]]; then
    echo "  ✅ Melody Authentication: ENABLED"
else
    echo "  ❌ Melody Authentication: DISABLED"
    ENV_OK=false
fi

if [[ "$AUTH_NEXTAUTH_FALLBACK" == "true" ]]; then
    echo "  ✅ NextAuth Fallback: ENABLED"
else
    echo "  ⚠️  NextAuth Fallback: DISABLED"
fi

if [[ -n "$AUTH_SERVER_URL" ]]; then
    echo "  ✅ Auth Server URL: $AUTH_SERVER_URL"
else
    echo "  ❌ Auth Server URL: MISSING"
    ENV_OK=false
fi

# Test 2: Security Configuration
echo ""
echo "🔐 Test 2: Security Configuration"
echo "----------------------------------"

SECURITY_OK=true

if [[ ${#AUTH_JWT_SECRET} -ge 32 ]]; then
    echo "  ✅ JWT Secret: ${#AUTH_JWT_SECRET} chars"
else
    echo "  ❌ JWT Secret: ${#AUTH_JWT_SECRET} chars (min 32 required)"
    SECURITY_OK=false
fi

if [[ ${#AUTH_COOKIE_SECRET} -ge 32 ]]; then
    echo "  ✅ Cookie Secret: ${#AUTH_COOKIE_SECRET} chars"
else
    echo "  ❌ Cookie Secret: ${#AUTH_COOKIE_SECRET} chars (min 32 required)"
    SECURITY_OK=false
fi

# Test 3: OAuth Provider Configuration
echo ""
echo "🌐 Test 3: OAuth Provider Configuration"
echo "----------------------------------------"

OAUTH_OK=true

if [[ -n "$AUTH_GOOGLE_CLIENT_ID" ]] && [[ -n "$AUTH_GOOGLE_CLIENT_SECRET" ]]; then
    echo "  ✅ Google OAuth: CONFIGURED"
else
    echo "  ⚠️  Google OAuth: NOT CONFIGURED"
    OAUTH_OK=false
fi

if [[ -n "$AUTH_GITHUB_CLIENT_ID" ]] && [[ -n "$AUTH_GITHUB_CLIENT_SECRET" ]]; then
    echo "  ✅ GitHub OAuth: CONFIGURED"
else
    echo "  ⚠️  GitHub OAuth: NOT CONFIGURED"
    OAUTH_OK=false
fi

echo "  📝 Redirect URIs:"
echo "    Google: $NEXT_PUBLIC_APP_URL/api/auth/melody/callback?provider=google"
echo "    GitHub: $NEXT_PUBLIC_APP_URL/api/auth/melody/callback?provider=github"

# Test 4: Database Schema Compatibility
echo ""
echo "🗄️  Test 4: Database Schema Compatibility"
echo "----------------------------------------"

# Check for required tables in schema files
SCHEMA_OK=true

if grep -q '"public.user":' drizzle/meta/0000_snapshot.json; then
    echo "  ✅ User Table: EXISTS"
else
    echo "  ❌ User Table: MISSING"
    SCHEMA_OK=false
fi

if grep -q '"public.account":' drizzle/meta/0000_snapshot.json; then
    echo "  ✅ Account Table: EXISTS"
else
    echo "  ❌ Account Table: MISSING"
    SCHEMA_OK=false
fi

if grep -q '"public.session":' drizzle/meta/0000_snapshot.json; then
    echo "  ✅ Session Table: EXISTS"
else
    echo "  ❌ Session Table: MISSING"
    SCHEMA_OK=false
fi

if grep -q '"public.verificationToken":' drizzle/meta/0000_snapshot.json; then
    echo "  ✅ VerificationToken Table: EXISTS"
else
    echo "  ❌ VerificationToken Table: MISSING"
    SCHEMA_OK=false
fi

echo "  ℹ️  Database URL: $DATABASE_URL"

# Test 5: API Routes Configuration
echo ""
echo "🛣️  Test 5: API Routes Configuration"
echo "------------------------------------"

ROUTES_OK=true

if [[ -f "src/app/api/auth/melody/route.ts" ]]; then
    echo "  ✅ Melody Main Route: EXISTS"
else
    echo "  ❌ Melody Main Route: MISSING"
    ROUTES_OK=false
fi

if [[ -f "src/app/api/auth/melody/callback/route.ts" ]]; then
    echo "  ✅ Melody Callback Route: EXISTS"
else
    echo "  ❌ Melody Callback Route: MISSING"
    ROUTES_OK=false
fi

if [[ -f "src/app/api/auth/melody/test/route.ts" ]]; then
    echo "  ✅ Melody Test Route: EXISTS"
else
    echo "  ❌ Melody Test Route: MISSING"
    ROUTES_OK=false
fi

# Test 6: Auth Configuration
echo ""
echo "⚙️  Test 6: Auth Configuration Files"
echo "------------------------------------"

CONFIG_OK=true

if [[ -f "src/lib/auth/config.ts" ]]; then
    echo "  ✅ Unified Auth Config: EXISTS"
else
    echo "  ❌ Unified Auth Config: MISSING"
    CONFIG_OK=false
fi

if [[ -f "src/lib/auth/melody.config.ts" ]]; then
    echo "  ✅ Melody Config: EXISTS"
else
    echo "  ❌ Melody Config: MISSING"
    CONFIG_OK=false
fi

if [[ -f "src/lib/config/server.ts" ]]; then
    echo "  ✅ Server Config: EXISTS"
else
    echo "  ❌ Server Config: MISSING"
    CONFIG_OK=false
fi

# Test 7: Cloudflare Configuration
echo ""
echo "☁️  Test 7: Cloudflare Configuration"
echo "------------------------------------"

CLOUDFLARE_OK=true

if [[ -n "$CLOUDFLARE_TOKEN" ]]; then
    echo "  ✅ Cloudflare Token: CONFIGURED"
else
    echo "  ❌ Cloudflare Token: MISSING"
    CLOUDFLARE_OK=false
fi

if [[ -n "$CLOUDFLARE_PROJECT_NAME" ]]; then
    echo "  ✅ Project Name: $CLOUDFLARE_PROJECT_NAME"
else
    echo "  ❌ Project Name: MISSING"
    CLOUDFLARE_OK=false
fi

if [[ -n "$CLOUDFLARE_ENVIRONMENT" ]]; then
    echo "  ✅ Environment: $CLOUDFLARE_ENVIRONMENT"
else
    echo "  ⚠️  Environment: NOT SET"
fi

# Test 8: Development and Testing Setup
echo ""
echo "🧪 Test 8: Development and Testing Setup"
echo "----------------------------------------"

TEST_OK=true

if [[ "$AUTH_TEST_MODE" == "true" ]]; then
    echo "  ✅ Test Mode: ENABLED"
else
    echo "  ⚠️  Test Mode: DISABLED"
fi

if [[ -n "$AUTH_TEST_USER_EMAIL" ]] && [[ -n "$AUTH_TEST_USER_PASSWORD" ]]; then
    echo "  ✅ Test User: CONFIGURED"
else
    echo "  ⚠️  Test User: NOT CONFIGURED"
    TEST_OK=false
fi

if [[ "$AUTH_LOG_ACTIVITY" == "true" ]]; then
    echo "  ✅ Activity Logging: ENABLED"
else
    echo "  ⚠️  Activity Logging: DISABLED"
fi

if [[ "$AUTH_METRICS_ENABLED" == "true" ]]; then
    echo "  ✅ Metrics: ENABLED"
else
    echo "  ⚠️  Metrics: DISABLED"
fi

# Summary
echo ""
echo "=================================="
echo "🎯 MELODY SERVER SETUP SUMMARY"
echo "=================================="

TOTAL_TESTS=8
PASSED_TESTS=0

[[ "$ENV_OK" == true ]] && ((PASSED_TESTS++))
[[ "$SECURITY_OK" == true ]] && ((PASSED_TESTS++))
[[ "$SCHEMA_OK" == true ]] && ((PASSED_TESTS++))
[[ "$ROUTES_OK" == true ]] && ((PASSED_TESTS++))
[[ "$CONFIG_OK" == true ]] && ((PASSED_TESTS++))
[[ "$CLOUDFLARE_OK" == true ]] && ((PASSED_TESTS++))

echo "Configuration Tests Passed: $PASSED_TESTS/$TOTAL_TESTS"
echo ""

if [[ $PASSED_TESTS -eq $TOTAL_TESTS ]]; then
    echo "🎉 MELODY SERVER SETUP: ✅ SUCCESS"
    echo ""
    echo "✅ All critical components configured correctly"
    echo "🎵 Ready for Melody authentication testing"
    echo ""
    echo "🚀 Next Steps:"
    echo "  1. Start the Next.js development server"
    echo "  2. Run authentication flow tests (Phase 4.4)"
    echo "  3. Test protected routes (Phase 4.5)"
    echo "  4. Deploy to Cloudflare (Phase 4.3)"
    exit 0
else
    echo "🚫 MELODY SERVER SETUP: ⚠️  PARTIAL SUCCESS"
    echo ""
    echo "⚠️  Some components need attention:"
    [[ "$ENV_OK" == false ]] && echo "  - Environment configuration issues"
    [[ "$SECURITY_OK" == false ]] && echo "  - Security configuration issues"
    [[ "$SCHEMA_OK" == false ]] && echo "  - Database schema issues"
    [[ "$ROUTES_OK" == false ]] && echo "  - API route configuration issues"
    [[ "$CONFIG_OK" == false ]] && echo "  - Auth configuration file issues"
    [[ "$CLOUDFLARE_OK" == false ]] && echo "  - Cloudflare configuration issues"
    echo ""
    echo "Please fix these issues before proceeding with testing."
    exit 1
fi