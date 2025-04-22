# Mafia Game

A text-based implementation of the social deduction game "Mafia" (also known as "Werewolf"). This implementation features both human and AI players.

## Overview

In Mafia, players are secretly assigned roles as either innocent villagers or mafia members. The game alternates between day and night phases:

- **Day Phase**: All players discuss and vote on who they think might be the Mafia. The player with the most votes is executed.
- **Night Phase**: The Mafia members secretly choose a villager to eliminate. Roles like Doctor and Seer may also perform night actions.

The game continues until either all Mafia members are eliminated (villagers win) or the Mafia members equal or outnumber the villagers (Mafia wins).

## Features

- Modular architecture using interfaces and the State Pattern for game phases
- Support for human player interaction via the console
- Basic AI agent (`DummyAIAgent`)
- Advanced AI agents using LLMs:
    - `OpenAIAgent` (via OpenAI API)
    - `ClaudeAgent` (via Anthropic API)
    - `GeminiAgent` (via Google API)
- Implemented roles: `Villager`, `Mafia`, `Doctor`, `Seer`
- Game state rendering to console and Markdown log files
- Conversation logging and memory for AI agents
- Optional game themes (e.g., classic, wild west) to influence prompts
- Extensible design for adding more roles and features

## Project Structure

```
./
├── src/
│   ├── core/                    # Core game logic (Game, Player, Message, ConversationLog)
│   │   ├── Game.ts
│   │   ├── Player.ts
│   │   ├── Message.ts
│   │   ├── ConversationLog.ts
│   │   └── utils.ts
│   ├── main.ts                  # Entry point
│   ├── prompts.ts               # Prompts used by AI agents
│   ├── rendering/               # Renderer implementations
│   │   ├── ConsoleRenderer.ts
│   │   └── MarkdownRenderer.ts
│   ├── phases/                  # Game phase implementations (Init, Day, Night, GameOver)
│   │   ├── InitializationPhase.ts
│   │   ├── DayPhase.ts
│   │   ├── NightPhase.ts
│   │   ├── GameOverPhase.ts
│   │   └── AbstractGamePhase.ts
│   ├── roles/                   # Role implementations
│   │   ├── VillagerRole.ts
│   │   ├── MafiaRole.ts
│   │   ├── DoctorRole.ts
│   │   ├── SeerRole.ts
│   │   └── Role.ts              # Base role class/interface
│   ├── agents/                  # Agent implementations
│   │   ├── HumanAgent.ts
│   │   ├── DummyAIAgent.ts
│   │   ├── OpenAIAgent.ts
│   │   ├── ClaudeAgent.ts
│   │   └── GeminiAgent.ts
│   └── interfaces/              # Core interfaces (IAgent, IRole, IGamePhase, etc.)
│       ├── IAgent.ts
│       ├── IRole.ts
│       ├── IGamePhase.ts
│       ├── IGameRenderer.ts
│       ├── IPlayer.ts
│       ├── IMessage.ts
│       ├── GameState.ts
│       ├── AgentMemory.ts
│       ├── AIConfig.ts
│       └── Theme.ts
├── tests/                       # Unit and integration tests
├── .env.example                 # Example environment variables
├── .gitignore
├── package.json
├── pnpm-lock.yaml
├── README.md
└── tsconfig.json
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- (Optional) OpenAI API Key if using `OpenAIAgent`

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/mafia-game.git
cd mafia-game

# Install dependencies
pnpm install
```

### Environment Variables (for AI Agents)

If you plan to use the `OpenAIAgent`, `ClaudeAgent`, or `GeminiAgent`, create a `.env` file in the project root (you can copy `.env.example`):

```plaintext
#.env
# --- OpenAI ---
OPENAI_API_KEY="your_openai_api_key"
OPENAI_MODEL="gpt-4o" # Or gpt-4-turbo, gpt-3.5-turbo, etc.
# OPENAI_BASE_URL="your_proxy_or_local_url" # Optional

# --- Anthropic ---
ANTHROPIC_API_KEY="your_anthropic_api_key"
# ANTHROPIC_MODEL="claude-3-sonnet-20240229" # Optional, defaults to Sonnet 3.5
# ANTHROPIC_BASE_URL="your_proxy_or_local_url" # Optional

# --- Google Gemini ---
GEMINI_API_KEY="your_google_api_key"
# GEMINI_MODEL="gemini-1.5-pro-latest" # Optional, defaults to 1.5-flash
```

Replace placeholders with your actual keys. **Do not commit your `.env` file to version control.**

### Running the Game

```bash
# Build the project
npm run build

# Run the game (will prompt for setup choices)
npm start

# Or run in development mode (watches for changes)
npm run dev
```

### Enabling Debug Logs

To see verbose logging from the AI agents (like their thinking process, chosen actions, and potential errors), you can use the `DEBUG` environment variable. Set it before running the game:

```bash
# Show logs from all agents and core game logic
DEBUG=mafia:* npm start

# Show logs only from OpenAI agent
DEBUG=mafia:agent:openai npm start

# Show logs from Claude and Gemini agents
DEBUG=mafia:agent:claude,mafia:agent:gemini npm start

# Show logs from Dummy agent
DEBUG=mafia:agent:dummy npm start

# Show logs from core game logic
# DEBUG=mafia:core npm start
```

## Game Play

When playing as a human:
- During the day phase, you can send messages to other players or vote for a player to execute
- If you're a Mafia member, during the night phase you'll be asked to choose a player to eliminate
- Follow the on-screen prompts to enter your actions

## Creating Custom Renderers

The game uses an interface-based approach for rendering output, allowing you to easily create custom renderers (e.g., for a web UI, a different log format, or a graphical display).

1.  **Implement `IGameRenderer`:**
    Create a new class in the `src/rendering/` directory that implements the `IGameRenderer` interface (`src/interfaces/IGameRenderer.ts`).

2.  **Define Methods:**
    Your class must implement the methods defined in the interface. These methods are called by the `Game` core at different points:
    *   `renderGameStart(players, gameId)`: Called once at the beginning.
    *   `renderRoundStart(round)`: Called at the start of each round.
    *   `renderPhaseStart(phase, round)`: Called at the start of each phase (Init, Day, Night, GameOver).
    *   `renderMessage(message)`: Called whenever a message is logged (respecting visibility).
    *   `renderVoteResults(votes, executedPlayerId)`: Called after Day voting to show who voted for whom and the outcome.
    *   `renderNightResults(killedPlayerId)`: Called after the Night phase to announce who was killed (if anyone).
    *   `renderPlayerStatusUpdate(player, oldStatus, newStatus)`: Called when a player's status changes (e.g., Alive -> Dead).
    *   `renderGameOver(winner, finalState)`: Called once at the end, providing the winner and final player details.
    *   `renderNarration(text)`: Used for general system messages, prompts, or phase descriptions.

3.  **Register Renderer:**
    In `src/main.ts`, instantiate your custom renderer and add it to the game using `game.addRenderer(new YourCustomRenderer());`.

The `ConsoleRenderer` and `MarkdownRenderer` provide examples of how to implement this interface.

## Future Enhancements

- More roles (e.g., Detective, Bodyguard)
- Web-based UI
- Multiplayer support over the network
- Game statistics and analytics
- More sophisticated AI agent strategies and memory management

## License

MIT
