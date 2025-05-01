
**Werewolf AI - Design Document**

**Version:** 1.0
**Date:** 2024-10-27
**Author:** AI Assistant (based on provided codebase)

**Page 1 of 3**

**1. Introduction**

Werewolf AI is a single-player, web-based implementation of the classic social deduction party game Werewolf (also known as Mafia). The primary innovation of this project lies in replacing human players with Artificial Intelligence (AI) agents. These AI agents are designed not just to fulfill the game mechanics associated with their assigned roles (Werewolf, Villager, Seer, Doctor, etc.) but also to embody distinct, generated personas, contributing unique dialogue and potentially influencing their strategic decisions within the game.

The project aims to simulate the engaging, suspenseful, and deceptive nature of a traditional Werewolf game, allowing a human player to experience the core dynamics of deduction, accusation, and survival against a cast of AI characters. The game follows the standard Werewolf rules, proceeding in rounds alternating between Night and Day phases, facilitated by an automated moderator system embedded within the game logic. Players (human or AI) take on secret roles, with the Villagers attempting to identify and eliminate the hidden Werewolves, while the Werewolves collaborate secretly to eliminate Villagers each night. Special roles like the Seer and Doctor add layers of information gathering and protection.

This document outlines the design, architecture, and technical implementation details of the Werewolf AI project. It draws upon the existing codebase structure, including the core game engine, AI agent integration, user interface components, internationalization strategy, and persistence mechanisms.

**2. Goals and Objectives**

The primary goals of the Werewolf AI project are:

*   **Faithful Game Simulation:** To accurately implement the core rules and turn-based structure (Night/Day phases) of the Werewolf/Mafia party game.
*   **Compelling AI Opponents:** To develop AI agents capable of playing assigned roles effectively, making plausible (though not necessarily perfect) strategic decisions, and engaging in believable, in-character dialogue based on generated personas.
*   **Persona-Driven AI:** To create rich, diverse AI character personas (based on the structure seen in `data.json`) that influence their communication style and potentially their actions, adding depth and replayability beyond simple game logic.
*   **Intuitive User Experience:** To provide a clear and engaging web-based interface (using Next.js, React, Shadcn UI, Tailwind CSS) allowing a human player (or observer) to easily follow the game flow, participate in discussions and voting (if playing), and understand the game state.
*   **Internationalization (i18n):** To support multiple languages, making the game accessible to a wider audience. This involves a robust translation management system (evident from `i18next` configuration and the `generate-translations.ts` script).
*   **Modularity and Extensibility:** To design the core game engine (`lib/engine`) in a modular way, allowing for future expansion with new roles, themes, AI agent types, or game mechanics.
*   **Flexible AI Integration:** To create an abstraction layer (`lib/ai/openaiService.ts`, `lib/agentFactory.ts`) that allows integration with various AI model providers (OpenAI, Anthropic, Gemini, Groq, etc., as seen in `package.json` and agent code).
*   **State Management:** To efficiently manage and persist game state between turns and phases using server-side logic (Next.js Server Actions) and client-side context (`GameContext.tsx`).
*   **Basic Persistence:** To implement a mechanism (currently file-based via `lib/persistence.ts`) for saving and potentially resuming game states.

**3. Core Concepts**

The project revolves around several core concepts:

*   **Werewolf/Mafia Game Rules:** The fundamental rules as outlined in the `README.md` form the basis of the game logic: alternating Night and Day phases, secret roles with specific objectives (Villagers vs. Werewolves), night actions (Werewolf kill, Doctor save, Seer investigation), day discussion, and voting/elimination.
*   **AI Agents:** AI players (`lib/engine/agents/*`) are the central feature. Each AI agent:
    *   Is assigned a secret game **Role** (Mafia, Villager, Seer, Doctor) determining their abilities and win condition.
    *   Is assigned or generates a **Persona** (`data.json`, `InitializationPhase.ts`) including a name, backstory, and personality traits, which should guide their dialogue and behavior.
    *   Receives a filtered view of the game state (`VisibleGameState`) relevant to their knowledge.
    *   Uses an underlying AI model (via `lib/ai/openaiService.ts` or similar) to decide on actions (`PlayerAction`) like messaging, voting, or using night abilities, based on game state, role, persona, and allowed actions for the current phase.
    *   Interacts with the game engine via a defined interface (`IAgent`).
*   **Game Engine (`lib/engine/core/Game.ts`):** A state machine that manages the game flow. It orchestrates the phases (Night, Day, Init, GameOver), manages player states (alive/dead), processes actions decided by agents, updates the game state, checks win conditions, and interacts with the persistence layer.
*   **Phases (`lib/engine/phases/*`):** Discrete stages of the game (Initialization, Day, Night, GameOver) each with specific logic for requesting actions, processing results, and transitioning to the next phase.
*   **Personas (`lib/engine/interfaces/Persona.ts`, `data.json`):** Detailed character descriptions providing background and personality traits intended to make AI interactions more engaging and less purely game-theoretic. Personas are generated during the Initialization phase.
*   **Conversation Log (`lib/engine/core/ConversationLog.ts`):** Stores all messages (system announcements, player dialogue) with associated metadata (sender, round, phase, visibility). Crucial for AI context and player understanding.
*   **State Persistence (`lib/persistence.ts`):** Saving and loading the game state (`SerializableGameState`) to allow games to be paused or potentially resumed later (currently file-based).
*   **Client-Server Interaction:** The frontend (`GameClient.tsx`) receives an initial filtered state (`FilteredGameState`) from the server (`page.tsx`). Subsequent game progression is driven by Server Actions (`src/app/actions/*`) bound on the server and passed to the client, which are invoked by the client UI or game context (`GameContext.tsx`). This minimizes client-side logic related to core game rules.
*   **Internationalization:** The use of `i18next` and dedicated dictionary files (`src/dictionaries/`) enables the UI and potentially game content/dialogue to be displayed in multiple languages.

**4. High-Level Architecture**

The application follows a modern web architecture centered around Next.js, leveraging its features for both frontend rendering and backend logic.

```mermaid
graph TD
    Client[Browser Client (React/Next.js)] -->|HTTP Request/Server Action Call| Backend
    Backend[Backend (Next.js Server Actions/API Routes)] -->|Load/Save State| Persistence
    Backend -->|Orchestrates| GameEngine
    GameEngine[Game Engine (lib/engine)] -->|Requests Action| Agents
    Agents[AI & Human Agents (lib/engine/agents)] -->|Gets State| GameEngine
    Agents -->|AI Decision Request| AIServices
    AIServices[AI Services (OpenAI, Anthropic, Groq, etc.)] -->|Response| Agents
    Agents -->|Returns Action| GameEngine
    GameEngine -->|Updates State| Backend
    Backend -->|Sends Filtered State| Client
    Persistence[Persistence (File System - game_saves)]

    style Client fill:#f9f,stroke:#333,stroke-width:2px
    style Backend fill:#ccf,stroke:#333,stroke-width:2px
    style GameEngine fill:#9cf,stroke:#333,stroke-width:2px
    style Agents fill:#ff9,stroke:#333,stroke-width:2px
    style AIServices fill:#f66,stroke:#333,stroke-width:2px
    style Persistence fill:#9c9,stroke:#333,stroke-width:2px

```

*   **Client (Browser):** Built with Next.js (App Router) and React. Uses client components (`"use client"`) like `GameClient.tsx` to manage interactive UI elements and client-side state (`GameContext.tsx`). Renders the game interface (conversation log, player list, controls) using Shadcn UI components and Tailwind CSS. Handles user input for human players via components like `HumanChatInput.tsx`. Interacts with the backend primarily through Server Actions. Uses `react-i18next` for displaying translated UI text.
*   **Backend (Next.js Server Actions / API Routes):**
    *   **Server Actions (`src/app/actions/*`):** Encapsulate core game logic calls (starting a game, advancing the game state, submitting human actions, managing games). They interact with the Persistence layer and the Game Engine. Running on the server, they have secure access to environment variables (API keys) and the file system.
    *   **API Routes (e.g., `src/app/api/speak`):** Used for specific functionalities like proxying requests to external services (e.g., ElevenLabs TTS) that might be harder to manage directly within Server Actions or require streaming responses.
*   **Game Engine (`src/lib/engine/*`):** The heart of the game logic, written in TypeScript. Contains classes for `Game`, `Player`, `Phase` implementations (Day, Night, Init, GameOver), `Role` implementations, `ConversationLog`, and interfaces defining the contracts between components (`IAgent`, `IRole`, `IGamePhase`, etc.). It is designed to be independent of the web framework.
*   **Agents (`src/lib/engine/agents/*`):** Implementations of the `IAgent` interface. Includes `HumanAgent` (defers input to the UI), `OpenAIAgent`, `ClaudeAgent`, `GeminiAgent` (using respective SDKs or APIs), and `DummyAIAgent` for testing/simple play. The `agentFactory.ts` helps instantiate the correct agent based on configuration.
*   **AI Services (External):** Third-party APIs like OpenAI, Anthropic, Google Gemini, Groq Cloud, accessed via SDKs (`package.json`) or direct HTTP requests, typically invoked by the AI Agent implementations. API keys are managed via environment variables.
*   **Persistence (`src/lib/persistence.ts`):** Responsible for saving and loading the `SerializableGameState`. Currently implemented using the Node.js file system (`fs`) to store game states as JSON files in the `game_saves` directory.
*   **Internationalization (`src/lib/i18n`, `src/dictionaries`, `scripts/generate-translations.ts`):** Uses `i18next` for managing translations. Dictionary files store key-value pairs for different languages. A script (`generate-translations.ts`) leverages AI (likely OpenAI via `openaiService.ts`) to automatically generate translations for missing keys based on the English source dictionary (`en.json`). Middleware (`src/middleware.ts`) handles routing based on language codes in the URL path.

**5. Technology Stack**

*   **Framework:** Next.js 15+ (App Router, React Server Components, Server Actions)
*   **Language:** TypeScript
*   **UI Library:** React 19+
*   **UI Components:** Shadcn UI (using Radix UI primitives)
*   **Styling:** Tailwind CSS
*   **State Management (Client):** React Context API (`GameContext.tsx`, `SpokenTextContext.tsx`)
*   **Internationalization (i18n):** `i18next`, `react-i18next`, `accept-language`, `@formatjs/intl-localematcher`
*   **AI Interaction:**
    *   Official SDKs: `openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, `groq-sdk`
    *   Custom abstraction layer (`lib/ai/openaiService.ts` likely adapted for multiple providers)
*   **Text-to-Speech (TTS):** ElevenLabs (via `elevenlabs` SDK or direct API calls in `api/speak`)
*   **Persistence:** Node.js File System (`fs`)
*   **Utility Libraries:** `clsx`, `tailwind-merge`, `date-fns`, `uuid`, `dedent`, `chalk` (for CLI/scripts), `prompts` (for CLI setup)
*   **Testing:** Vitest (`package.json`)
*   **Linting/Formatting:** ESLint (likely configured via `eslint-config-next`)

**6. Detailed Component Breakdown**

This section delves into the specific components identified in the high-level architecture.

*   **6.1 Game Engine (`src/lib/engine/*`)**
    *   **`Game` Class (`core/Game.ts`):** This is the central orchestrator.
        *   Manages the collection of `Player` objects (`#players` Map).
        *   Tracks the current game `#round` and `#currentState` (an instance of `IGamePhase`).
        *   Holds the `ConversationLog` (`#conversationLog`).
        *   Manages `AgentMemory` for each AI player (`#agentMemories` Map).
        *   Handles player state transitions (killing players via `killPlayer`).
        *   Provides methods for accessing player information (`getPlayer`, `getAlivePlayers`, `getAliveMafia`, etc.).
        *   Implements `checkWinCondition` based on alive player counts and allegiances.
        *   Orchestrates the game loop (`runGameLoop`), delegating phase execution to the `#currentState` object.
        *   Contains the `generateVisibleGameState` method, crucial for providing context-appropriate information to each agent based on their role and allegiance.
        *   Includes methods for recording game events into agent memories (`recordVoteResultsInMemory`, `recordKillInMemory`, etc.).
        *   Manages interaction with `IGameRenderer` instances via `addRenderer` and `notifyRenderers`.
        *   Handles persona generation coordination via `ensurePersonasGenerated`, calling the relevant agent methods.
        *   Provides static `loadFromState` method for game deserialization and instance `getCurrentSerializableState` for serialization, interfacing with the persistence layer.
        *   Manages `PendingHumanAction` state via `setPendingHumanAction` and `clearPendingHumanAction`.
        *   Records human player inputs (`recordHumanVote`, `recordHumanNightAction`).
    *   **`Player` Class (`core/Player.ts`):** Represents a single participant in the game.
        *   Holds `id`, `name` (mutable via `setName`), `status` (Alive/Dead), assigned `role` (`IRole`), and associated `agent` (`IAgent`).
        *   Provides methods like `isAlive`, `kill`, `getPublicRepresentation`.
        *   Delegates action decisions to its associated agent via `decideAction`.
    *   **Phases (`phases/*`):** Implement the `IGamePhase` interface.
        *   Each phase (`InitializationPhase`, `DayPhase`, `NightPhase`, `GameOverPhase`) encapsulates the specific logic for that stage.
        *   `runPhase(game: Game)`: Contains the core logic, such as requesting actions from players (via `game.requestPlayerAction`), processing results (e.g., tallying votes, resolving night kills/saves), updating game state (killing players, logging messages), and recording events in memory.
        *   `transition(game: Game)`: Determines the next phase based on the current state and returns a new instance of that phase class.
    *   **Roles (`roles/*`):** Implement the `IRole` interface.
        *   Define `name`, `allegiance`, `canPerformNightAction`, and `description`. Concrete classes like `MafiaRole`, `VillagerRole`, `DoctorRole`, `SeerRole` exist. A `roleClassMap` in `Game.ts` aids deserialization.
    *   **`ConversationLog` Class (`core/ConversationLog.ts`):** Stores `IMessage` objects chronologically. Provides methods (`addMessage`, `getMessages`, `getAllMessages`) to manage and filter the log based on criteria like round, phase, visibility, and player relevance.
    *   **Agent Memory (`interfaces/AgentMemory.ts`):** Defines the structure (`AgentMemory` interface) for storing historical game data relevant to an agent's decision-making (vote history, kill history, investigation results, message history, AI interaction logs). Includes a factory function `createInitialMemory`.

*   **6.2 AI Agents (`src/lib/engine/agents/*`, `lib/agentFactory.ts`)**
    *   **`IAgent` Interface (`interfaces/IAgent.ts`):** Defines the contract for all agents. Requires `id`, `agentName`, `persona`, `getAction`, and optional `generatePersona`.
    *   **Implementations:**
        *   `OpenAIAgent`: Interacts with OpenAI-compatible APIs (including Groq, Ollama via local endpoint, Fireworks). Uses the `openai` library. Handles API calls, JSON parsing, and error fallback. Implements `generatePersona`.
        *   `ClaudeAgent` (Placeholder/Actual): Interacts with Anthropic's API via `@anthropic-ai/sdk`. Similar logic to `OpenAIAgent` for prompts and JSON handling. Implements `generatePersona`.
        *   `GeminiAgent` (Placeholder/Actual): Interacts with Google's Gemini API via `@google/generative-ai`. Similar logic. Implements `generatePersona`.
        *   `HumanAgent`: Acts as a placeholder. Its `getAction` method returns `humanActionRequired`, signaling the game engine to defer to external human input. Does not implement `generatePersona`.
        *   `DummyAIAgent`: Provides simple, rule-based actions for testing or low-resource scenarios. Does not implement `generatePersona` (uses default or provided).
    *   **`agentFactory.ts`:** Contains `createAgentInstance`, a function that takes an `AgentConfig` (from persisted state) and a `PlayerId` and returns the corresponding initialized agent instance (`IAgent`). This decouples the `Game.loadFromState` logic from specific agent constructors.
    *   **Persona Generation:** LLM-based agents implement `generatePersona`, calling their respective AI models with a specific prompt (`getPersonaGenerationPrompt`) based on the game theme description. They store the resulting `Persona` object internally.

*   **6.3 State Management (Client & Server)**
    *   **Server:** Game state (`SerializableGameState`) is managed server-side, typically loaded and saved within Server Actions (`startGameAction`, `advanceGameStateAction`, `submitHumanAction`). The `Game` class instance likely exists only ephemerally within the scope of a single action execution.
    *   **Filtering (`lib/visibilityHelper.ts`):** The `filterGameStateForClient` function takes the full `SerializableGameState` and (optionally) the ID of the viewing player. It returns a `FilteredGameState` suitable for the client, removing sensitive data like hidden roles, full memories, and other internal details.
    *   **Client (`src/context/GameContext.tsx`):**
        *   `GameProvider` wraps the main game UI. It receives the initial `FilteredGameState` and bound Server Actions from the server component (`page.tsx`).
        *   Maintains the current `gameState` received from the server.
        *   Provides functions (`runNextTurnAction`, `submitHumanAction`) that invoke the bound Server Actions.
        *   Manages UI-related state like `isLoadingNextTurn` and `isAutoRunning`.
        *   Interacts with `SpokenTextContext` for coordinating audio playback.
    *   **Data Flow:**
        1.  Client requests game progression (e.g., clicks "Next", submits human action).
        2.  `GameContext` calls the appropriate bound Server Action.
        3.  Server Action loads the current `SerializableGameState`.
        4.  A `Game` instance is potentially rehydrated (`Game.loadFromState`).
        5.  The action is processed (e.g., human input applied, phase logic executed via `game.runGameLoop` or phase methods).
        6.  The updated `SerializableGameState` is saved.
        7.  The state is filtered using `filterGameStateForClient`.
        8.  The `FilteredGameState` (or an error) is returned to the client.
        9.  `GameContext` updates its `gameState` state variable, triggering UI re-renders.

*   **6.4 UI Components (`src/components/*`)**
    *   Built using React and Shadcn UI components (leveraging Tailwind CSS).
    *   `GameClient.tsx`: Main client wrapper, sets up providers (`GameProvider`, `SpokenTextProvider`) and renders the main layout (`GameSidebar`, `GameHeader`, `ConversationLog`, `HumanChatInput`).
    *   `GameSidebar.tsx`: Displays the game title, list of players (`PlayerCard`), distinguishing between living and dead.
    *   `GameHeader.tsx`: Shows game title, description, round/phase info, win condition, and houses the `GameController`.
    *   `ConversationLog.tsx`: Renders the list of `ClientMessage` objects using `MessageBubble`, handling scrolling and filtering based on visibility (e.g., Mafia chat).
    *   `MessageBubble.tsx`: Renders a single message with sender info, styling based on sender type (Human, AI, System), and integrates with `SpeakText` for AI messages.
    *   `HumanChatInput.tsx`: Provides the input interface for human players based on the `pendingHumanAction` state (text input for messages, target selection for votes/night actions). Calls `submitHumanAction` from `GameContext`.
    *   `PlayerCard.tsx`: Displays a single player's public info (name, status, avatar).
    *   `StartGameForm.tsx`: Handles new game configuration (player count, AI models via `ProviderModelSelector`, themes via `GameThemeSelector`, language via `LanguageSelector`, human player joining). Uses the `useGameConfig` hook and calls the `startGameAction` Server Action.
    *   `SpeakText.tsx`: Handles TTS playback for individual messages, coordinating through `SpokenTextContext`.
    *   `ProviderModelSelector.tsx`, `GameThemeSelector.tsx`, `LanguageSelector.tsx`: Reusable form components for selecting configuration options.

*   **6.5 Persistence Layer (`src/lib/persistence.ts`)**
    *   Currently uses the Node.js `fs` module for file system storage.
    *   Saves game state as JSON files in the `game_saves` directory.
    *   File naming convention: `${gameId}.json`.
    *   Provides asynchronous functions: `loadGameData`, `saveGameData`, `deleteGameData`, `listSavedGames`.
    *   Includes basic directory creation (`ensureSaveDir`) and path sanitization (`getFilePath`).
    *   **Note:** The current implementation requires careful handling of complex types like `Date`, `Map`, and `Set` during JSON serialization/deserialization if they exist within the `SerializableGameState` (e.g., in `AgentMemory`). The current code lacks explicit reviver/replacer functions.

**7. Data Models (`src/lib/interfaces/*`)**

*   **`SerializableGameState` (`persistence.types.ts`):** The canonical, complete game state stored persistently. Contains all roles, full agent memories, etc.
*   **`FilteredGameState` (`gameState.types.ts`):** The view of the game state sent to the client. Omits hidden roles (except potentially the player's own), full agent memories, and other sensitive internal data. Includes UI-relevant fields like `themeTitle`, `themeDescription`.
*   **`SerializablePlayer` (`persistence.types.ts`):** Player data stored in `SerializableGameState`. Includes `roleName`, `allegiance`, `agentConfig`.
*   **`FilteredPlayer` (`gameState.types.ts`):** Player data sent to the client. Based on `PublicPlayerInfo` but may include own role, `imageUrl`, `voiceId`, `isHuman`.
*   **`ClientMessage` (`gameState.types.ts`):** Message structure used in `FilteredGameState`, derived from `IMessage` but with ISO date strings.
*   **`AgentConfig` (`persistence.types.ts`, `agent.types.ts`):** Defines the configuration needed to recreate an agent (`agentType`, `modelName`, `providerValue`).
*   **`Persona` (`engine/interfaces/Persona.ts`):** Structure for character details (`name`, `backstory`, `personalityTraits`).
*   **`AgentMemory` (`engine/interfaces/AgentMemory.ts`):** Structure holding historical game data for AI decision-making. Includes `aiConversationLogs` for debugging/analysis.
*   **`PendingHumanAction` (`actions.types.ts`):** Defines the structure indicating required human input.
*   **`PlayerAction` (`engine/interfaces/IAgent.ts`):** Union type defining all possible actions an agent (AI or Human via input) can take.

**8. Internationalization (i18n) System**

*   **Libraries:** `i18next`, `react-i18next`.
*   **Configuration (`lib/i18n/settings.ts`):** Defines supported languages (`supportedLanguagesInfo`, `languages`), fallback language (`fallbackLng`), and default namespace (`defaultNS`). Provides utility functions for mapping language codes/names.
*   **Dictionaries (`src/dictionaries/*.json`):** JSON files containing key-value translation strings for each supported language. The filename corresponds to the language code (e.g., `es.json`).
*   **Client Setup (`lib/i18n/i18n.client.ts`):** Initializes `i18next` for client-side usage, importing all dictionary files directly into the bundle. Uses `initReactI18next`.
*   **Usage:** Components use the `useTranslation` hook from `react-i18next` to access the `t` function for translating keys.
*   **Routing (`src/middleware.ts`):** Next.js middleware ensures that URLs contain a supported language code prefix (e.g., `/en/game/...`, `/es/game/...`). It redirects requests lacking a locale prefix to the fallback language (`en`). Static asset paths are ignored.
*   **Translation Generation (`scripts/generate-translations.ts`):**
    *   A Node.js script using `tsx`.
    *   Loads the source English dictionary (`en.json`).
    *   Compares it with target language dictionaries.
    *   Identifies missing or obsolete keys.
    *   Uses an AI model (configured via `openaiService.ts`, likely adaptable) to translate missing English values into target languages based on a structured prompt (`getPrompt` function).
    *   Saves the updated/newly translated dictionary files.
    *   Can be run for all languages or a specific language via CLI flags (`--lang=es`).

**9. API / External Services**

*   **AI Models:** The system interacts with various large language models (LLMs) via their respective APIs/SDKs.
    *   Communication is abstracted through agent implementations (`OpenAIAgent`, `ClaudeAgent`, etc.).
    *   `lib/ai/openaiService.ts` provides a core function (`getAIResponse`) likely used as a base or template for interacting with OpenAI-compatible endpoints (OpenAI, Groq, Ollama, Fireworks).
    *   Configuration (model selection, provider endpoint) is managed partly through `useGameConfig`, `StartGameForm`, and stored in `AgentConfig`.
    *   API keys are securely managed using environment variables (`.env`).
*   **Text-to-Speech (TTS):**
    *   Utilizes ElevenLabs for generating audio for AI messages.
    *   An API route (`src/app/api/speak/route.ts`) acts as a proxy to the ElevenLabs API. This prevents exposing the API key directly to the client.
    *   The client-side `SpeakText.tsx` component likely calls this API route to fetch audio streams or pre-generated audio URLs. *(Self-correction: The current `api/speak` route fetches and streams audio directly; `generateAndSaveAudio` in `elevenlabsService.ts` seems unused or intended for a different workflow)*.
    *   The `SpokenTextContext.tsx` coordinates playback, ensuring only one audio clip plays at a time.
Okay, here is the third and final page of the detailed design document for the Werewolf AI project, covering game flow, persistence, error handling, testing, and potential future enhancements.

**10. Game Flow Logic**

The game progresses through a defined sequence of phases, managed by the `Game` class and implemented by specific `IGamePhase` classes. The core loop continues until a win condition is met.

1.  **Initialization (`InitializationPhase`)**:
    *   Triggered once at the start of a new game (either via `startGameAction` or implicitly when `Game` is constructed with player setups).
    *   Assigns roles (if not pre-assigned).
    *   Coordinates persona generation for AI agents by calling `agent.generatePersona` (`Game.ensurePersonasGenerated`). Waits for completion.
    *   Updates player names based on generated personas (`Player.setName`).
    *   Logs initial player list and game setup messages.
    *   Sets up initial agent memories.
    *   Transitions to the first `DayPhase`.

2.  **Day Phase (`DayPhase`)**:
    *   **Round Increment:** If transitioning from `NightPhase`, the game round counter is incremented.
    *   **Start Message:** Logs a message indicating the start of the day.
    *   **Round 1 Introductions (Conditional):** If `game.round === 1`, prompts each player (via `game.requestPlayerAction` with allowed action `message`) to introduce themselves. Logs introductions publicly.
    *   **General Discussion (Round 2+):** Prompts each alive player (via `game.requestPlayerAction` with allowed action `message`) to speak. Logs messages publicly.
    *   **Voting:**
        *   Logs a message indicating the start of the voting period.
        *   Prompts each alive player (via `game.requestPlayerAction` with allowed action `vote`) to vote for elimination (or abstain via `targetPlayerId: null`).
        *   Logs individual votes publicly (or abstentions).
        *   Collects votes (including human votes recorded via `submitHumanAction` -> `game.recordHumanVote`).
    *   **Vote Tally & Execution:**
        *   Calculates vote counts for each targeted player.
        *   Determines the player(s) with the maximum votes.
        *   Checks if the maximum votes meet the majority threshold (floor(alive_players / 2) + 1).
        *   If a single player has a majority, that player is executed (`game.killPlayer`). A log message announces the execution.
        *   If there's a tie for the maximum votes OR no player reaches the majority threshold, no one is executed. A log message announces the outcome (tie or no majority).
        *   Logs detailed vote results (who voted for whom).
        *   Records the vote outcome in agent memories (`game.recordVoteResultsInMemory`).
        *   Notifies renderers (`renderVoteResults`).
    *   **Transition:** Transitions to `NightPhase`.

3.  **Night Phase (`NightPhase`)**:
    *   **Start Message:** Logs a message indicating the start of the night.
    *   **Mafia Actions:**
        *   **Discussion (Optional):** If alive Mafia exist, they are prompted for `message` actions, logged with `MessageVisibility.Mafia`.
        *   **Kill Vote:** Each alive Mafia member is prompted (via `game.requestPlayerAction` with allowed action `mafiaKill`) to vote for a target player to kill. Invalid votes (e.g., targeting Mafia) are ignored or logged privately. Votes are collected.
    *   **Other Role Actions:** Players with night action roles (Doctor, Seer) are prompted (via `game.requestPlayerAction` with role-specific allowed actions like `doctorSave`, `seerInvestigate`). Their intended actions are collected.
    *   **Action Resolution (Order matters):**
        1.  **Doctor Save:** The Doctor's chosen save target (`doctorSaveTarget`) is determined. Recorded in Doctor's memory (`game.recordDoctorSaveInMemory`).
        2.  **Mafia Kill:** Mafia kill votes are tallied. A single `finalMafiaKillTarget` is determined (handling ties, e.g., first to reach max).
        3.  **Kill Application:** If `finalMafiaKillTarget` exists and is *not* the `doctorSaveTarget`, the target player is killed (`game.killPlayer`). The `killedPlayerId` is recorded. If saved, the kill is prevented (`killedPlayerId` is null).
        4.  **Seer Investigation:** If the Seer chose a valid target (`seerInvestigationTarget`), the target's allegiance is determined from their role. The result is recorded *only* in the Seer's memory (`game.recordSeerResultInMemory`). A generic private message might be logged for the Seer.
    *   **Result Announcement:**
        *   A generic "Dawn breaks" message is logged publicly.
        *   If a kill occurred and wasn't saved, `game.killPlayer` handles the public announcement.
        *   If a kill was attempted but saved, a specific message is logged publicly.
        *   If no kill was attempted or the kill failed for other reasons (e.g., no valid targets, Mafia didn't vote), a "night passed peacefully" message is logged.
    *   **Memory Update:** The overall night kill result (`killedPlayerId`, possibly null) is recorded in all agent memories (`game.recordKillInMemory`).
    *   **Render Notification:** Notifies renderers of the night outcome (`renderNightResults`).
    *   **Transition:** Transitions to `DayPhase`.

4.  **Game Over Phase (`GameOverPhase`)**:
    *   Entered when `game.checkWinCondition` returns a winner ('Mafia' or 'Town') after a phase completes.
    *   Logs the game over message, indicating the winning team.
    *   Constructs a final, public game state (`createPublicFinalState`) revealing all roles and allegiances.
    *   Notifies renderers with the final state and winner (`renderGameOver`).
    *   **Transition:** Does not transition; remains in the GameOver state.

*   **Human Interaction:** When `game.requestPlayerAction` is called for a `HumanAgent`, it returns `{ type: 'humanActionRequired', pendingAction }`. The `Game` engine sets this `pendingAction` state. The `advanceGameStateAction` server action detects this and returns the current `FilteredGameState` (including `pendingHumanAction`) to the client without advancing further. The client UI (`HumanChatInput`) displays the appropriate input based on `pendingAction`. When the human submits their action, the `submitHumanAction` server action is called. This action loads the state, verifies the pending action, applies the human's input (using `game.recordHumanVote` or `game.recordHumanNightAction`), clears the pending action (`game.clearPendingHumanAction`), saves the intermediate state, and then calls `advanceGameStateAction` again to continue the game flow from where it was paused.

**11. Persistence Strategy**

*   **Current Implementation (`lib/persistence.ts`):**
    *   Uses the local file system via Node.js `fs` module.
    *   Stores each game state as a separate JSON file in the `game_saves` directory.
    *   Filename pattern: `${gameId}.json`.
    *   Provides basic Load, Save, Delete, and List operations.
*   **Serialization Format:** `SerializableGameState` interface (`interfaces/persistence.types.ts`) defines the structure.
*   **Challenges/Considerations:**
    *   **Complex Types:** Standard `JSON.stringify`/`parse` does not handle `Date`, `Map`, or `Set` objects correctly. Dates become strings, Maps become objects, Sets become arrays. This requires custom replacer/reviver functions or manual conversion during save/load if these types are present in critical parts of the state (e.g., `AgentMemory`'s `voteHistory` which uses `Map`). The current implementation lacks explicit handling for this.
    *   **Scalability:** File system storage is simple but doesn't scale well for many concurrent games or large state objects. Performance can degrade.
    *   **Concurrency:** No explicit locking mechanism is present. Concurrent writes to the same file could lead to data corruption, although the Server Action model might mitigate this in practice for single-player focus.
    *   **Data Integrity:** Basic JSON format offers no schema validation or checks against corruption beyond basic parsing.
*   **Potential Improvements:**
    *   **Database:** Replace file system storage with a database (e.g., PostgreSQL, MongoDB, Redis KV like Vercel KV `package.json`). This improves scalability, concurrency handling, and querying capabilities. Redis KV (`@vercel/kv`) seems to be included as a dependency, suggesting a potential future direction or alternative implementation path.
    *   **Serialization Libraries:** Use libraries like `superjson` to handle complex types automatically during serialization/deserialization.
    *   **Schema Validation:** Implement validation (e.g., using Zod) during load to ensure data integrity.
    *   **Transactional Saves:** Ensure saves are atomic, especially if moving to a database.

**12. Error Handling**

*   **Game Engine:** Core engine classes should throw specific errors for invalid states or operations (e.g., attempting action on dead player, invalid role assignment).
*   **Agent Interactions:** `IAgent.getAction` implementations should handle errors from external AI API calls gracefully (e.g., network errors, rate limits, API key issues, invalid responses). They should log errors and return a default safe action (`{ type: 'noAction' }`). Errors should also be recorded in the `AIConversationLog` within `AgentMemory`. `generatePersona` should handle errors similarly, falling back to `DEFAULT_PERSONA`.
*   **Server Actions (`src/app/actions/*`):**
    *   Wrap core logic (loading state, running game phases, saving state) in `try...catch` blocks.
    *   Catch errors from the game engine, persistence layer, or agent interactions.
    *   Log errors server-side for debugging.
    *   Return a structured error response (e.g., `{ error: string }`) to the client instead of throwing unhandled exceptions.
*   **Client (`GameContext.tsx`, UI Components):**
    *   Check the result returned from Server Actions.
    *   If an `{ error: string }` object is received, display an appropriate error message to the user (e.g., using an alert, toast, or dedicated error display area).
    *   Manage loading states (`isLoadingNextTurn`, `isSubmitting`) to provide user feedback and prevent concurrent actions.
*   **Persistence (`lib/persistence.ts`):** Functions handle file system errors (e.g., `ENOENT` for file not found) and re-throw other errors wrapped in a more specific context message.
*   **API Routes (`api/speak/route.ts`):** Include `try...catch` blocks, validate input, handle errors from external API calls (e.g., ElevenLabs), and return appropriate HTTP status codes (400, 429, 500, 503). Check for necessary API keys before making calls.

**13. Testing Strategy**

*   **Framework:** Vitest (`vitest.config.mts`, `package.json`). Utilizes `vite-tsconfig-paths` for module resolution and `@vitejs/plugin-react` potentially for component testing. `jsdom` is configured as the environment.
*   **Unit Tests:** Focus on individual components and modules in isolation.
    *   **Game Engine Core (`src/lib/engine/tests/core/*`):** Test classes like `Game` (state transitions, player management, win conditions), `Player`, `ConversationLog`, `Message`. Mock dependencies like roles and agents.
    *   **Roles (`src/lib/engine/tests/roles/*` - *Implied*):** Verify properties (`name`, `allegiance`, etc.) for each role implementation.
    *   **Phases (`src/lib/engine/tests/phases/*`):** Test the logic within each phase (`runPhase`, `transition`). Mock the `Game` instance and its methods extensively to control the environment and assert interactions.
    *   **Agents (`src/lib/engine/tests/agents/*`):** Test agent logic. Mock external AI API calls (`openai`, `@anthropic-ai/sdk`, etc.) to simulate responses (valid JSON, invalid JSON, errors) and assert that the agent returns the correct `PlayerAction` or handles errors. Test `generatePersona` logic similarly.
    *   **Utilities (`src/lib/utils/tests/*` - *Implied*):** Test utility functions like those in `stringUtils.ts`, `imageUtils.ts`, `core/utils.ts`.
    *   **Persistence (`src/lib/persistence.test.ts` - *Implied*):** Test `loadGameData`, `saveGameData`, etc. Mock the `fs` module to avoid actual file system operations during tests.
*   **Server Action Tests (`src/app/actions/tests/*`):**
    *   Test the server actions (`advanceGameStateAction`, `submitHumanAction`, `startGameAction`, `deleteGameAction`).
    *   Mock the `Game` class, persistence functions (`loadGameData`, `saveGameData`), and potentially `filterGameStateForClient`.
    *   Assert that the actions call the correct underlying functions with expected arguments and return the appropriate `FilteredGameState` or error structure.
    *   Use `vi.mock` extensively.
*   **Integration Tests (Potential):** Test the interaction between different parts of the system, e.g., how an agent's action processed by a phase affects the game state and subsequent agent views. Could involve running partial game loops with mocked components.
*   **End-to-End Tests (Potential):** Use tools like Playwright or Cypress to simulate user interaction in a browser, verifying the full flow from UI interaction to backend processing and UI updates.

**14. Future Enhancements**

*   **More Roles:** Implement additional classic Werewolf roles (e.g., Bodyguard, Hunter, Witch, Cursed).
*   **More Themes:** Add diverse themes with associated persona generation adjustments (`src/lib/engine/interfaces/Theme.ts`).
*   **Improved AI:**
    *   Enhance strategic reasoning (beyond basic role execution).
    *   Improve persona consistency and depth in dialogue and actions.
    *   Implement more sophisticated memory usage and recall.
    *   Explore different AI model providers and fine-tuning.
*   **Multiplayer:** Allow multiple human players to join a game alongside AI. This would require significant changes to state management, UI, and potentially websockets for real-time updates.
*   **Advanced Persistence:** Migrate from file system to a database (e.g., Redis KV, PostgreSQL) for better scalability and management. Implement robust serialization/deserialization.
*   **Spectator Mode:** Allow users to watch ongoing AI vs. AI games without participating.
*   **Enhanced UI/UX:** Improve visual design, add animations, provide clearer feedback during actions, visualize voting/targeting.
*   **TTS Enhancements:** Allow voice selection, potentially use cheaper/faster TTS options where full ElevenLabs quality isn't needed. Improve audio queue management.
*   **Configuration Flexibility:** Allow users more control over role distribution, game timers, and AI model selection per role/allegiance via the UI (`StartGameForm.tsx`).
*   **Accessibility:** Improve ARIA attributes and keyboard navigation.
*   **Error Reporting:** Implement more robust client-side error reporting (e.g., Sentry).

**15. Conclusion**

The Werewolf AI project presents a well-structured approach to simulating the classic social deduction game using AI agents. Leveraging Next.js for both frontend and backend, TypeScript for type safety, and a modular game engine, it provides a solid foundation. Key strengths include the persona-driven AI concept, flexible agent integration, a robust i18n system, and the use of Server Actions for state management. Current challenges lie primarily in the file-based persistence limitations and the need for ongoing refinement of AI agent behavior and strategic depth. The design allows for significant future expansion, promising an increasingly engaging and complex single-player Werewolf experience.

