import 'server-only';
import fs from 'node:fs/promises'; // Use node: prefix
import path from 'node:path'; // Use node: prefix
import { getAIResponse } from '@/lib/ai/openaiService'; // Import AI service
import { TRANSLATE_DICTIONARY_PROMPT } from '@/lib/ai/PROMPTS'; // Import prompt
import { cleanAIResponse, extractJSONFromText } from '@/lib/utils/stringUtils'; // Import utils

// Define the type for your dictionary
type DictionaryValue = string | NestedDictionary;
interface NestedDictionary {
    [key: string]: DictionaryValue;
}
interface Dictionary extends NestedDictionary {}

// --- Actual LLM Translation Function --- 
async function translateDictionaryWithLLM(
  sourceDictionary: Dictionary,
  targetLocale: string,
  modelName: string // e.g., 'meta-llama/llama-4-maverick-17b-128e-instruct'
): Promise<Dictionary> {
  console.log(`[translateDictionaryWithLLM] Requesting translation for locale '${targetLocale}' using ${modelName}.`);

  try {
    const sourceJsonString = JSON.stringify(sourceDictionary, null, 2);
    const systemPrompt = TRANSLATE_DICTIONARY_PROMPT(sourceJsonString, targetLocale);

    const messages = [{ role: 'system' as const, content: systemPrompt }];

    // Use getAIResponse from openaiService
    const responseJsonString = await getAIResponse(
      messages,
      'dictionary-translation', // Context identifier
      targetLocale, // Use locale as context identifier
      {
        model: modelName,
        temperature: 0.2, // Lower temperature for more deterministic translation
        response_format: { type: "json_object" }, // Request JSON output
      }
    );

    if (!responseJsonString) {
      throw new Error("LLM returned an empty response for translation.");
    }

    const cleanedContent = cleanAIResponse(responseJsonString);
    const cleanedJsonString = extractJSONFromText(cleanedContent); // Extract JSON from potential markdown

    try {
      const translatedDictionary = JSON.parse(cleanedJsonString) as Dictionary;
      console.log(`[translateDictionaryWithLLM] Successfully parsed translation for locale '${targetLocale}'.`);
      return translatedDictionary;
    } catch (parseError) {
      console.error(`[translateDictionaryWithLLM] Failed to parse JSON response for ${targetLocale}:`, parseError);
      console.error("[translateDictionaryWithLLM] Raw LLM Response:", responseJsonString);
      throw new Error(`Failed to parse translation JSON from LLM for locale ${targetLocale}.`);
    }

  } catch (error) {
    console.error(`[translateDictionaryWithLLM] Error during LLM translation call for ${targetLocale}:`, error);
    throw error; // Re-throw to be caught by getDictionary
  }
}
// --- End of LLM Translation Function --- 

// Import using the path alias
import enDict from '@/app/en/dictionaries/translation.json';
import deDict from '@/app/de/dictionaries/translation.json';
import faDict from '@/app/fa/dictionaries/translation.json';
import arDict from '@/app/ar/dictionaries/translation.json'; // Added ar

const dictionaries: Record<Locale, Dictionary> = {
  en: enDict as Dictionary, // Cast to Dictionary type
  de: deDict as Dictionary, // Cast to Dictionary type
  fa: faDict as Dictionary, // Cast to Dictionary type
  ar: arDict as Dictionary, // Added ar, cast
  // ... add other languages ...
};

// Type for the default locale
export type Locale = 'en' | 'de' | 'fa' | 'ar'; // Only 'en', 'de', 'fa', and 'ar' are statically known

const defaultLocale: Locale = 'en';
const llmModelName = 'meta-llama/llama-4-maverick-17b-128e-instruct';

// Helper to ensure directory exists
async function ensureDirectoryExistence(filePath: string) {
  const dirname = path.dirname(filePath);
  try {
    await fs.access(dirname);
  } catch (error: unknown) { // Type error as unknown
    // Check if error is an object with a code property
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      await fs.mkdir(dirname, { recursive: true });
    } else {
      throw error; // Re-throw other errors
    }
  }
}

export const getDictionary = async (locale: string): Promise<Dictionary> => {
  const dictionaryFilePath = path.join(process.cwd(), 'src', 'app', '[lang]', 'dictionaries', `${locale}.json`);

  // 1. Try to load from filesystem cache first
  try {
    await fs.access(dictionaryFilePath);
    console.log(`[getDictionary] Loading cached dictionary for locale: ${locale} from ${dictionaryFilePath}`);
    const fileContent = await fs.readFile(dictionaryFilePath, 'utf-8');
    return JSON.parse(fileContent) as Dictionary;
  } catch (error: unknown) { // Type error as unknown
     // Check if error is an object with a code property before accessing code
    if (typeof error === 'object' && error !== null && 'code' in error && error.code !== 'ENOENT') {
      console.error(`[getDictionary] Error accessing cached dictionary for ${locale}:`, error);
    }
    console.log(`[getDictionary] Cached dictionary for locale '${locale}' not found.`);
  }

  // 2. If locale is 'en' and not found in cache (edge case), load static default
  if (locale === defaultLocale) {
    console.warn(`[getDictionary] Default locale '${locale}' not found in cache, loading static.`);
    const enLoader = dictionaries[defaultLocale];
    if (enLoader) return enLoader(); // Check if loader exists before calling
    throw new Error("Static default English dictionary failed to load.");
  }

  // 3. If not cached and not 'en', attempt LLM translation
  console.log(`[getDictionary] Attempting LLM translation for locale: ${locale}`);
  try {
    const enLoader = dictionaries[defaultLocale];
    if (!enLoader) throw new Error("Could not find static loader for default dictionary.");
    const sourceDictionary = await enLoader();
    if (!sourceDictionary) throw new Error("Could not load source dictionary for translation.");

    // Call the *actual* LLM translation function
    const translatedDictionary = await translateDictionaryWithLLM(
      sourceDictionary,
      locale,
      llmModelName
    );

    // Save the generated dictionary to filesystem cache
    try {
      await ensureDirectoryExistence(dictionaryFilePath);
      await fs.writeFile(dictionaryFilePath, JSON.stringify(translatedDictionary, null, 2));
      console.log(`[getDictionary] Saved generated dictionary to ${dictionaryFilePath}`);
    } catch (saveError) {
      console.error(`[getDictionary] Failed to save generated dictionary for ${locale}:`, saveError);
    }

    return translatedDictionary;

  } catch (llmError) {
    console.error(`[getDictionary] LLM translation failed for locale ${locale}:`, llmError);
    console.warn(`[getDictionary] Falling back to default dictionary (${defaultLocale}) for locale ${locale}.`);
    const enLoader = dictionaries[defaultLocale];
    if (enLoader) return enLoader(); // Check if loader exists
    return {}; // Return empty object as last resort
  }
}; 