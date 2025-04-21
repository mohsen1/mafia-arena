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
│   ├── roles/                   # Role implementations
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

## Future Enhancements

- More roles (Doctor, Detective, etc.)
- Advanced AI agents using more sophisticated decision-making
- Web-based UI
- Multiplayer support over the network
- Game statistics and analytics

## License

MIT
