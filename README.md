# Werewolf AI

<div align="center">
  <img src="public/images/logo.png" width="120" alt="Werewolf AI Logo" />
  <h3>An AI-Powered Social Deduction Game</h3>
  <p>Play the classic Werewolf/Mafia game against intelligent AI characters with unique personas</p>
</div>

## About

Werewolf AI is a modern web-based implementation of the classic social deduction party game Werewolf (also known as Mafia). The game replaces human players with sophisticated AI agents that have distinct personalities, strategic thinking, and engaging dialogue capabilities.

### Key Features

- **Intelligent AI Players**: Multiple AI providers (OpenAI, Anthropic Claude, Google Gemini, Groq) with unique personas
- **User Authentication**: Secure OAuth login with Google/GitHub plus username/password authentication
- **Database Persistence**: PostgreSQL-backed game state with user ownership
- **Multilingual Support**: Full internationalization with automatic translation generation
- **Dynamic Character Generation**: AI agents create rich backstories and personalities
- **Text-to-Speech**: Immersive audio experience with ElevenLabs integration
- **Modern UI**: Beautiful, responsive interface built with Next.js 15 and Tailwind CSS
- **Multiple Game Roles**: Classic roles including Werewolves, Villagers, Seer, and Doctor
- **Configurable**: Customizable game settings and AI model selection

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Frontend**: React 19, Tailwind CSS, Shadcn UI
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: NextAuth.js with Google/GitHub OAuth + username/password
- **AI Integration**: OpenAI, Anthropic, Google Gemini, Groq SDKs
- **Audio**: ElevenLabs Text-to-Speech
- **Testing**: Vitest (unit), Playwright (e2e)
- **Internationalization**: i18next
- **Package Manager**: pnpm

## Prerequisites

- **Node.js** 18+ 
- **pnpm** 9+
- **PostgreSQL** (will be installed automatically via Homebrew on macOS)
- **AI API Keys** (at least one):
  - OpenAI API key for GPT models
  - Anthropic API key for Claude models
  - Google AI API key for Gemini models
  - Groq API key for fast inference
- **OAuth App Credentials**:
  - Google OAuth client ID and secret
  - GitHub OAuth client ID and secret
- **ElevenLabs API key** (optional, for text-to-speech)

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/mohsen1/werewolf-ai.git
cd werewolf-ai
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Database Setup

The project includes an automated database setup script for macOS:

```bash
# Install PostgreSQL and create database
pnpm run db:setup

# Push database schema
pnpm run db:push

# (Optional) Open Drizzle Studio to view database
pnpm run db:studio
```

### 4. OAuth Provider Setup

#### Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth client ID"
5. Set application type to "Web application"
6. Add authorized redirect URI: `http://localhost:3099/api/auth/callback/google`
7. Copy Client ID and Client Secret for environment configuration

#### GitHub OAuth Setup
1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Set Authorization callback URL: `http://localhost:3099/api/auth/callback/github`
4. Copy Client ID and Client Secret for environment configuration

### 5. Environment Configuration

Create a `.env.local` file in the root directory:

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

# AI Provider API Keys (configure at least one)
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_API_BASE=https://api.openai.com/v1  # Optional: custom endpoint
OPENAI_MODEL=gpt-4o-mini  # Optional: default model

ANTHROPIC_API_KEY=your_anthropic_api_key_here
CLAUDE_MODEL=claude-3-haiku-20240307  # Optional: default model

GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-flash  # Optional: default model

GROQ_API_KEY=your_groq_api_key_here

# Text-to-Speech (Optional)
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Email (Optional for password reset)
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
EMAIL_FROM="Werewolf AI <noreply@werewolf-ai.com>"

# Development
ENABLE_VERBOSE_AI_LOGGING=false  # Set to true for detailed AI logs
DEFAULT_TRANSLATION_MODEL=meta-llama/Meta-Llama-3-8B-Instruct  # For translation generation
```

### 6. Generate Translations (Optional)

If you want to add new languages or update translations:

```bash
pnpm run translate
```

### 7. Start Development Server

You can start the application with database setup in one command:

```bash
# Setup database and start dev server
pnpm run dev:db

# Or run individually:
pnpm run db:setup    # Setup PostgreSQL
pnpm run db:push     # Create/update tables
pnpm run db:seed     # Seed development user
pnpm run dev         # Start dev server
```

The application will be available at `http://localhost:3099`

### Development User Account

A development user account is automatically created when you run the setup. You can use these credentials to sign in during development:

**Email**: `dev@werewolf-ai.com`  
**Password**: `DevPassword123!`

This account is only created in development mode and allows you to:
- Test authentication flows
- Create and manage games
- Test game ownership features
- Access all authenticated features

> **Note**: The development user is automatically seeded when running `pnpm run dev:db` or `pnpm run db:seed`. If the user already exists, the seeding process will skip creation.

> **Production Safety**: The seeding script automatically detects production environments and will not create the development user in production mode.

### 8. Build for Production

```bash
pnpm build
pnpm start
```

### Deploying to Vercel

Configure the environment variables supplied by Vercel for both Production and
Preview deployments. The application expects at least `DATABASE_URL` to be set
along with the additional Postgres and Neon Auth variables provided by Vercel
(such as `DATABASE_URL_UNPOOLED`, `PGHOST`, `PGUSER`, `PGDATABASE`,
`PGPASSWORD`, `POSTGRES_URL`, and the `NEXT_PUBLIC_STACK_*` keys). These values
should be entered in the Vercel dashboard and **must not** be committed to the
repository.

## How to Play

### Game Overview

Werewolf is a social deduction game where players are secretly assigned roles and must identify the hidden threats among them.

### Roles

- **Werewolves**: Secretly eliminate villagers each night
- **Villagers**: Use discussion and voting to identify werewolves
- **Seer**: Can investigate one player each night to learn their role
- **Doctor**: Can protect one player from werewolf attacks each night

### Game Flow

1. **Day Phase**: All players discuss and vote to eliminate a suspected werewolf
2. **Night Phase**: Werewolves choose a target, Doctor selects someone to protect, Seer investigates a player
3. **Repeat**: Continue until all werewolves are eliminated (Villagers win) or werewolves equal/outnumber villagers (Werewolves win)

### Starting a Game

1. Navigate to the game interface
2. Configure game settings:
   - Number of players
   - AI model preferences
   - Game theme
   - Language preference
   - Choose to join as human player (optional)
3. Click "Start Game" and watch the AI characters come to life!

## Authentication & User Features

### User Accounts

The application now supports user authentication, providing personalized experiences and game ownership:

- **Multiple Sign-In Options**: OAuth with Google/GitHub or traditional email/password registration
- **Game Ownership**: All games are tied to the user who created them
- **Personal Game History**: Access and resume your own games
- **User Preferences**: Customizable settings saved to your account
- **Password Reset**: Easily reset your password via email if you forget it

### Authentication Flow

1. **Sign In**: Click the sign-in button and choose Google or GitHub
2. **Authorization**: Grant permission for the app to access your basic profile
3. **Account Creation**: Your account is automatically created on first sign-in
4. **Game Access**: Create and access games tied to your account

### Data Privacy

- Only basic profile information is stored (name, email, profile picture)
- Game data is isolated by user - you can only access your own games
- OAuth providers handle authentication securely
- No sensitive data is stored beyond what's necessary for gameplay

## Testing

### Run Unit Tests

```bash
pnpm test
```

### Run E2E Tests

```bash
pnpm test:e2e
```

### Run Tests with UI

```bash
pnpm test:e2e:ui
```

### Type Checking

```bash
pnpm tsc
```

### Database Management

```bash
# Database setup and management
pnpm run db:setup      # Setup PostgreSQL with Homebrew
pnpm run db:push       # Push schema changes to database
pnpm run db:generate   # Generate migration files
pnpm run db:migrate    # Run pending migrations
pnpm run db:studio     # Open Drizzle Studio (database GUI)
pnpm run db:drop       # Drop all tables (destructive)

# Development with database
pnpm run dev:db        # Setup DB and start dev server
```

## Project Structure

```
src/
├── app/                    # Next.js App Router pages and API routes
│   ├── actions/           # Server Actions for game logic
│   ├── api/               # API routes (auth, TTS, etc.)
│   │   └── auth/          # NextAuth.js authentication routes
│   └── [locale]/          # Internationalized pages
├── components/            # React components
│   ├── game/             # Game-specific UI components
│   └── ui/               # Reusable UI components (Shadcn)
├── context/              # React Context providers
├── db/                   # Database configuration and persistence
│   ├── persistence.ts    # Database operations for game state
│   ├── schema.ts         # Drizzle database schema
│   └── db.ts             # Database connection setup
├── dictionaries/         # Translation files
├── hooks/                # Custom React hooks
├── lib/                  # Core game logic and utilities
│   ├── engine/           # Game engine (roles, phases, agents)
│   │   ├── agents/       # AI agent implementations
│   │   ├── core/         # Core game classes
│   │   ├── phases/       # Game phase implementations
│   │   └── roles/        # Role implementations
│   ├── ai/               # AI service integrations
│   ├── auth/             # Authentication configuration
│   └── tts/              # Text-to-speech services
├── scripts/              # Database setup and utility scripts
└── utils.ts              # Utility functions
```

## Internationalization

The game supports multiple languages with automatic translation generation:

- **English** (default)
- **Spanish**, **French**, **German**, **Italian**, **Portuguese**
- **Japanese**, **Korean**, **Chinese (Simplified)**
- And more...

To add a new language:

1. Add the language code to `src/lib/i18n/settings.ts`
2. Run `pnpm run translate` to generate translations
3. Review and refine translations in `src/dictionaries/[lang].json`

## Configuration

### AI Model Selection

Each game allows you to configure:
- Different AI providers for different roles
- Model selection (GPT-4, Claude, Gemini, etc.)
- Custom API endpoints for self-hosted models

### Game Themes

The game supports different themes that influence:
- Character persona generation
- Setting and atmosphere
- Dialogue style and content

## Contributing

We welcome contributions! Please see our [contributing guidelines](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `pnpm test && pnpm test:e2e`
5. Check types: `pnpm tsc`
6. Commit your changes: `git commit -m 'Add amazing feature'`
7. Push to the branch: `git push origin feature/amazing-feature`
8. Open a Pull Request

### Code Standards

- Use TypeScript for all new code
- Follow the existing code style
- Add tests for new features
- Update documentation as needed
- Use semantic commit messages

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Inspired by the classic Werewolf/Mafia party game
- Built with amazing open-source technologies
- AI providers for enabling intelligent gameplay
- The Werewolf community for inspiration and feedback

## Support

- [Report Issues](https://github.com/your-username/werewolf-ai/issues)
- [Discussions](https://github.com/your-username/werewolf-ai/discussions)
- Email: support@werewolf-ai.com

---

<div align="center">
  <p>Made with care by the Werewolf AI team</p>
  <p>
    <a href="#werewolf-ai">Back to top</a> •
    <a href="https://werewolf-ai.com">Website</a> •
    <a href="https://discord.gg/werewolf-ai">Discord</a>
  </p>
</div>
