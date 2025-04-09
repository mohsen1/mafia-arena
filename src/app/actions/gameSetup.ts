'use server';

import { SupportedLanguage } from "@/hooks/useGameConfig";
import { generateAICharacterProfile } from "@/lib/ai/openaiService";
import { DEFAULT_GAME_SETTINGS } from "@/lib/config";
import { initializeNewGame } from "@/lib/game/engine";
import { gameStateManager } from "@/lib/state/gameStateManager";
import {
    AICharacterProfile,
    GameSettings,
    PlayerInitializationData,
    Role,
} from "@/lib/types/game";
import { selectCharacterImage } from "@/lib/utils/imageUtils";
import crypto from "crypto";
import { redirect } from "next/navigation";

// ElevenLabs configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

// Extend the expected return type for generateCharacterAction
// Add voiceId here as well, although assigned later
type GenerateCharacterResult = PlayerInitializationData & {
  imageUrl?: string | null;
  voiceId?: string;
  aiModel: string;
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
        `Failed to fetch ElevenLabs voices: ${response.statusText}`
      );
    }
    const data = await response.json();
    return data.voices || [];
  } catch (error) {
    console.error("Error fetching ElevenLabs voices:", error);
    return [];
  }
}

// Action to start a new game - Accepts player list and language
export async function startGameAction(
  playerInitDataList: GenerateCharacterResult[],
  language: SupportedLanguage
) {
  console.log(
    `Attempting to start a new game with ${playerInitDataList.length} players in ${language}...`
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
      (v) => v.category === "premade"
    ); // Use only premade voices
    let voiceIndex = 0;

    // --- Assign Voices to Init Data (before passing to initializeNewGame) ---
    const playersWithVoicesAssigned = playerInitDataList.map((playerInit) => {
      let assignedVoiceId: string | undefined = undefined;
      if (usableVoices.length > 0) {
        assignedVoiceId =
          usableVoices[voiceIndex % usableVoices.length].voice_id;
        voiceIndex++;
      }
      return { ...playerInit, voiceId: assignedVoiceId };
    });

    // --- Construct Settings ---
    const numPlayers = playersWithVoicesAssigned.length;
    const settings: GameSettings = {
      roleDistribution: playersWithVoicesAssigned.reduce((acc, curr) => {
        acc[curr.role] = (acc[curr.role] || 0) + 1;
        return acc;
      }, {} as Record<Role, number>),
      discussionRoundsPerPlayer:
        DEFAULT_GAME_SETTINGS.discussionRoundsPerPlayer,
      numPlayers: numPlayers,
    };
    // --- End Settings ---

    const gameId = `game-${crypto.randomUUID()}`;
    const createdAt = Date.now();

    // --- Initialize Game State ---
    // Pass player data with voice IDs assigned to initializeNewGame
    const initialGameState = await initializeNewGame(
      settings,
      gameId,
      createdAt,
      playersWithVoicesAssigned,
      language
    );

    // --- Save Game State ---
    const newGame = await gameStateManager.createAndSaveGame(initialGameState); // Use the correct method
    console.log(`New game created with ID: ${newGame.gameId}`);
    gameIdToRedirect = newGame.gameId;
  } catch (error: any) {
    if (error.digest?.startsWith("NEXT_REDIRECT")) throw error;
    console.error("Failed to start new game:", error);
    return {
      error: `Failed to create the game: ${error.message || "Unknown error"}`,
    };
  }

  if (gameIdToRedirect) {
    redirect(`/game/${gameIdToRedirect}`);
  } else {
    return { error: "Game creation failed unexpectedly." };
  }
}

/**
 * Action to generate a single AI character profile based on a role.
 * Uses async-retry to handle potential API flakiness.
 * @param role The role for the character.
 * @param aiModel The AI model to use.
 * @param existingProfiles Profiles already generated in this session, to encourage variety.
 * @returns A promise resolving to the generated character profile or an error object.
 */
export async function generateCharacterAction(
  role: Role,
  model: string,
  language: SupportedLanguage,
  existingProfiles?: AICharacterProfile[]
): Promise<GenerateCharacterResult | { error: string }> {
  console.log(`generateCharacterAction called for role: ${role}, model: ${model}, lang: ${language}`);
  try {
    // Pass parameters in the correct order
    const profile = await generateAICharacterProfile(role, model, language, existingProfiles);
    if (!profile) {
      throw new Error("AI profile generation returned null.");
    }

    // Select image after profile generation
    const imageUrl = await selectCharacterImage(profile.gender, profile.ageCategory);

    // Return the combined result
    const result: GenerateCharacterResult = {
      role: role,
      profile: profile,
      aiModel: model, // Pass model through
      imageUrl: imageUrl ?? undefined,
      // voiceId will be assigned later in startGameAction
    };
    return result;

  } catch (error: any) {
    console.error(
      `Error in generateCharacterAction for role ${role}:`, error
    );
    return { error: error.message || "Failed to generate character profile." };
  }
} 