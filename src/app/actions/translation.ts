"use server";


import { getAIResponse } from "@/lib/ai/openaiService";
import { GENERATE_UI_TRANSLATION_PROMPT, TRANSLATE_TEXT_SYSTEM_PROMPT } from "@/lib/ai/PROMPTS";
import dictionaryDataJson from '@/lib/translation/dictionary.json';
import { supportedLanguagesMap } from "@/lib/translation/languages";
import type {
    DictionaryData,
    LanguageCode,
    TranslationEntry
} from "@/lib/translation/languages";
import { cleanAIResponse } from "@/lib/utils/stringUtils";
import fs from "node:fs/promises";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import path from "node:path";

// Define supported languages
export const supportedLanguages = ['English', 'Persian', 'German'] as const;
export type SupportedLanguage = typeof supportedLanguages[number];

// --- Helper Function for Translation (using AI) --- 
export async function translateText(text: string, targetLanguage: SupportedLanguage): Promise<string> {
    // Avoid translation if already in the target language (basic check)
    if (targetLanguage === 'English') { // Assuming English is the base
        return text;
    }
    if (!text) return ""; // Handle empty strings

    console.log(`[Translate] Requesting translation to ${targetLanguage} for: "${text.substring(0, 50)}..."`);

    try {
        // Simple prompt for translation
        const messages: ChatCompletionMessageParam[] = [
            { role: "system", content: TRANSLATE_TEXT_SYSTEM_PROMPT(targetLanguage) },
            { role: "user", content: text },
        ];
        
        // Use specified model for this helper function
        const translation = await getAIResponse(messages, 'translation-task', 'translator', {
            model: 'llama-3.3-70b-versatile', // Explicitly use llama-3.3-70b-versatile
            temperature: 0.1, 
        });

        console.log(`[Translate] Received: "${translation.substring(0, 50)}..."`);
        return cleanAIResponse(translation); // Clean potential extra formatting
    } catch (error) {
        console.error(`[Translate] Error translating to ${targetLanguage}:`, error);
        return text; // Fallback to original text on error
    }
}

// --- Translation Caching/Generation Action --- 

const dictionary: DictionaryData = dictionaryDataJson;
const CACHE_DIR = path.join(process.cwd(), 'data', 'translations');

/**
 * Server action to get translations for a language, using cache or generating via LLM.
 */
export async function getOrGenerateTranslationsAction(
    targetLangCode: LanguageCode
): Promise<Record<string, string>> {
    
    // Handle English separately - read directly from imported JSON
    if (targetLangCode === 'en') {
        console.log("[Action:getTranslations] Requested 'en', loading from source dictionary...");
        const englishMap: Record<string, string> = {};
        for (const item of (dictionary.en || [])) {
             englishMap[item.phrase] = item.translation;
        }
        return englishMap;
    }

    const cacheFilePath = path.join(CACHE_DIR, `${targetLangCode}.json`);
    const targetLanguageName = supportedLanguagesMap[targetLangCode];

    try {
        // 1. Try reading from cache
        console.log(`[Action:getTranslations] Checking cache: ${cacheFilePath}`);
        const cachedData = await fs.readFile(cacheFilePath, 'utf-8');
        console.log(`[Action:getTranslations] Cache HIT for ${targetLanguageName}.`);
        return JSON.parse(cachedData) as Record<string, string>;
    } catch (error: unknown) {
        if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
            // 2. Cache MISS - Generate using LLM
            console.log(`[Action:getTranslations] Cache MISS for ${targetLanguageName}. Generating...`);
            try {
                const englishDictionary = dictionary.en;
                if (!englishDictionary || englishDictionary.length === 0) {
                    throw new Error("Source English dictionary ('en') is missing or empty.");
                }

                const systemPrompt = GENERATE_UI_TRANSLATION_PROMPT(targetLanguageName);
                const userMessage = JSON.stringify(englishDictionary, null, 2);
                const messages: ChatCompletionMessageParam[] = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ];

                // --- LLM Call --- 
                const aiResponse = await getAIResponse(messages, `translation-gen-${targetLangCode}`, 'translator', {
                    model: 'llama-3.3-70b-versatile', // Explicitly use llama-3.3-70b-versatile
                    temperature: 0.2,
                });
                const cleanedResponse = cleanAIResponse(aiResponse);
                let translatedArray: TranslationEntry[];
                try {
                    const parsedResponse = JSON.parse(cleanedResponse);
                    if (!Array.isArray(parsedResponse)) throw new Error("LLM response is not an array.");
                    translatedArray = parsedResponse as TranslationEntry[];
                } catch (parseError: unknown) {
                    console.error("[Action:getTranslations] Failed to parse LLM response:", cleanedResponse);
                    const message = parseError instanceof Error ? parseError.message : String(parseError);
                    throw new Error(`Failed to parse LLM translation response: ${message}`);
                }
                // --- End LLM Call & Parse --- 

                const translationMap: Record<string, string> = {};
                const originalPhrases = new Set(englishDictionary.map((item: TranslationEntry) => item.phrase));
                for (const item of translatedArray) {
                    if (originalPhrases.has(item.phrase)) {
                        translationMap[item.phrase] = item.translation;
                    } else {
                        console.warn(`[Action:getTranslations] LLM returned unknown phrase "${item.phrase}", skipping.`);
                    }
                }
                // Check for missing keys
                 const missingKeys = englishDictionary.filter((item: TranslationEntry) => !(item.phrase in translationMap));
                 if (missingKeys.length > 0) {
                     console.warn(`[Action:getTranslations] LLM translation missed ${missingKeys.length} phrases: ${missingKeys.map((k: TranslationEntry)=>k.phrase).join(', ')}`);
                 }

                console.log(`[Action:getTranslations] Successfully generated translations for ${targetLanguageName}.`);

                // 3. Write to cache (inside the generation block)
                try {
                    await fs.mkdir(CACHE_DIR, { recursive: true }); 
                    await fs.writeFile(cacheFilePath, JSON.stringify(translationMap, null, 2));
                    console.log(`[Action:getTranslations] Wrote generated translations to cache: ${cacheFilePath}`);
                } catch (writeError: unknown) {
                    const message = writeError instanceof Error ? writeError.message : String(writeError);
                    console.error(`[Action:getTranslations] FAILED to write cache file ${cacheFilePath}:`, message);
                    // Still return generated data even if caching fails
                }

                return translationMap;

            } catch (generationError: unknown) {
                const message = generationError instanceof Error ? generationError.message : String(generationError);
                console.error(`[Action:getTranslations] FAILED to generate translations for ${targetLanguageName}:`, message);
                // Throw a new error to avoid exposing internal details potentially
                throw new Error(`Failed to generate translations for ${targetLanguageName}.`); 
            }
        } else {
            // Other file system error (permissions, etc.)
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[Action:getTranslations] Error reading cache file ${cacheFilePath}:`, message);
            throw new Error(`Failed to read translation cache for ${targetLanguageName}.`);
        }
    }
} 