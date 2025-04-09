"use server";

import { getAIResponse } from "@/lib/ai/openaiService";
import {
  GENERATE_UI_TRANSLATION_PROMPT,
  TRANSLATE_TEXT_SYSTEM_PROMPT,
} from "@/lib/ai/PROMPTS";
import dictionaryDataJson from "@/lib/translation/dictionary.json";
import { supportedLanguagesInfo } from "@/lib/translation/languages";
import type {
  DictionaryData,
  LanguageCode,
  TranslationEntry,
  LanguageName,
} from "@/lib/translation/languages";
import { cleanAIResponse } from "@/lib/utils/stringUtils";
import fs from "node:fs/promises";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import path from "node:path";

// --- Constants ---
const DICTIONARY_FILE_PATH = path.join(
  process.cwd(),
  "src", // Adjusted path relative to cwd()
  "lib",
  "translation",
  "dictionary.json",
);
const CACHE_DIR = path.join(process.cwd(), "data", "translations");

// --- Helper Function for Translation (using AI) ---
export async function translateText(
  text: string,
  targetLanguageName: LanguageName,
): Promise<string> {
  // Avoid translation if already in the target language (basic check)
  if (targetLanguageName === "English") {
    // Assuming English is the base
    return text;
  }
  if (!text) return ""; // Handle empty strings

  console.log(
    `[Translate] Requesting translation to ${targetLanguageName} for: "${text.substring(0, 50)}..."`,
  );

  try {
    // Simple prompt for translation
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: TRANSLATE_TEXT_SYSTEM_PROMPT(targetLanguageName) },
      { role: "user", content: text },
    ];

    // Use specified model for this helper function
    const translation = await getAIResponse(
      messages,
      "translation-task",
      "translator",
      {
        model: "llama-3.3-70b-versatile", // Explicitly use llama-3.3-70b-versatile
        temperature: 0.1,
      },
    );

    console.log(`[Translate] Received: "${translation.substring(0, 50)}..."`);
    return cleanAIResponse(translation); // Clean potential extra formatting
  } catch (error) {
    console.error(`[Translate] Error translating to ${targetLanguageName}:`, error);
    return text; // Fallback to original text on error
  }
}

// --- Translation Caching/Generation Action ---

const dictionary: DictionaryData = dictionaryDataJson;

/**
 * Server action to get translations for a language, using cache or generating via LLM.
 */
export async function getOrGenerateTranslationsAction(
  targetLangCode: LanguageCode,
): Promise<Record<string, string>> {
  // Handle English separately - read directly from imported JSON
  if (targetLangCode === "en") {
    console.log(
      "[Action:getTranslations] Requested 'en', loading from source dictionary...",
    );
    const englishMap: Record<string, string> = {};
    for (const item of dictionary.en || []) {
      englishMap[item.phrase] = item.translation;
    }
    return englishMap;
  }

  const cacheFilePath = path.join(CACHE_DIR, `${targetLangCode}.json`);
  const targetLanguageName = supportedLanguagesInfo[targetLangCode]?.name;
  if (!targetLanguageName) {
    throw new Error(`Invalid target language code: ${targetLangCode}`);
  }

  try {
    // 1. Try reading from cache
    console.log(`[Action:getTranslations] Checking cache: ${cacheFilePath}`);
    const cachedData = await fs.readFile(cacheFilePath, "utf-8");
    console.log(
      `[Action:getTranslations] Cache HIT for ${targetLanguageName}.`,
    );
    return JSON.parse(cachedData) as Record<string, string>;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      // 2. Cache MISS - Generate using LLM OR load if dictionary is complete
      console.log(
        `[Action:getTranslations] Cache MISS for ${targetLanguageName}. Checking dictionary...`,
      );
      try {
        const englishDictionary = dictionary.en;
        if (!englishDictionary || englishDictionary.length === 0) {
          throw new Error(
            "Source English dictionary ('en') is missing or empty.",
          );
        }

        // --- Check if dictionary.json has all translations --- 
        const preExistingTranslations = dictionary[targetLangCode];
        if (preExistingTranslations && preExistingTranslations.length > 0) {
           const englishPhrases = new Set(englishDictionary.map(item => item.phrase));
           const preExistingPhrases = new Set(preExistingTranslations.map(item => item.phrase));
           const allPhrasesFound = [...englishPhrases].every(phrase => preExistingPhrases.has(phrase));

           if(allPhrasesFound) {
              console.log(`[Action:getTranslations] All ${englishPhrases.size} required phrases found in dictionary.json for ${targetLangCode}. Skipping AI generation.`);
              const translationMap: Record<string, string> = {};
              for (const entry of preExistingTranslations) {
                // Only include entries that correspond to the current English dictionary
                if (englishPhrases.has(entry.phrase)) {
                   translationMap[entry.phrase] = entry.translation;
                }
              }

                // Write to cache (same logic as after AI gen)
               try {
                 await fs.mkdir(CACHE_DIR, { recursive: true });
                 await fs.writeFile(
                   cacheFilePath,
                   JSON.stringify(translationMap, null, 2),
                 );
                 console.log(
                   `[Action:getTranslations] Wrote dictionary-based translations to cache: ${cacheFilePath}`,
                 );
               } catch (writeError: unknown) {
                 const message =
                   writeError instanceof Error
                     ? writeError.message
                     : String(writeError);
                 console.error(
                   `[Action:getTranslations] FAILED to write dictionary-based cache file ${cacheFilePath}:`,
                   message,
                 );
               }
               return translationMap;
           }
           console.log(`[Action:getTranslations] Dictionary incomplete for ${targetLangCode}. Proceeding with AI generation.`);
        }
         // --- End dictionary check --- 

        // --- If dictionary incomplete or empty, proceed with AI --- 
        console.log(`[Action:getTranslations] Generating translations via AI for ${targetLanguageName}...`);

        const systemPrompt = GENERATE_UI_TRANSLATION_PROMPT(targetLanguageName);
        const userMessage = JSON.stringify(englishDictionary, null, 2);
        const messages: ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ];

        // --- LLM Call ---
        const aiResponse = await getAIResponse(
          messages,
          `translation-gen-${targetLangCode}`,
          "translator",
          {
            model: "llama-3.3-70b-versatile", // Explicitly use llama-3.3-70b-versatile
            temperature: 0.2,
          },
        );
        const cleanedResponse = cleanAIResponse(aiResponse);
        let translatedArray: TranslationEntry[];
        try {
          const parsedResponse = JSON.parse(cleanedResponse);
          if (!Array.isArray(parsedResponse))
            throw new Error("LLM response is not an array.");
          translatedArray = parsedResponse as TranslationEntry[];
        } catch (parseError: unknown) {
          console.error(
            "[Action:getTranslations] Failed to parse LLM response:",
            cleanedResponse,
          );
          const message =
            parseError instanceof Error
              ? parseError.message
              : String(parseError);
          throw new Error(
            `Failed to parse LLM translation response: ${message}`,
          );
        }
        // --- End LLM Call & Parse ---

        // --- Merge with pre-existing dictionary entries ---
        const translationMap: Record<string, string> = {};
        const originalPhrases = new Set(
          englishDictionary.map((item: TranslationEntry) => item.phrase),
        );

        // 1. Populate with AI translations first
        for (const item of translatedArray) {
          if (originalPhrases.has(item.phrase)) {
            translationMap[item.phrase] = item.translation;
          } else {
            console.warn(
              `[Action:getTranslations] LLM returned unknown phrase "${item.phrase}" (not in English source), skipping.`,
            );
          }
        }

        // 2. Overwrite with pre-existing dictionary translations (variable already declared above)
        if (preExistingTranslations && preExistingTranslations.length > 0) {
          console.log(
            `[Action:getTranslations] Found ${preExistingTranslations.length} pre-existing entries in dictionary.json for ${targetLangCode}. Merging...`,
          );
          for (const entry of preExistingTranslations) {
            if (originalPhrases.has(entry.phrase)) {
              if (translationMap[entry.phrase] !== entry.translation) {
                // Log if we are actually overwriting an AI translation
                if (translationMap[entry.phrase]) {
                  console.log(
                    `[Action:getTranslations] Overwriting AI translation for "${entry.phrase}" with dictionary version.`,
                  );
                } else {
                   console.log(
                    `[Action:getTranslations] Adding dictionary translation for "${entry.phrase}" (was missing from AI).`,
                  );
                }
                translationMap[entry.phrase] = entry.translation;
              }
            } else {
              console.warn(
                `[Action:getTranslations] Dictionary entry "${entry.phrase}" for ${targetLangCode} does not match any English source phrase, skipping.`,
              );
            }
          }
        }
        // --- End Merge ---

        // Check for missing keys AFTER merging
        const missingKeys = englishDictionary.filter(
          (item: TranslationEntry) => !(item.phrase in translationMap),
        );
        if (missingKeys.length > 0) {
          console.warn(
            `[Action:getTranslations] Final translation map for ${targetLanguageName} is missing ${missingKeys.length} phrases: ${missingKeys.map((k: TranslationEntry) => k.phrase).join(", ")}`,
          );
        }

        console.log(
          `[Action:getTranslations] Successfully generated translations for ${targetLanguageName}.`,
        );

        // 3. Write to cache (inside the generation block)
        try {
          await fs.mkdir(CACHE_DIR, { recursive: true });
          await fs.writeFile(
            cacheFilePath,
            JSON.stringify(translationMap, null, 2),
          );
          console.log(
            `[Action:getTranslations] Wrote generated translations to cache: ${cacheFilePath}`,
          );
        } catch (writeError: unknown) {
          const message =
            writeError instanceof Error
              ? writeError.message
              : String(writeError);
          console.error(
            `[Action:getTranslations] FAILED to write cache file ${cacheFilePath}:`,
            message,
          );
          // Still return generated data even if caching fails
        }

        return translationMap;
      } catch (generationError: unknown) {
        const message =
          generationError instanceof Error
            ? generationError.message
            : String(generationError);
        console.error(
          `[Action:getTranslations] FAILED to generate translations for ${targetLanguageName}:`,
          message,
        );
        // Throw a new error to avoid exposing internal details potentially
        throw new Error(
          `Failed to generate translations for ${targetLanguageName}.`,
        );
      }
    } else {
      // Other file system error (permissions, etc.)
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[Action:getTranslations] Error reading cache file ${cacheFilePath}:`,
        message,
      );
      throw new Error(
        `Failed to read translation cache for ${targetLanguageName}.`,
      );
    }
  }
}

// --- Action to Add Missing English Phrases ---

/**
 * Server action to add a missing phrase to the English source dictionary.
 * This should only be called when a fallback is used for an English translation.
 */
export async function addMissingEnglishPhrase(
  phraseKey: string,
  fallbackTranslation: string,
): Promise<{ success: boolean; message?: string }> {

  // Basic validation
  if (!phraseKey || !fallbackTranslation) {
    console.warn(
      "[Action:addMissingPhrase] Invalid input: phraseKey or fallbackTranslation is empty.",
    );
    return {
      success: false,
      message: "Phrase key and fallback translation cannot be empty.",
    };
  }

  try {
    // 1. Read the current dictionary
    const fileContent = await fs.readFile(DICTIONARY_FILE_PATH, "utf-8");
    const dictionaryData = JSON.parse(fileContent) as DictionaryData;

    // Ensure 'en' array exists
    if (!dictionaryData.en) {
      dictionaryData.en = [];
    }

    // 2. Check if the phrase already exists
    const existingEntry = dictionaryData.en.find(
      (entry) => entry.phrase === phraseKey,
    );

    if (existingEntry) {
      // Optionally update the translation if the fallback is different?
      // For now, just return success if it exists.
      return { success: true };
    }

    // 3. Add the new entry
    const newEntry: TranslationEntry = {
      phrase: phraseKey,
      translation: fallbackTranslation, // Use the fallback as the English translation
      description: "Auto-added from fallback", // Add a default description
    };
    dictionaryData.en.push(newEntry);
    console.log(
      `[Action:addMissingPhrase] Added new phrase: "${phraseKey}" = "${fallbackTranslation}"`,
    );

    // 4. Sort the English dictionary alphabetically by phrase key for consistency
    dictionaryData.en.sort((a, b) => a.phrase.localeCompare(b.phrase));

    // 5. Write the updated dictionary back
    await fs.writeFile(
      DICTIONARY_FILE_PATH,
      JSON.stringify(dictionaryData, null, 2), // Pretty print
      "utf-8",
    );

    console.log(
      `[Action:addMissingPhrase] Successfully updated ${DICTIONARY_FILE_PATH}.`,
    );
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[Action:addMissingPhrase] FAILED to update dictionary for key "${phraseKey}":`,
      message,
    );
    return { success: false, message: `Failed to update dictionary: ${message}` };
  }
}
