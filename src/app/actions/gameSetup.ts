"use server";

import { generateAICharacterProfile } from "@/lib/ai/openaiService";
import { DEFAULT_GAME_SETTINGS } from "@/lib/config";
import { initializeNewGame } from "@/lib/game/engine";
import { gameStateManager } from "@/lib/state/gameStateManager";
import type {
  AICharacterProfile,
  GameSettings,
  PlayerInitializationData,
  Role,
} from "@/lib/types/game";
import { selectCharacterImage } from "@/lib/utils/imageUtils";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import type { LanguageName } from "@/lib/i18n/settings";

// ElevenLabs configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

// Extend the expected return type for generateCharacterAction
// Now includes the generated persona string derived from the profile
type GenerateCharacterResult = AICharacterProfile & {
  role: Role; // Role is still needed here for initialization
  aiModel: string;
  persona: string; // This is the constructed persona string
  imageUrl?: string | null;
  voiceId?: string; // Assigned later
};

// Helper function to fetch ElevenLabs voices
async function getElevenLabsVoices(): Promise<
  { voice_id: string; name: string; category: string }[]
> {
  if (!ELEVENLABS_API_KEY) {
    console.warn("ElevenLabs API key not configured. Skipping voice fetching.");
    return [];
  }
  try {
    const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
      },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ElevenLabs voices: ${response.statusText}`,
      );
    }
    const data = await response.json();
    return data.voices || [];
  } catch (error) {
    console.error("Error fetching ElevenLabs voices:", error);
    return [];
  }
}

// Define and export the structure that startGameAction actually receives from useGameConfig
export type StartGameInputData = PlayerInitializationData & {
  persona: string;
  voiceId?: string; // Voice ID added here before calling initializeNewGame
  imageUrl?: string | null;
  isHuman?: boolean; // Add flag to identify human player data
};

// Action to start a new game - Accepts player list and language
export async function startGameAction(
  // Update parameter to use the defined type
  playerInitDataList: StartGameInputData[],
  language: LanguageName,
) {
  console.log(
    `Attempting to start a new game with ${playerInitDataList.length} players in ${language}...`,
  );

  let gameIdToRedirect: string | null = null;
  try {
    // --- Basic Validation ---
    if (!playerInitDataList || playerInitDataList.length < 5) {
      throw new Error("A minimum of 5 players is required.");
    }
    // --- End Validation ---

    // --- Fetch Voices ---
    const availableVoices = await getElevenLabsVoices();
    const usableVoices = availableVoices.filter(
      (v) => v.category === "premade",
    ); // Use only premade voices
    let voiceIndex = 0;

    // --- Assign Voices to Init Data (before passing to initializeNewGame) ---
    // Add voiceId to the input data
    const playersForInitialization: StartGameInputData[] =
      playerInitDataList.map((initData): StartGameInputData => {
        let assignedVoiceId: string | undefined = undefined;
        const isHuman = initData.isHuman ?? false;
        if (!isHuman && usableVoices.length > 0) {
          assignedVoiceId =
            usableVoices[voiceIndex % usableVoices.length].voice_id;
          voiceIndex++;
        }
        // Add voiceId to the existing object, ensure isHuman is passed through
        return { ...initData, isHuman: isHuman, voiceId: assignedVoiceId };
      });

    // --- Construct Settings ---
    const numPlayers = playersForInitialization.length;
    const settings: GameSettings = {
      roleDistribution: playersForInitialization.reduce(
        (acc, curr) => {
          acc[curr.role] = (acc[curr.role] || 0) + 1;
          return acc;
        },
        {} as Record<Role, number>,
      ),
      discussionRoundsPerPlayer:
        DEFAULT_GAME_SETTINGS.discussionRoundsPerPlayer,
      numPlayers: numPlayers,
      language: language,
    };
    // --- End Settings ---

    const gameId = `game-${crypto.randomUUID()}`;
    const createdAt = Date.now();

    // --- Initialize Game State ---
    // Pass the correctly formatted player data to initializeNewGame
    const initialGameState = await initializeNewGame(
      settings,
      gameId,
      createdAt,
      playersForInitialization, // Pass the mapped data
    );

    // --- Save Game State ---
    const newGame = await gameStateManager.createAndSaveGame(initialGameState); // Use the correct method
    console.log(`New game created with ID: ${newGame.gameId}`);
    gameIdToRedirect = newGame.gameId;
  } catch (error: unknown) {
    // Type error
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT"))
      throw error; // Check for redirect error
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to start new game:", errorMessage);
    return {
      error: `Failed to create the game: ${errorMessage}`,
    };
  }

  if (gameIdToRedirect) {
    // Include the language in the redirect path
    console.log(`Redirecting to /${language}/game/${gameIdToRedirect}`);
    redirect(`/${language}/game/${gameIdToRedirect}`);
  } else {
    return { error: "Game creation failed unexpectedly." };
  }
}

/**
 * Action to generate a single AI character profile based on a role.
 * Uses async-retry to handle potential API flakiness.
 * @param role The role for the character.
 * @param aiModel The AI model to use.
 * @param language The target language.
 * @param existingProfiles Profiles already generated in this session, to encourage variety.
 * @returns A promise resolving to the generated character profile (with persona) or an error object.
 */
export async function generateCharacterAction(
  role: Role,
  model: string,
  language: LanguageName,
  existingProfiles?: AICharacterProfile[],
): Promise<GenerateCharacterResult | { error: string }> {
  console.log(
    `generateCharacterAction called for role: ${role}, model: ${model}, lang: ${language}`,
  );
  try {
    // Call generateAICharacterProfile which now returns profile + persona
    const profileAndPersona = await generateAICharacterProfile(
      role,
      model,
      language,
      existingProfiles,
    );
    if (!profileAndPersona) {
      throw new Error("AI profile generation returned null.");
    }

    // Select image after profile generation using fields from profileAndPersona
    const imageUrl = await selectCharacterImage(
      profileAndPersona.gender,
      profileAndPersona.ageCategory,
    );

    // Construct the result using the data from profileAndPersona
    const result: GenerateCharacterResult = {
      ...profileAndPersona, // Includes characterName, shortBio, gender, ageCategory, persona
      role: role, // Add the role back in
      aiModel: model, // Pass model through
      imageUrl: imageUrl ?? undefined,
      // voiceId will be assigned later in startGameAction
    };
    return result;
  } catch (error: unknown) {
    // Type error
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Error in generateCharacterAction for role ${role}:`,
      errorMessage,
    );
    return { error: errorMessage };
  }
}
