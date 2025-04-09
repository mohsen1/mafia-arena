// Define supported language codes, their English names, and native labels
export const supportedLanguagesInfo = {
  en: { name: "English", label: "English" },
  fa: { name: "Persian", label: "فارسی" },
  de: { name: "German", label: "Deutsch" },
} as const;

// Type for the language codes (e.g., 'en', 'fa')
export type LanguageCode = keyof typeof supportedLanguagesInfo;

// Type for the full English language names (e.g., 'English', 'Persian')
export type LanguageName = (typeof supportedLanguagesInfo)[LanguageCode]["name"];

// Array of available language codes
export const availableLanguageCodes = Object.keys(
  supportedLanguagesInfo,
) as LanguageCode[];

// Array of available full English language names
export const availableLanguageNames = Object.values(supportedLanguagesInfo).map(
  (lang) => lang.name,
);

// Utility function to map LanguageName (used in context/UI) back to LanguageCode
export function mapLanguageNameToCode(
  name: LanguageName | string,
): LanguageCode | undefined {
  for (const code in supportedLanguagesInfo) {
    if (supportedLanguagesInfo[code as LanguageCode].name === name) {
      return code as LanguageCode;
    }
  }
  console.warn(`[mapLanguageNameToCode] Could not find code for name: ${name}`);
  return undefined;
}

// Utility function to get Language Info object by code
export function getLanguageInfoByCode(
  code: LanguageCode,
): (typeof supportedLanguagesInfo)[LanguageCode] {
  return supportedLanguagesInfo[code];
}

// Utility function to get Language Info object by name
export function getLanguageInfoByName(
  name: LanguageName | string,
): (typeof supportedLanguagesInfo)[LanguageCode] | undefined {
  const code = mapLanguageNameToCode(name);
  return code ? supportedLanguagesInfo[code] : undefined;
}

import { getAIResponse } from "@/lib/ai/openaiService"; // Assuming this is the path
import { cleanAIResponse } from "@/lib/utils/stringUtils";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { DEFAULT_GAME_SETTINGS } from "@/lib/config"; // To get default model
import { GENERATE_UI_TRANSLATION_PROMPT } from "@/lib/ai/PROMPTS"; // Import the new prompt generator

import dictionaryDataJson from "./dictionary.json";

// --- Types ---
// Export these types for use in actions.ts
export interface TranslationEntry {
  phrase: string;
  translation: string;
  description: string;
  preTranslated?: boolean; // Added optional flag
}
export type DictionaryData = Partial<Record<LanguageCode, TranslationEntry[]>>;

const dictionary: DictionaryData = dictionaryDataJson;

type PhraseTranslation = {
  phrase: string;
  translation: string;
  description?: string;
};

// --- Constants ---

// --- Core Generation Function (Internal) ---

// --- Caching Wrapper Function (Exported) ---
