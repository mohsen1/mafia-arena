#!/usr/bin/env tsx

/**
 * Enhanced Translation Generation Script
 * 
 * This script generates translations for all supported languages using the Google Translate API.
 * It intelligently handles context-aware translations and maintains consistent terminology.
 */

import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dedent from 'dedent';
import { languages, supportedLanguagesInfo, type LanguageCode } from '../../src/lib/i18n/settings';
import { getAIResponse, getStructuredAIResponse } from '../../src/lib/services/googleService';

// Load environment variables from .env file
dotenv.config();

// Validate required environment variables
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ Error: GEMINI_API_KEY environment variable is required.');
  console.error('Please set it in your .env file or environment variables.');
  process.exit(1);
}

/**
 * Generates the system prompt for translating a dictionary JSON.
 */
export const getPrompt = (
  sourceDictionaryJsonString: string,
  targetLanguage: string
) => {
  return dedent`You are an expert translation assistant specializing in game localization.
  Your task is to translate the VALUES of the following JSON dictionary from English
  to the target language: **<targetLanguage>${targetLanguage}</targetLanguage>**.\n\n

  Note that in some languages and cultures this game is called "Mafia" instead of "Werewolf".
  Mafia is a common name for this game in many languages.
	•	ar (Arabic) – مافيا (Mafia)
	•	bn (Bengali) – মাফিয়া (Mafia)
	•	de (German) – Mafia
	•	en (English) – Mafia
	•	fa (Persian) – مافیا (Mafia)
	•	fr (French) – Mafia (but Loup-Garou also common in France)
	•	hi (Hindi) – माफिया (Mafia)
	•	id (Indonesian) – Mafia
	•	it (Italian) – Mafia
	•	ja (Japanese) – マフィア (Mafia)
	•	ko (Korean) – 마피아 게임 (Mafia Game)
	•	mr (Marathi) – माफिया (Mafia)
	•	ms (Malay) – Mafia
	•	pl (Polish) – Mafia
	•	pt (Portuguese) – Máfia
	•	ru (Russian) – Мафия (Mafiya)
	•	tr (Turkish) – Mafya
	•	uk (Ukrainian) – Мафія
	•	ur (Urdu) – مافیا (Mafia)
	•	vi (Vietnamese) – Mafia
	•	zh (Chinese) – 黑手党游戏 or just 黑手党 (Mafia)

  **RULES:**\n  1.  Translate ONLY the string values associated with each key.\n  2.  Keep the JSON keys EXACTLY the same.\n  3.  Maintain the original JSON structure (key-value pairs).\n  4.  Preserve any placeholder variables like \`{{variableName}}\` exactly as they appear in the original English value.\n  5.  Ensure the output is ONLY a single, valid JSON object containing the translated key-value pairs.\n  6.  Use natural and contextually appropriate translations for a Werewolf/Mafia style social deduction game.\n\n

  **English Dictionary JSON:**
  \`\`\`json
  <sourceDictionary>${sourceDictionaryJsonString}</sourceDictionary>
  \`\`\`\n\n

  Respond ONLY with the translated JSON object for the target language (<targetLanguage>${targetLanguage}</targetLanguage>).
  Do NOT include any explanatory text, apologies, or markdown formatting outside the JSON object.`;
};

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const dictionariesDir = path.join(projectRoot, 'src', 'dictionaries');
const sourceLang = 'en';
const sourceFile = path.join(dictionariesDir, `${sourceLang}.json`);

// Parse CLI arguments for single language option
const args = process.argv.slice(2);
let specifiedLang: LanguageCode | undefined;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--lang=')) {
    specifiedLang = arg.split('=')[1] as LanguageCode;
  } else if (arg === '--lang' && args[i + 1]) {
    specifiedLang = args[i + 1] as LanguageCode;
  }
}
if (specifiedLang) {
  if (!languages.includes(specifiedLang)) {
    console.error(`❌ Error: Language '${specifiedLang}' is not supported.`);
    process.exit(1);
  }
  if (specifiedLang === sourceLang) {
    console.error(`❌ Error: Cannot translate source language '${sourceLang}'.`);
    process.exit(1);
  }
  console.log(`Using single language: ${specifiedLang}`);
}
const targetLangs = specifiedLang ? [specifiedLang] : languages.filter(lang => lang !== sourceLang);

interface Dictionary { [key: string]: string; }

// --- Helper Functions ---

async function loadJson(filePath: string): Promise<Dictionary | null> {
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(fileContent) as Dictionary;
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error loading JSON from ${path.basename(filePath)}:`, message);
    return {}; 
  }
}

async function saveJson(filePath: string, data: Dictionary): Promise<void> {
  try {
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`✅ Saved updated dictionary: ${path.basename(filePath)}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Error saving JSON to ${path.basename(filePath)}:`, message);
  }
}

async function translateDictionary(dictToTranslate: Dictionary, targetLangCode: LanguageCode): Promise<Dictionary | null> {
  if (Object.keys(dictToTranslate).length === 0) {
    console.log(`\tNo missing keys to translate for ${targetLangCode}.`);
    return {};
  }

  const targetLangName = supportedLanguagesInfo[targetLangCode]?.name || targetLangCode;
  const totalKeys = Object.keys(dictToTranslate);
  const batchSize = 50; // Process 50 keys at a time
  const batches: Array<{ [key: string]: string }> = [];
  
  // Split into batches
  for (let i = 0; i < totalKeys.length; i += batchSize) {
    const batchKeys = totalKeys.slice(i, i + batchSize);
    const batch: { [key: string]: string } = {};
    for (const key of batchKeys) {
      batch[key] = dictToTranslate[key];
    }
    batches.push(batch);
  }

  console.log(`\tTranslating ${totalKeys.length} missing key(s) to ${targetLangName} (${targetLangCode}) in ${batches.length} batches...`);
  
  const translatedDict: Dictionary = {};

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchNumber = i + 1;
    console.log(`\t  Processing batch ${batchNumber}/${batches.length} (${Object.keys(batch).length} keys)...`);
    
    try {
      const sourceJsonString = JSON.stringify(batch, null, 2);
      const systemPrompt = getPrompt(sourceJsonString, targetLangName);
      const messages = [{ role: 'system' as const, content: systemPrompt }];

      // Create schema for the translation response
      const responseSchema: Record<string, { type: string; description?: string }> = {};
      for (const key of Object.keys(batch)) {
        responseSchema[key] = {
          type: 'string',
          description: `Translation of the key "${key}" to ${targetLangName}`
        };
      }

      // Use function calling for structured response
      const batchTranslatedDict = await getStructuredAIResponse(
        messages,
        'script-dict-translate-missing',
        targetLangCode,
        'translate_dictionary',
        `Translate dictionary keys from English to ${targetLangName}`,
        responseSchema,
        {
          model: 'gemini-2.0-flash-exp',
          temperature: 0.1,
          max_tokens: 8192
        }
      ) as Dictionary;

      if (typeof batchTranslatedDict !== 'object' || batchTranslatedDict === null || Array.isArray(batchTranslatedDict)) {
        throw new Error(`Function call response for ${targetLangCode} batch ${batchNumber} was not a valid object.`);
      }

      // Merge batch results
      Object.assign(translatedDict, batchTranslatedDict);
      console.log(`\t  ✔️ Batch ${batchNumber} completed successfully.`);

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\t  ❌ Error during batch ${batchNumber} translation for ${targetLangCode}:`, message);
      console.log('\t  Continuing with next batch...');
    }
  }

  if (Object.keys(translatedDict).length === 0) {
    console.error(`\t❌ No translations were successful for ${targetLangCode}.`);
    return null;
  }

  console.log(`\t✔️ Function call translation completed for ${targetLangCode}. Translated ${Object.keys(translatedDict).length}/${totalKeys.length} keys.`);
  return translatedDict;
}

// --- Main Execution --- 

(async () => {
  console.log('\n🔄 Starting translation generation process...');
  console.log(`Source dictionary: ${path.basename(sourceFile)}`);
  console.log(`Target languages: ${targetLangs.join(', ')}`);
  console.log('Using AI model: gemini-1.5-flash');

  const sourceDictionary = await loadJson(sourceFile);
  if (!sourceDictionary) {
    console.error(`❌ Critical error: Source dictionary ${sourceFile} could not be loaded.`);
    process.exit(1);
  }
  const sourceKeys = new Set(Object.keys(sourceDictionary));
  console.log(`Loaded source dictionary with ${sourceKeys.size} keys.`);

  for (const lang of targetLangs) {
    console.log(`\nProcessing language: ${lang}...`);
    const targetFile = path.join(dictionariesDir, `${lang}.json`);

    const existingDictionary = await loadJson(targetFile);
    const existingKeys = new Set(existingDictionary ? Object.keys(existingDictionary) : []);
    
    if (existingDictionary) {
      console.log(`\tFound existing dictionary with ${existingKeys.size} keys.`);
    } else {
      console.log('\tNo existing dictionary found. Will create new file.');
    }

    const missingKeysDict: Dictionary = {};
    const keysToRemove: string[] = [];
    for (const key of sourceKeys) {
      if (!existingKeys.has(key)) {
        missingKeysDict[key] = sourceDictionary[key];
      }
    }
    for (const key of existingKeys) {
      if (!sourceKeys.has(key)) {
        keysToRemove.push(key);
      }
    }

    console.log(`\tFound ${Object.keys(missingKeysDict).length} missing keys.`);
    if (keysToRemove.length > 0) {
      console.warn(`\tFound ${keysToRemove.length} obsolete keys to remove: ${keysToRemove.join(', ')}`);
    }

    const newlyTranslatedDict = await translateDictionary(missingKeysDict, lang as LanguageCode);

    if (newlyTranslatedDict === null) {
        console.error(`\tSkipping update for ${lang} due to translation error.`);
        continue;
    }

    const finalDictionary = { ...(existingDictionary || {}) };

    for (const key in newlyTranslatedDict) {
      if (Object.prototype.hasOwnProperty.call(newlyTranslatedDict, key)) {
         if (newlyTranslatedDict[key] && newlyTranslatedDict[key] !== missingKeysDict[key]) { 
            finalDictionary[key] = newlyTranslatedDict[key];
         } else {
            console.warn(`\t⚠️ LLM did not provide a translation for new key \"${key}\" in ${lang}, using source value.`);
            finalDictionary[key] = missingKeysDict[key];
         }
      }
    }

    for (const key of keysToRemove) {
      delete finalDictionary[key];
    }

    console.log(`\tSaving final dictionary for ${lang}...`);
    await saveJson(targetFile, finalDictionary);
  }

  console.log('\n✨ Translation generation complete! ✨');
})(); 