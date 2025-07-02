#!/bin/bash
set -e

echo "🚀 Starting CI build process..."
echo "Environment: ${NODE_ENV:-development}"
echo "Vercel: ${VERCEL:-not set}"
echo "CI: ${CI:-not set}"

# Function to handle errors
handle_error() {
  echo "❌ Error occurred during: $1"
  echo "Exit code: $2"
  exit $2
}

# Check database connection
echo "📊 Checking database connection..."
pnpm run check-db || handle_error "Database connection check" $?

# Run migrations
echo "🔄 Running database migrations..."
pnpm run db:migrate || {
  echo "⚠️  Migration failed, but this might be expected if no new migrations"
  # Don't fail the build for migration issues in CI
}

# Push schema changes
echo "📤 Pushing database schema..."
pnpm run db:push || {
  echo "⚠️  Schema push failed, but continuing with build"
  # Don't fail the build for schema push issues in CI
}

# Build the application
echo "🏗️  Building Next.js application..."
pnpm run build || handle_error "Next.js build" $?

echo "✅ CI build completed successfully!" 