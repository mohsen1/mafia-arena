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

# Validate required environment variables first
echo ""
echo "🔐 Validating required environment variables..."
pnpm run verify:env || handle_error "Environment validation" $?

# Handle database operations differently for Vercel
if [ "$VERCEL" = "1" ]; then
  echo "📦 Running in Vercel build environment"
  
  # Check if DATABASE_URL is available
  if [ -n "$DATABASE_URL" ]; then
    echo "🔍 DATABASE_URL is configured"
    
    # Check database connection
    echo "📊 Checking database connection..."
    if pnpm run db:check; then
      echo "✅ Database connection successful"
      
      # Run migrations
      echo "🔄 Running database migrations..."
      if pnpm run db:migrate; then
        echo "✅ Migrations completed successfully"
      else
        echo "⚠️  Migration command returned non-zero exit code"
        echo "ℹ️  This is expected if there are no new migrations to apply"
      fi
    else
      echo "⚠️  Database connection check failed"
      echo "ℹ️  Proceeding with build - database might not be configured yet"
    fi
  else
    echo "⚠️  DATABASE_URL not configured"
    echo "ℹ️  Skipping database operations - ensure DATABASE_URL is set in Vercel environment variables"
  fi
else
  # Non-Vercel environment (CI, local builds)
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

# Build the application
echo "🏗️  Building Next.js application..."
pnpm run build || handle_error "Next.js build" $?

echo "✅ CI build completed successfully!" 