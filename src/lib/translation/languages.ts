// Define supported language codes and their corresponding names
// This aligns with the keys used in dictionary.json
export const supportedLanguagesMap = {
    en: 'English',
    fa: 'Persian',
    de: 'German'
} as const;

// Type for the language codes (e.g., 'en', 'fa')
export type LanguageCode = keyof typeof supportedLanguagesMap;

// Type for the full language names (e.g., 'English', 'Persian')
export type LanguageName = typeof supportedLanguagesMap[LanguageCode];

// Array of available language codes
export const availableLanguageCodes = Object.keys(supportedLanguagesMap) as LanguageCode[];

// Array of available full language names
export const availableLanguageNames = Object.values(supportedLanguagesMap);

// Utility function to map LanguageName (used in context/UI) to LanguageCode (used for dictionary)
export function mapLanguageNameToCode(name: LanguageName): LanguageCode | undefined {
    for (const code in supportedLanguagesMap) {
        if (supportedLanguagesMap[code as LanguageCode] === name) {
            return code as LanguageCode;
        }
    }
    return undefined;
}

import { getAIResponse } from '@/lib/ai/openaiService'; // Assuming this is the path
import { cleanAIResponse } from '@/lib/utils/stringUtils';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { DEFAULT_GAME_SETTINGS } from '@/lib/config'; // To get default model
import { GENERATE_UI_TRANSLATION_PROMPT } from '@/lib/ai/PROMPTS'; // Import the new prompt generator

import dictionaryDataJson from './dictionary.json';

// --- Types --- 
// Export these types for use in actions.ts
export interface TranslationEntry {
    phrase: string;
    translation: string;
    description: string;
}
export type DictionaryData = Partial<Record<LanguageCode, TranslationEntry[]>>;

const dictionary: DictionaryData = dictionaryDataJson;

type PhraseTranslation = {
    phrase: string;
    translation: string;
    description?: string;
}

// --- Constants ---

// --- Core Generation Function (Internal) --- 

// --- Caching Wrapper Function (Exported) ---

