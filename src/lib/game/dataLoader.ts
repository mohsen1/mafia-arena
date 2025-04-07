import { promises as fsPromises, readFileSync } from 'fs';
import path from 'path';
import { CharacterPreset } from '@/lib/types/game';
import { getElevenLabsVoices } from "@/lib/tts/elevenlabsService";

const CHARACTER_DATA_PATH = path.join(process.cwd(), 'data.json');
const CHARACTER_IMAGES_DIR = path.join(process.cwd(), 'public/images/characters');

// --- Character Preset Loading ---

/**
 * Loads character presets from the JSON data file synchronously.
 * Intended to be called once at server startup/build time if possible, or within server-side functions.
 */
export function loadCharacterPresets(): ReadonlyArray<CharacterPreset> {
    console.log("Executing loadCharacterPresets...");
    try {
        const jsonData = readFileSync(CHARACTER_DATA_PATH, 'utf-8');
        const charactersData: any[] = JSON.parse(jsonData);

        const presets = charactersData.map(char => {
             if (!char.characterName || 
                 !char.appearanceFlavorText || 
                 !char.corePersonalityArchetype || 
                 !char.keyPersonalityTraits ||
                 !char.motivationsGoals ||
                 !char.backgroundBackstory?.professionRoleInCommunity
             ) {
                 console.warn('[dataLoader] Character data missing required fields:', char.characterName || '(Unknown Name)');
                 return null;
             }
             const personaParts = [
                 `Name: ${char.characterName}`,
                 `Role in Community: ${char.backgroundBackstory.professionRoleInCommunity}`,
                 `Appearance: ${char.appearanceFlavorText}`,
                 `Personality Archetype: ${char.corePersonalityArchetype}`,
                 `Key Traits: ${char.keyPersonalityTraits.communicationStyle}, Confidence ${char.keyPersonalityTraits.confidence}/10, Suspicion ${char.keyPersonalityTraits.suspicion}/10, Honesty ${char.keyPersonalityTraits.honestyDeceptiveness}/10.`,
                 `Motivations: ${char.motivationsGoals.slice(0, 2).join(', ')}.`
             ];
             return {
                 name: char.characterName as string,
                 persona: personaParts.join(' \n'),
             };
         }).filter((preset): preset is CharacterPreset => preset !== null);
         
         console.log(`[dataLoader] Loaded ${presets.length} character presets.`);
         return presets;
    } catch (error) {
        console.error("[dataLoader] Failed to load character presets:", error);
        throw new Error("Could not load character presets from data.json.");
    }
}

// --- Image Loading ---

/**
 * Lists available character image filenames asynchronously.
 */
export async function listCharacterImageFiles(): Promise<string[]> {
    console.log("Executing listCharacterImageFiles...");
    try {
        const files = await fsPromises.readdir(CHARACTER_IMAGES_DIR);
        const imageFiles = files.filter(file => /\.(png|jpg|jpeg|webp)$/i.test(file));
        console.log(`[dataLoader] Found ${imageFiles.length} character images.`);
        return imageFiles;
    } catch (error) {
        console.error("[dataLoader] Failed to list character images:", error);
        return []; 
    }
}

// --- Voice Loading --- 

let cachedVoices: { voice_id: string, name: string }[] | null = null;

/** 
 * Fetches and caches suitable ElevenLabs voices.
 * Ensures filtering for defined names.
 */
export async function getFilteredVoices(): Promise<{ voice_id: string, name: string }[]> {
    if (cachedVoices !== null) {
        return cachedVoices;
    }
    console.log("[dataLoader] Fetching and filtering ElevenLabs voices...");
    try {
        const allVoices = await getElevenLabsVoices();
        cachedVoices = allVoices
            .filter(v => 
                v.labels?.gender && 
                v.labels?.age && 
                v.name && // Ensure name is defined
                v.name !== 'Nicole' && // Example exclusion
                !v.name.includes('AI')
             )
            .map(v => ({ 
                voice_id: v.voice_id, 
                name: v.name as string // Cast name after filtering
            }));
        console.log(`[dataLoader] Cached ${cachedVoices.length} filtered voices.`);
        return cachedVoices;
    } catch (error) {
        console.error("[dataLoader] Failed to load/filter voices:", error);
        cachedVoices = []; // Cache empty array on error
        return cachedVoices;
    }
} 