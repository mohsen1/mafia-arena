#!/bin/bash

# Werewolf AI - Database Setup Script
# This script sets up PostgreSQL using Homebrew for local development

set -e

echo "🐺 Setting up Werewolf AI database..."

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew is not installed. Please install it first from https://brew.sh"
    exit 1
fi

# Install PostgreSQL if not already installed
if ! brew list postgresql@16 &> /dev/null; then
    echo "📦 Installing PostgreSQL 16..."
    brew install postgresql@16
else
    echo "✅ PostgreSQL 16 is already installed"
fi

# Start PostgreSQL service
echo "🚀 Starting PostgreSQL service..."
brew services start postgresql@16

# Wait a moment for the service to start
sleep 2

# Create database if it doesn't exist
DB_NAME="werewolf_ai_dev"
DB_USER="werewolf_ai"
DB_PASSWORD="dev_password_2024"

echo "🗄️ Setting up database and user..."

# Create user and database
psql postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null || echo "User $DB_USER already exists"
psql postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || echo "Database $DB_NAME already exists"
psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null || true

echo "✅ Database setup complete!"
echo ""
echo "Database Details:"
echo "  Host: localhost"
echo "  Port: 5432"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo "  Password: $DB_PASSWORD"
echo ""
echo "Connection URL: postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
echo ""
echo "To connect manually: psql postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME" 