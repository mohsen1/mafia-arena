#!/bin/bash

# Deployment Recovery Script
# This script helps diagnose and recover from common deployment failures

set -e

echo "🔧 Werewolf AI Deployment Recovery Script"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
  local status=$1
  local message=$2
  case $status in
    "error")
      echo -e "${RED}❌ $message${NC}"
      ;;
    "success")
      echo -e "${GREEN}✅ $message${NC}"
      ;;
    "warning")
      echo -e "${YELLOW}⚠️  $message${NC}"
      ;;
    "info")
      echo -e "${BLUE}ℹ️  $message${NC}"
      ;;
  esac
}

# Function to check if command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Function to check environment variable
check_env_var() {
  local var_name=$1
  local var_value="${!var_name}"
  
  if [ -z "$var_value" ]; then
    print_status "error" "$var_name is not set"
    return 1
  else
    print_status "success" "$var_name is set"
    return 0
  fi
}

# Function to test database connection
test_database_connection() {
  print_status "info" "Testing database connection..."
  
  if pnpm run check-db > /dev/null 2>&1; then
    print_status "success" "Database connection successful"
    return 0
  else
    print_status "error" "Database connection failed"
    return 1
  fi
}

# Function to run build locally
test_local_build() {
  print_status "info" "Testing local build..."
  
  # Clean build artifacts
  rm -rf .next
  
  if pnpm run build > build.log 2>&1; then
    print_status "success" "Local build successful"
    return 0
  else
    print_status "error" "Local build failed. Check build.log for details"
    tail -20 build.log
    return 1
  fi
}

# Main recovery process
echo "1. Checking prerequisites..."
echo "----------------------------"

# Check Node.js
if command_exists node; then
  NODE_VERSION=$(node -v)
  print_status "success" "Node.js installed: $NODE_VERSION"
else
  print_status "error" "Node.js not installed"
  exit 1
fi

# Check pnpm
if command_exists pnpm; then
  PNPM_VERSION=$(pnpm -v)
  print_status "success" "pnpm installed: $PNPM_VERSION"
else
  print_status "error" "pnpm not installed"
  echo "Install with: npm install -g pnpm"
  exit 1
fi

echo ""
echo "2. Checking environment variables..."
echo "------------------------------------"

REQUIRED_VARS=(
  "DATABASE_URL"
  "NEXTAUTH_URL"
  "NEXTAUTH_SECRET"
)

OPTIONAL_VARS=(
  "OPENAI_API_KEY"
  "ANTHROPIC_API_KEY"
  "GEMINI_API_KEY"
  "GOOGLE_API_KEY"
  "GROQ_API_KEY"
)

env_errors=0

# Check required variables
for var in "${REQUIRED_VARS[@]}"; do
  if ! check_env_var "$var"; then
    ((env_errors++))
  fi
done

# Check at least one AI provider
ai_provider_found=false
for var in "${OPTIONAL_VARS[@]}"; do
  if check_env_var "$var" 2>/dev/null; then
    ai_provider_found=true
  fi
done

if [ "$ai_provider_found" = false ]; then
  print_status "error" "No AI provider API key found. At least one is required."
  ((env_errors++))
fi

if [ $env_errors -gt 0 ]; then
  print_status "warning" "Environment variable issues detected"
  echo ""
  echo "To fix:"
  echo "1. Copy env.example to .env.local"
  echo "2. Fill in the required values"
  echo "3. For Vercel, set these in the project settings"
fi

echo ""
echo "3. Checking dependencies..."
echo "---------------------------"

if [ -f "pnpm-lock.yaml" ]; then
  print_status "info" "Installing dependencies..."
  if pnpm install --frozen-lockfile > /dev/null 2>&1; then
    print_status "success" "Dependencies installed"
  else
    print_status "warning" "Dependency installation had warnings"
    print_status "info" "Trying without frozen lockfile..."
    pnpm install
  fi
else
  print_status "error" "pnpm-lock.yaml not found"
  exit 1
fi

echo ""
echo "4. Checking TypeScript..."
echo "-------------------------"

if pnpm tsc --noEmit > tsc.log 2>&1; then
  print_status "success" "TypeScript compilation successful"
else
  print_status "error" "TypeScript errors found"
  echo "First 10 errors:"
  head -30 tsc.log
  echo ""
  echo "To see all errors: cat tsc.log"
fi

echo ""
echo "5. Checking linting..."
echo "----------------------"

if pnpm lint > lint.log 2>&1; then
  print_status "success" "Linting passed"
else
  print_status "warning" "Linting warnings/errors found"
  echo "To see details: cat lint.log"
fi

echo ""
echo "6. Testing database connection..."
echo "---------------------------------"

if [ -n "$DATABASE_URL" ]; then
  test_database_connection
  
  if [ $? -eq 0 ]; then
    print_status "info" "Testing migrations..."
    
    # Test migration status
    if pnpm db:migrate > migrate.log 2>&1; then
      print_status "success" "Migrations up to date"
    else
      print_status "warning" "Migration issues detected"
      echo "Check migrate.log for details"
    fi
  fi
else
  print_status "warning" "Skipping database tests (DATABASE_URL not set)"
fi

echo ""
echo "7. Testing build process..."
echo "---------------------------"

if [ "$1" != "--skip-build" ]; then
  test_local_build
else
  print_status "info" "Skipping build test (--skip-build flag)"
fi

echo ""
echo "8. Common fixes..."
echo "------------------"

print_status "info" "If deployment is failing, try these:"
echo ""
echo "1. Clear Vercel build cache:"
echo "   - Go to Project Settings > General"
echo "   - Click 'Clear Build Cache'"
echo ""
echo "2. Verify environment variables in Vercel:"
echo "   - All required vars should be set"
echo "   - Check for typos or extra spaces"
echo "   - Ensure they're enabled for the right environments"
echo ""
echo "3. For database issues:"
echo "   - Verify DATABASE_URL includes ?sslmode=require"
echo "   - Check if database allows connections from Vercel"
echo "   - Try connecting with: psql \$DATABASE_URL"
echo ""
echo "4. For build issues:"
echo "   - Run: pnpm run build:ci locally"
echo "   - Check for uncommitted changes"
echo "   - Ensure all dependencies are in package.json"
echo ""
echo "5. For memory issues:"
echo "   - Contact Vercel support for limit increase"
echo "   - Or optimize the build process"

echo ""
echo "========================================"
print_status "info" "Recovery check complete!"

# Summary
echo ""
echo "Summary:"
if [ -f build.log ] && grep -q "error" build.log; then
  print_status "error" "Build errors detected - fix these first"
elif [ $env_errors -gt 0 ]; then
  print_status "warning" "Environment configuration needs attention"
else
  print_status "success" "No critical issues found"
fi

echo ""
echo "For more help, see:"
echo "- docs/VERCEL_DEPLOYMENT.md"
echo "- https://github.com/mohsen1/werewolf-ai/issues" 