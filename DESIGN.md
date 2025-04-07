# Werewolf AI Game - Design Document (v2 - App Router & Persistence)

## 1. Overview

This document outlines the design for a web-based Werewolf game played entirely by AI agents. The application will be built using the **Next.js App Router**, manage game state primarily **in-memory** with **JSON file persistence**, and utilize an **OpenAI-compatible API** (via the `openai` SDK) for AI agent interactions. The user interface will allow users to start new games, view a list of active/past games, and observe the gameplay of a selected game.

## 2. Goals

*   Create a functional Werewolf game simulation driven by AI agents using Next.js App Router features.
*   Implement core game logic: roles, phases, actions, discussion, voting, elimination.
*   Manage state for **multiple concurrent games**, identified by unique IDs.
*   Use in-memory storage for active game states for performance.
*   Persist game states to **JSON files** on disk (`data/games/{gameId}.json`) to allow resuming or reviewing games after server restarts.
*   Integrate robustly with an OpenAI-compatible API using the `openai` SDK, including **retry logic**.
*   Provide a web interface for users to initiate, list, and observe games.
*   Ensure strict information control based on roles using backend logic.
*   Utilize **TypeScript** effectively for type safety and clarity.
*   Build an extensible foundation for future features (voice, more roles, etc.).

## 3. Architecture (Next.js App Router)

The application leverages the Next.js App Router paradigm:

*   **UI Components (`app/`):** Primarily React Server Components (RSCs) for rendering the UI based on fetched game data. Client Components (`"use client"`) will be used for interactivity (e.g., forms, real-time updates if using polling/WebSockets later).
*   **Server Actions (`app/actions.ts` or similar):** Asynchronous functions executed on the server, triggered by client interactions (e.g., starting a game, submitting a vote conceptually, though AI handles this internally). They contain the core backend logic for mutating game state and interacting with the AI service.
*   **Game Logic (`lib/game/`):** Modules containing pure functions and classes for game rules, state transitions, player management, role definitions, etc. Kept separate from Next.js-specific features.
*   **AI Interaction Service (`lib/ai/`):** Module dedicated to communicating with the OpenAI-compatible API using the `openai` SDK. Handles prompt construction, API calls with retries, and response parsing.
*   **State Management (`lib/state/`):** Service responsible for managing the in-memory cache of `GameState` objects (e.g., using a `Map<string, GameState>`) and handling the asynchronous reading/writing of game states to JSON files.
*   **Data Persistence (`data/games/`):** Directory where individual game states are stored as JSON files (e.g., `data/games/game-abc-123.json`).

**Moderator:** The "Moderator" is not an AI agent or entity but rather the **server-side logic** implemented within the Game Logic modules and orchestrated by Server Actions. It dictates the game flow, announces events, enforces rules, and prompts AI agents.

## 4. Core Components

### 4.1. Game State Manager (`lib/state/gameStateManager.ts`)

*   **Responsibilities:**
    *   Maintain an in-memory cache (e.g., `Map<string, GameState>`) of active game states, keyed by `gameId`.
    *   Provide functions to `getGameState(gameId)`, `updateGameState(gameId, newState)`, `createGame(initialState)`.
    *   Load a game state from its corresponding JSON file (`data/games/{gameId}.json`) into memory if not already cached.
    *   Asynchronously write the updated `GameState` to its JSON file after modifications. This provides persistence.
    *   Handle potential race conditions during file I/O if necessary (e.g., using a simple locking mechanism per game ID or queuing writes).
    *   Provide a function to list available game IDs (e.g., by scanning the `data/games/` directory).
*   **Persistence:** Uses Node.js `fs/promises` API for reading/writing JSON files. Each game state is saved independently.

### 4.2. Game Engine (`lib/game/engine.ts`)

*   **Responsibilities:**
    *   Contains the core deterministic logic for running the game.
    *   Functions to initialize a new game state (assign roles, create players with personas based on presets).
    *   Functions to process phase transitions (Night -> Day -> Night).
    *   Functions to apply night actions (determine kills considering protection).
    *   Functions to manage discussion turns (determining who speaks next).
    *   Functions to process votes and determine elimination.
    *   Functions to check win conditions.
    *   **Crucially, this engine *orchestrates* the flow but relies on the `AI Agent Service` to get decisions/dialogue from AI players.** It dictates *when* an AI needs to act.
    *   Generates "Moderator" messages to be added to the conversation log.

### 4.3. AI Agent Service (`lib/ai/openaiService.ts`)

*   **Responsibilities:**
    *   Initialize and configure the `openai` SDK client (using environment variables for API key, base URL).
    *   Provide functions like `getAgentAction(prompt: OpenAI.Chat.ChatCompletionMessageParam[], gameId: string, playerId: string): Promise<string>` or `getAgentDialogue(...)`.
    *   Construct detailed prompts (`ChatCompletionMessageParam[]`) based on:
        *   Agent's persona, role, and current status.
        *   Current `GameState` (phase, round, living players).
        *   Filtered conversation history relevant to the agent's role and the current context (e.g., only werewolf chat during night discussions for werewolves, general chat for day discussions).
        *   Specific instructions for the required output (e.g., "Choose a player to eliminate. Respond only with the player's name.", "Share your thoughts and suspicions.").
    *   Utilize the `openai.chat.completions.create()` method.
    *   Implement **retry logic** for API calls (e.g., using `async-retry` or a custom loop with exponential backoff) to handle transient network errors or rate limits.
    *   Parse responses, potentially validating or cleaning the output. Handle cases where the AI refuses or fails to provide a valid response after retries.

### 4.4. Frontend UI (`app/`)

*   **Structure:**
    *   `app/page.tsx`: List of available games, button to start a new game. (Server Component)
    *   `app/game/[gameId]/page.tsx`: Main game view page. (Server Component, fetches initial state).
    *   `app/game/[gameId]/GameDisplay.tsx`: Client Component (`"use client"`) responsible for rendering the fetched game state (players, chat, phase) and potentially handling automatic refresh/polling if needed, though ideally updates are driven by Server Actions revalidating data.
    *   `app/components/`: Reusable UI components (e.g., `PlayerList`, `ChatLog`).
*   **Interactivity:**
    *   Starting a game: A form calls a Server Action (`startGameAction`).
    *   Observing: The `GameDisplay` component might periodically fetch updates or rely on `revalidatePath`/`revalidateTag` called by Server Actions that progress the game state.

### 4.5. Server Actions (`app/actions.ts`)

*   **`startGameAction(formData: FormData): Promise<{ gameId: string }>`:**
    *   Reads game configuration (e.g., number of players) from `formData`.
    *   Calls `GameEngine` to initialize a `GameState`.
    *   Calls `GameStateManager` to create/persist the new game.
    *   Initiates the first game step (e.g., starts the Night phase logic).
    *   Returns the new `gameId`. Redirects the user to `/game/{gameId}`.
*   **`runGameTurnAction(gameId: string): Promise<void>`:** (This might be triggered internally or scheduled)
    *   Loads the current `GameState` via `GameStateManager`.
    *   Determines the current required action based on `GameState` (e.g., night actions, next speaker, voting).
    *   Calls `AI Agent Service` to get decisions/dialogue from relevant AI player(s).
    *   Uses `GameEngine` to process the AI responses, update the `GameState` (e.g., add chat messages, store actions/votes, change phase).
    *   Saves the updated `GameState` via `GameStateManager`.
    *   Calls `revalidatePath('/game/[gameId]')` to trigger UI updates on the client.
    *   Recursively triggers the next step or schedules itself if the game loop is automated.
*   **`getFilteredGameStateAction(gameId: string): Promise<FilteredGameState>`:**
    *   Loads the full `GameState`.
    *   Filters the state (e.g., removes internal logs, simplifies structures) before sending it to the client for display. Prevents leaking sensitive information.

## 5. Game Flow Example (Using App Router)

1.  **User:** Navigates to `/`, sees a "Start New Game" button/form.
2.  **User:** Clicks "Start New Game".
3.  **Frontend:** The form submits to the `startGameAction` Server Action.
4.  **Backend (`startGameAction`):**
    *   Generates `gameId`.
    *   Initializes `GameState` using `GameEngine`.
    *   Saves initial state using `GameStateManager` (in-memory + writes `data/games/{gameId}.json`).
    *   **(Optional/Alternative):** Instead of running the game turn here, it might just set up the game. A separate mechanism (e.g., a background job, or the client polling an action) could drive turns. For simplicity, let's assume `startGameAction` kicks off the first turn or schedules it.
    *   Potentially calls `runGameTurnAction(gameId)` or schedules it.
    *   Redirects the user to `/game/{gameId}`.
5.  **User:** Lands on `/game/{gameId}`.
6.  **Backend (`/game/[gameId]/page.tsx` RSC):**
    *   Calls `getFilteredGameStateAction(gameId)` to fetch the initial state.
    *   Renders the initial UI (player list, empty chat, Night 1).
7.  **Backend (`runGameTurnAction` - executing Night 1):**
    *   Loads state.
    *   Determines night actions are needed.
    *   Calls `AI Agent Service` for Werewolves, Seer, Doctor prompts. Gets responses.
    *   Updates `GameState` with actions using `GameEngine`.
    *   Advances phase to Day 1 using `GameEngine`. Calculates kills. Adds Moderator messages.
    *   Saves updated state using `GameStateManager`.
    *   Calls `revalidatePath('/game/[gameId]')`.
8.  **Frontend:** Next.js re-renders the `app/game/[gameId]/page.tsx` RSC due to revalidation. The client receives the updated HTML reflecting Day 1, night results, etc.
9.  **Backend (`runGameTurnAction` - executing Day 1 Discussion):**
    *   Loads state. Determines player 1 needs to speak.
    *   Calls `AI Agent Service` for player 1's dialogue.
    *   Updates `GameState` with the message. Saves state. Revalidates path.
10. **Frontend:** UI updates with the new message.
11. **Loop:** `runGameTurnAction` continues to be triggered (how it's triggered depends on implementation - could be recursive calls with delays, a simple loop on the server if request timeout isn't an issue for short turns, or a more robust background job queue) processing turns, voting, elimination, checking win conditions, saving state, and revalidating the path until `GameState.phase` becomes `GameOver`.

## 6. Data Structures (Refined TypeScript)

```typescript
import { type ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// Using string literals instead of enums
export type Role = 'Villager' | 'Werewolf' | 'Seer' | 'Doctor';

// Moderator is not a role, but a concept for messages

export type GamePhase = 'Night' | 'Day' | 'Voting' | 'GameOver';

export type PlayerStatus = 'alive' | 'dead';

export interface Player {
  readonly id: string; // e.g., uuid
  readonly name: string;
  readonly role: Role;
  readonly persona: string; // Detailed description for AI
  status: PlayerStatus;
  imageUrl?: string; // Optional: URL for character image
}

// Discriminated union for message audience clarity
export type MessageAudience =
  | { type: 'all' }
  | { type: 'werewolves' }
  | { type: 'player'; playerId: string }; // For Seer results, private messages?

export interface ChatMessage {
  readonly messageId: string; // e.g., uuid
  readonly gameId: string;
  readonly speaker: { type: 'player'; playerId: string } | { type: 'moderator' };
  readonly speakerName: string; // Denormalized name for display
  readonly content: string;
  readonly timestamp: number; // ISO 8601 string or number
  readonly round: number;
  readonly phase: GamePhase;
  readonly audience: MessageAudience;
  readonly turnNumber?: number; // Optional: Track speaking order within a round
}

// More specific night action types
export type NightAction =
  | { type: 'werewolf_kill'; actingPlayerId: string; targetPlayerId: string }
  | { type: 'doctor_save'; actingPlayerId: string; targetPlayerId: string }
  | { type: 'seer_investigation'; actingPlayerId: string; targetPlayerId: string; result: 'Werewolf' | 'Villager' }; // Use subset of Role

export interface Vote {
 voterPlayerId: string;
 targetPlayerId: string;
}

export interface GameSettings {
 readonly numPlayers: number; // Maybe derive from roles?
 readonly roleDistribution: Readonly<Record<Role, number>>;
 readonly discussionRoundsPerPlayer: number;
 readonly aiModel: string; // e.g., 'gpt-4o'
}

export interface GameState {
  readonly gameId: string;
  readonly createdAt: number;
  readonly settings: GameSettings;
  players: Readonly<Record<string, Player>>; // Map Player ID to Player object
  livingPlayerIds: string[]; // Maintain order for turns
  phase: GamePhase;
  round: number;
  turnOrderIndex: number; // Index into livingPlayerIds for current turn
  // Store history as map for potential easier lookup? Or keep array? Array likely simpler.
  conversationLog: ReadonlyArray<ChatMessage>;
  // Store actions per round/phase?
  nightActions: ReadonlyArray<NightAction>;
  votes: ReadonlyArray<Vote>; // Votes cast in the current voting phase
  lastEliminatedPlayerId?: string;
  winner?: 'Villager' | 'Werewolf'; // Team name (subset of Role)
  // Internal state not sent to client
  _internalState?: {
    // e.g., detailed AI prompts, private werewolf discussions if separated
    werewolfChatLog?: ReadonlyArray<ChatMessage>;
    seerResults?: Record<string, 'Werewolf' | 'Villager'>; // seerId -> targetId -> result (subset of Role)
  }
}

// Subset of GameState safe to send to the client
export type FilteredGameState = Omit<GameState, '_internalState'> & {
  // Customize further if needed, e.g., anonymize roles of living players
  conversationLog: ReadonlyArray<Omit<ChatMessage, 'audience'>>; // Simplified audience
  players: Readonly<Record<string, Omit<Player, 'role'>>>; // Hide roles of living players
};


// Example Character Preset Structure
export interface CharacterPreset {
  readonly name: string;
  readonly persona: string;
  // Optional: suggested role affinity?
}

export const characterPresets: ReadonlyArray<CharacterPreset> = [
  { name: "Old Man Hemlock", persona: "A grumpy, deeply suspicious old villager. Quick to accuse but slow to trust. Believes actions speak louder than words." },
  { name: "Lilith Shadowclaw", persona: "A charming but manipulative individual. Enjoys sowing chaos and discord subtly. Very persuasive. Secretly delights in the hunt (if Werewolf)." },
  { name: "Astrid Brightmind", persona: "Logical, observant, and speaks precisely. Focused on gathering evidence and uncovering the truth. Values reason above emotion (if Seer)." },
  { name: "Dr. Alistair Finch", persona: "A kind and protective soul. Feels a deep responsibility to keep everyone safe. Often torn when making decisions (if Doctor)." },
  // ... more characters
];

// Type for AI Interaction function
export type GetAIResponseFunction = (
  messages: ChatCompletionMessageParam[],
  gameId: string,
  playerId: string,
  settings: { model: string; temperature?: number; max_tokens?: number }
) => Promise<string>; // Returns the AI's text response

```

## 7. Server Actions & Data Flow

*   **Client -> Server Action:** User interactions (like starting a game) trigger Server Actions via forms (`<form action={serverAction}>`).
*   **Server Action -> Game Logic:** Actions call functions in `lib/game/` and `lib/state/` to update the game state.
*   **Server Action -> AI Service:** Actions call `lib/ai/openaiService.ts` when AI input is needed.
*   **AI Service -> OpenAI API:** The service makes calls to the external API using the `openai` SDK.
*   **Server Action -> State Manager:** Actions save the updated state using `lib/state/gameStateManager.ts` (in-memory cache + JSON write).
*   **Server Action -> Revalidation:** Actions call `revalidatePath` or `revalidateTag` to invalidate the Next.js cache for the relevant game page(s).
*   **Next.js -> Client:** Next.js detects the invalidated data and re-renders the necessary Server Components (`app/game/[gameId]/page.tsx`). The updated HTML is sent to the client.

## 8. Future Enhancements

*   **WebSocket Integration:** For true real-time updates instead of relying solely on revalidation (which involves client-side fetching after invalidation). Use libraries like `socket.io` or `ws`.
*   **Database Persistence:** Replace JSON file storage with a database (e.g., PostgreSQL with Prisma, MongoDB) for better querying, scalability, and transactional integrity.
*   **ElevenLabs Integration:** Add voice synthesis in a separate service, potentially triggered after a text message is generated. Frontend plays the audio.
*   **Configurable Models/Providers:** Allow selecting different AI models or even different providers (Anthropic, Gemini) via configuration.
*   **More Roles & Complexity:** Implement advanced roles (Witch, Hunter, Cult Leader) and game mechanics.
*   **User as Player:** Integrate human player participation.
*   **Improved AI Reasoning:** Implement more sophisticated prompting, perhaps with techniques like ReAct (Reasoning + Acting) or providing structured tool-use capabilities to the AI.
*   **Background Job Queue:** For long-running game turns or managing many concurrent games reliably, use a job queue (e.g., BullMQ, Celery).
*   **UI/UX Polish:** Animations, better visual indicators, vote visualization, game history browser.

## 9. Risks and Challenges

*   **AI Reliability:** Ensuring consistent, in-character, rule-following responses requires robust prompt engineering and handling AI refusals/errors gracefully (retries help but aren't foolproof).
*   **State Consistency:** While simpler than multi-user concurrent edits, ensuring the single-threaded game loop correctly updates and saves state without corruption is key. File locking or queuing in the `GameStateManager` might be needed under high load if actions overlap unexpectedly.
*   **Prompt Injection:** A significant risk if AI agents can influence the prompts of other agents or the moderator logic through their dialogue. Careful input sanitization and structuring prompts defensively is necessary.
*   **API Costs & Rate Limits:** Monitor usage closely. Implement caching where possible (though difficult with dynamic game state). Consider less powerful/cheaper models for certain actions if feasible.
*   **Scalability (In-Memory/File):** The current approach limits the number of *active* games by server memory and *total* games by disk space/inode limits. File I/O can become a bottleneck.
*   **Information Control:** Rigorously filtering game state and conversation history before constructing AI prompts and sending data to the client (`FilteredGameState`) is critical for game integrity.

## 10. Implementation Plan

This plan outlines the steps to build the Werewolf AI game based on this design.

Notes:

- we use pnpm as package manager
- prefer private fields and methods (#something)
- use JSDoc for comments if you can
- use TypeScript string literals instead of enums. never use enums 
- source files are in src/. `lib` and `app` are in SRC

**Phase 1: Project Setup & Core Types**

1.  Initialize Next.js project with TypeScript.
2.  Install necessary dependencies (`openai`, `async-retry` if used).
3.  Define core data structures in TypeScript (`GameState`, `Player`, `Role`, `GamePhase`, `ChatMessage`, etc.) based on Section 6. Ensure strict typing.
4.  Set up basic project structure (`app/`, `lib/`, `data/`).
5.  Define `CharacterPreset` data.

**Phase 2: Game State Management (`lib/state/gameStateManager.ts`)**

1.  Implement the `GameStateManager` class/module.
2.  Implement in-memory cache (`Map<string, GameState>`).
3.  Implement functions: `createGame`, `getGameState`, `updateGameState`.
4.  Implement JSON file persistence using `fs/promises` for reading (`loadGameStateFromFile`) and writing (`saveGameStateToFile`). Ensure the `data/games/` directory is created if it doesn't exist.
5.  Implement asynchronous file writing. Consider simple locking or queuing per `gameId` if concerned about race conditions during rapid updates.
6.  Implement `listGameIds` by scanning the `data/games/` directory.

**Phase 3: Game Engine Logic - Core Rules (`lib/game/engine.ts`)**

1.  Implement game initialization logic: Assign roles based on `GameSettings`, create `Player` objects with personas, set initial `GameState` properties (round 1, Night phase).
2.  Implement basic phase transition logic (`advancePhase`).
3.  Implement win condition checking logic (`checkWinCondition`).
4.  Implement logic to determine player turn order.
5.  *Initially, focus on the deterministic state changes without AI interaction.*

**Phase 4: AI Interaction Service (`lib/ai/openaiService.ts`)**

1.  Implement the `AI Agent Service` module.
2.  Initialize the `openai` SDK client using environment variables (`OPENAI_API_KEY`, `OPENAI_BASE_URL`).
3.  Implement the core `getAIResponseFunction` or similar wrapper around `openai.chat.completions.create()`.
4.  Implement basic retry logic for API calls (e.g., using `async-retry` or a manual loop).
5.  Develop initial prompt construction functions (placeholders or very basic versions).

**Phase 5: Basic Server Actions & Frontend (`app/`, `app/actions.ts`)**

1.  Implement the basic `startGameAction`:
    *   Generate `gameId`.
    *   Call `GameEngine` to initialize state.
    *   Call `GameStateManager` to save the initial state.
    *   Redirect to the game page.
2.  Implement `app/page.tsx`:
    *   Display a "Start New Game" form/button triggering `startGameAction`.
    *   Fetch and display the list of existing games using `listGameIds` from `GameStateManager`.
3.  Implement `app/game/[gameId]/page.tsx`:
    *   Fetch the initial `GameState` for the given `gameId` using a server action (`getFilteredGameStateAction` - initially might return full state).
    *   Pass the state to a client component.
4.  Implement `app/game/[gameId]/GameDisplay.tsx` (`"use client"`):
    *   Basic rendering of game ID, player list (names only initially), current phase, and round.

**Phase 6: Integrating AI into Game Flow**

1.  Enhance `GameEngine` to handle night actions:
    *   Determine which roles act at night.
    *   Prepare specific prompts for each acting role (Werewolf kill, Seer investigation, Doctor save).
    *   Define expected response formats.
2.  Enhance `GameEngine` to handle day discussion:
    *   Determine the next speaker based on `turnOrderIndex` and `livingPlayerIds`.
    *   Prepare prompts for discussion contributions.
3.  Enhance `GameEngine` to handle voting:
    *   Prepare prompts for voting.
    *   Implement vote tallying logic.
    *   Implement elimination logic.
4.  Implement/Refine `runGameTurnAction` Server Action:
    *   Load current `GameState`.
    *   Use `GameEngine` to determine the required action(s).
    *   Call `AI Agent Service` with appropriate prompts constructed based on game state and player role/persona/history. Filter history/state based on audience/role.
    *   Parse AI responses. Handle invalid/failed responses.
    *   Use `GameEngine` to update `GameState` based on AI actions/dialogue (add messages, record actions/votes, update status, advance phase/turn).
    *   Save updated `GameState` via `GameStateManager`.
    *   Call `revalidatePath` for the game page.
    *   Implement logic to automatically trigger the next turn/step (e.g., recursive call with delay, simple server loop if feasible, or prepare for background jobs).
5.  Refine `getFilteredGameStateAction` to properly filter sensitive information before sending it to the client as `FilteredGameState`.

**Phase 7: Frontend Polish & Display**

1.  Enhance `GameDisplay.tsx`:
    *   Render the `conversationLog` correctly, potentially styling moderator/player messages differently.
    *   Display player status (alive/dead) and potentially revealed roles upon death.
    *   Clearly indicate the current game phase, round, and whose turn it is (if applicable).
    *   Show night action results (e.g., who was eliminated).
    *   Show voting results.
    *   Display the winner when `GameState.phase` is `GameOver`.
2.  Implement client-side logic to handle updates triggered by `revalidatePath`.

**Phase 8: Testing, Refinement & Error Handling**

1.  Implement comprehensive logging throughout the application.
2.  Add robust error handling for API calls, file I/O, and game logic errors.
3.  Refine AI prompts based on observed gameplay to improve AI behavior, adherence to rules, and persona consistency.
4.  Write unit tests for `GameEngine`, `GameStateManager`, and utility functions.
5.  Write integration tests for the core game loop involving Server Actions and AI interaction (might require mocking the AI service).
6.  Manually test various game scenarios and edge cases.
7.  Address potential security concerns like prompt injection.

**Phase 9: Deployment**

1.  Configure environment variables for production (API keys, base URLs).
2.  Set up hosting environment (e.g., Vercel, Node.js server).
3.  Build the Next.js application (`next build`).
4.  Deploy the application.
5.  Monitor logs and performance.

**(Optional Phases - Post MVP)**

*   Implement WebSocket integration for real-time updates.
*   Migrate persistence to a database.
*   Integrate voice synthesis (e.g., ElevenLabs).
*   Implement background job queue for game turn management.
*   Add more roles and features.
