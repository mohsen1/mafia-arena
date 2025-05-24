# Werewolf AI

<div align="center">
  <img src="public/images/logo.png" width="120" alt="Werewolf AI Logo" />
  <h3>An AI-Powered Social Deduction Game</h3>
  <p>Play the classic Werewolf/Mafia game against intelligent AI characters with unique personas</p>
</div>

## 🎮 About

Werewolf AI is a modern web-based implementation of the classic social deduction party game Werewolf (also known as Mafia). The game replaces human players with sophisticated AI agents that have distinct personalities, strategic thinking, and engaging dialogue capabilities.

### ✨ Key Features

- **🤖 Intelligent AI Players**: Multiple AI providers (OpenAI, Anthropic Claude, Google Gemini, Groq) with unique personas
- **🌍 Multilingual Support**: Full internationalization with automatic translation generation
- **🎭 Dynamic Character Generation**: AI agents create rich backstories and personalities
- **🗣️ Text-to-Speech**: Immersive audio experience with ElevenLabs integration
- **📱 Modern UI**: Beautiful, responsive interface built with Next.js 15 and Tailwind CSS
- **🎯 Multiple Game Roles**: Classic roles including Werewolves, Villagers, Seer, and Doctor
- **💾 Game Persistence**: Save and resume games with full state management
- **🔧 Configurable**: Customizable game settings and AI model selection

## 🛠️ Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Frontend**: React 19, Tailwind CSS, Shadcn UI
- **AI Integration**: OpenAI, Anthropic, Google Gemini, Groq SDKs
- **Audio**: ElevenLabs Text-to-Speech
- **Testing**: Vitest (unit), Playwright (e2e)
- **Internationalization**: i18next
- **Package Manager**: pnpm

## 📋 Prerequisites

- **Node.js** 18+ 
- **pnpm** 9+
- **AI API Keys** (at least one):
  - OpenAI API key for GPT models
  - Anthropic API key for Claude models
  - Google AI API key for Gemini models
  - Groq API key for fast inference
- **ElevenLabs API key** (optional, for text-to-speech)

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/werewolf-ai.git
cd werewolf-ai
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Environment Configuration

Create a `.env.local` file in the root directory:

```bash
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

# Development
ENABLE_VERBOSE_AI_LOGGING=false  # Set to true for detailed AI logs
DEFAULT_TRANSLATION_MODEL=meta-llama/Meta-Llama-3-8B-Instruct  # For translation generation
```

### 4. Generate Translations (Optional)

If you want to add new languages or update translations:

```bash
pnpm run translate
```

### 5. Start Development Server

```bash
pnpm dev
```

The application will be available at `http://localhost:3099`

### 6. Build for Production

```bash
pnpm build
pnpm start
```

## 🎲 How to Play

### Game Overview

Werewolf is a social deduction game where players are secretly assigned roles and must identify the hidden threats among them.

### Roles

- **🐺 Werewolves**: Secretly eliminate villagers each night
- **👥 Villagers**: Use discussion and voting to identify werewolves
- **🔮 Seer**: Can investigate one player each night to learn their role
- **⚕️ Doctor**: Can protect one player from werewolf attacks each night

### Game Flow

1. **🌅 Day Phase**: All players discuss and vote to eliminate a suspected werewolf
2. **🌙 Night Phase**: Werewolves choose a target, Doctor selects someone to protect, Seer investigates a player
3. **🔄 Repeat**: Continue until all werewolves are eliminated (Villagers win) or werewolves equal/outnumber villagers (Werewolves win)

### Starting a Game

1. Navigate to the game interface
2. Configure game settings:
   - Number of players
   - AI model preferences
   - Game theme
   - Language preference
   - Choose to join as human player (optional)
3. Click "Start Game" and watch the AI characters come to life!

## 🧪 Testing

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

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router pages and API routes
│   ├── actions/           # Server Actions for game logic
│   ├── api/               # API routes (TTS, etc.)
│   └── [locale]/          # Internationalized pages
├── components/            # React components
│   ├── game/             # Game-specific UI components
│   └── ui/               # Reusable UI components (Shadcn)
├── context/              # React Context providers
├── dictionaries/         # Translation files
├── hooks/                # Custom React hooks
├── lib/                  # Core game logic and utilities
│   ├── engine/           # Game engine (roles, phases, agents)
│   │   ├── agents/       # AI agent implementations
│   │   ├── core/         # Core game classes
│   │   ├── phases/       # Game phase implementations
│   │   └── roles/        # Role implementations
│   ├── ai/               # AI service integrations
│   └── tts/              # Text-to-speech services
└── utils.ts              # Utility functions
```

## 🌐 Internationalization

The game supports multiple languages with automatic translation generation:

- **English** (default)
- **Spanish**, **French**, **German**, **Italian**, **Portuguese**
- **Japanese**, **Korean**, **Chinese (Simplified)**
- And more...

To add a new language:

1. Add the language code to `src/lib/i18n/settings.ts`
2. Run `pnpm run translate` to generate translations
3. Review and refine translations in `src/dictionaries/[lang].json`

## 🔧 Configuration

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

## 🤝 Contributing

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

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by the classic Werewolf/Mafia party game
- Built with amazing open-source technologies
- AI providers for enabling intelligent gameplay
- The Werewolf community for inspiration and feedback

## 📞 Support

- 🐛 [Report Issues](https://github.com/your-username/werewolf-ai/issues)
- 💬 [Discussions](https://github.com/your-username/werewolf-ai/discussions)
- 📧 Email: support@werewolf-ai.com

---

<div align="center">
  <p>Made with ❤️ by the Werewolf AI team</p>
  <p>
    <a href="#werewolf-ai">Back to top</a> •
    <a href="https://werewolf-ai.com">Website</a> •
    <a href="https://discord.gg/werewolf-ai">Discord</a>
  </p>
</div>
