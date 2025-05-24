# Werewolf AI - Database & Authentication Setup

This document explains the database and authentication setup for the Werewolf AI application.

## Overview

The application now uses:
- **PostgreSQL** for data persistence (replacing file-based storage)
- **NextAuth.js** for user authentication
- **Drizzle ORM** for database operations
- **Google & GitHub OAuth** for sign-in

## Prerequisites

- macOS with Homebrew installed
- Node.js and pnpm
- PostgreSQL (will be installed automatically)

## Setup Instructions

### 1. Database Setup

The project includes an automated database setup script:

```bash
# Install PostgreSQL and create database
pnpm run db:setup

# Push database schema
pnpm run db:push

# (Optional) Open Drizzle Studio to view database
pnpm run db:studio
```

### 2. Environment Variables

Copy the `env.example` file and configure your environment:

```bash
cp env.example .env.local
```

Required environment variables:

```bash
# Database
DATABASE_URL="postgresql://werewolf_ai:dev_password_2024@localhost:5432/werewolf_ai_dev"

# NextAuth
NEXTAUTH_URL="http://localhost:3099"
NEXTAUTH_SECRET="your-secret-key-here"

# OAuth Providers
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

# AI APIs (existing)
OPENAI_API_KEY="your-openai-api-key"
# ... other AI keys
```

### 3. OAuth Provider Setup

#### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth client ID"
5. Set application type to "Web application"
6. Add authorized redirect URI: `http://localhost:3099/api/auth/callback/google`
7. Copy Client ID and Client Secret to your `.env.local`

#### GitHub OAuth Setup

1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Set Authorization callback URL: `http://localhost:3099/api/auth/callback/github`
4. Copy Client ID and Client Secret to your `.env.local`

### 4. Development Workflow

Start the application with database:

```bash
# Setup database and start dev server in one command
pnpm run dev:db

# Or run individually:
pnpm run db:setup    # Setup PostgreSQL
pnpm run db:push     # Create/update tables
pnpm run dev         # Start dev server
```

## Database Schema

The application uses the following main tables:

### Authentication Tables (NextAuth)
- `user` - User accounts
- `account` - OAuth provider accounts
- `session` - User sessions
- `verificationToken` - Email verification tokens

### Application Tables
- `games` - Game instances with full state stored as JSONB
- `game_participants` - Players in each game (human and AI)
- `user_preferences` - User settings and preferences

## Key Features

### Database Persistence
- Full game state stored in PostgreSQL JSONB columns
- Backward-compatible API with the original file-based persistence
- Support for concurrent users and games

### Authentication
- OAuth sign-in with Google and GitHub
- User sessions managed by NextAuth
- Protected routes requiring authentication

### Game Ownership
- Users own and can only access their own games
- Games are tied to the authenticated user who created them

## Development Commands

```bash
# Database management
pnpm run db:setup      # Setup PostgreSQL with Homebrew
pnpm run db:push       # Push schema changes to database
pnpm run db:generate   # Generate migration files
pnpm run db:migrate    # Run pending migrations
pnpm run db:studio     # Open Drizzle Studio (database GUI)
pnpm run db:drop       # Drop all tables (destructive)

# Development
pnpm run dev:db        # Setup DB and start dev server
pnpm run dev           # Start development server
pnpm run build         # Build for production
pnpm tsc               # Type check
pnpm run test          # Run tests
```

## Migration from File-based Storage

The new database persistence is backward-compatible. Existing server actions will continue to work without changes, but now save to PostgreSQL instead of JSON files.

### Key Changes
- Games are now owned by authenticated users
- All server actions now require authentication
- Game states include owner information
- Concurrent access is properly handled

## Troubleshooting

### Database Connection Issues
```bash
# Check if PostgreSQL is running
brew services list | grep postgresql

# Start PostgreSQL manually
brew services start postgresql@16

# Connect to database manually
/opt/homebrew/opt/postgresql@16/bin/psql postgresql://werewolf_ai:dev_password_2024@localhost:5432/werewolf_ai_dev
```

### Authentication Issues
- Ensure OAuth apps are configured correctly
- Check callback URLs match exactly
- Verify environment variables are set
- Check NEXTAUTH_SECRET is set in production

### Type Errors
```bash
# Fix type checking
pnpm tsc

# Clear Next.js cache if needed
rm -rf .next
```

## Production Deployment

For production deployment:

1. Use a managed PostgreSQL service (e.g., Supabase, Railway, AWS RDS)
2. Set production environment variables
3. Configure OAuth providers for production URLs
4. Use a strong NEXTAUTH_SECRET
5. Enable SSL for database connections

## Security Considerations

- Database credentials are environment-specific
- OAuth secrets must be kept secure
- Sessions are managed securely by NextAuth
- Game data is isolated by user ownership
- SQL injection protection via Drizzle ORM 