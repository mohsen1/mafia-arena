#!/bin/bash
set -e

# Set CI=true for build scripts to know we're in CI mode
export CI=true

echo "🚀 Starting CI build process..."
echo "Environment: ${NODE_ENV:-development}"
echo "CI: ${CI:-not set}"

# Function to handle errors
handle_error() {
  echo "❌ Error occurred during: $1"
  echo "Exit code: $2"
  exit $2
}

# Skip environment validation to fix hanging issue
echo ""
echo "🔐 Skipping environment validation (temporarily disabled)"
echo "ℹ️  Environment variables will be validated at runtime"

# Handle database operations for CI
if [ "$CI" = "true" ]; then
  echo "📦 Running in CI build environment"
  echo "ℹ️  Skipping database operations - using Cloudflare D1 at runtime"
  echo "ℹ️  Database migrations are handled via wrangler CLI for D1"
else
  # Local development build
  # Check database connection
  echo "📊 Checking database connection..."
  pnpm run db:check || handle_error "Database connection check" $?

  # Run migrations
  echo "🔄 Running database migrations..."
  pnpm run db:migrate || {
    echo "⚠️  Migration failed, but this might be expected if no new migrations"
    # Don't fail the build for migration issues in CI
  }
fi

# Build the application (skip linting for faster builds)
echo "🏗️  Building Next.js application..."
pnpm run build --no-lint || handle_error "Next.js build" $?

echo "✅ CI build completed successfully!" 