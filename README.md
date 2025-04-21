# Mafia Game

A text-based implementation of the social deduction game "Mafia" (also known as "Werewolf"). This implementation features both human and AI players.

## Overview

In Mafia, players are secretly assigned roles as either innocent villagers or mafia members. The game alternates between day and night phases:

- **Day Phase**: All players discuss and vote on who they think might be the Mafia. The player with the most votes is executed.
- **Night Phase**: The Mafia members secretly choose a villager to eliminate.

The game continues until either all Mafia members are eliminated (villagers win) or the Mafia members equal or outnumber the villagers (Mafia wins).

## Features

- Modular architecture using interfaces and the State Pattern for game phases
- Support for human player interaction via the console
- Simple AI agents with basic decision-making capabilities
- Game state rendering to console and Markdown log files
- Extensible design for adding more roles and features

## Project Structure

```
./
├── src/
│   ├── core/                    # Core game logic classes
│   ├── main.ts                  # Entry point
│   ├── rendering/               # Renderer implementations
│   ├── phases/                  # Game phase implementations
│   ├── roles/                   # Role implementations (Mafia, Villager, Doctor, Seer...)
│   ├── agents/                  # Agent implementations (AI & Human)
│   └── interfaces/              # Core interfaces
├── tests/                       # Unit and integration tests
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/mafia-game.git
cd mafia-game

# Install dependencies
npm install
```

### Running the Game

```bash
# Build the project
npm run build

# Run the game
npm start

# Or run in development mode
npm run dev
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

- More roles (Doctor, Detective, etc.)
- Advanced AI agents using more sophisticated decision-making
- Web-based UI
- Multiplayer support over the network
- Game statistics and analytics

## License

MIT
