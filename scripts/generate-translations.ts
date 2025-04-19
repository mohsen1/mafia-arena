import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load environment variables from .env file
dotenv.config();

// Update import paths for TS
import { languages, supportedLanguagesInfo, type LanguageCode } from '../src/lib/i18n/settings';
import { getAIResponse } from '../src/lib/ai/openaiService'; 
import { TRANSLATE_DICTIONARY_PROMPT } from '../src/lib/ai/PROMPTS'; 
import { cleanAIResponse, extractJSONFromText } from '../src/lib/utils/stringUtils'; 

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
const llmModelName = process.env.DEFAULT_TRANSLATION_MODEL || 'meta-llama/Meta-Llama-3-8B-Instruct';

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
  console.log(`\tTranslating ${Object.keys(dictToTranslate).length} missing key(s) to ${targetLangName} (${targetLangCode}) using ${llmModelName}...`);
  let responseString: string | undefined = undefined;

  try {
    const sourceJsonString = JSON.stringify(dictToTranslate, null, 2);
    const systemPrompt = TRANSLATE_DICTIONARY_PROMPT(sourceJsonString, targetLangName);
    const messages = [{ role: 'system' as const, content: systemPrompt }];

    responseString = await getAIResponse(
      messages,
      'script-dict-translate-missing',
      targetLangCode,
      {
        model: llmModelName,
        temperature: 0.1, 
        response_format: { type: "json_object" },
      }
    );

    if (!responseString) throw new Error("LLM returned empty response.");

    const cleanedContent = cleanAIResponse(responseString);
    const jsonString = extractJSONFromText(cleanedContent);
    const translatedDict = JSON.parse(jsonString) as Dictionary;

    if (typeof translatedDict !== 'object' || translatedDict === null || Array.isArray(translatedDict)) {
      throw new Error(`LLM response for ${targetLangCode} was not a valid JSON object.`);
    }

    console.log(`\t✔️ LLM translation successful for ${targetLangCode}.`);
    return translatedDict;

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\t❌ Error during LLM translation for ${targetLangCode}:`, message);
    if (error instanceof SyntaxError && responseString) {
      console.error("\tRaw LLM Response on parse fail:", responseString);
    }
    return null; 
  }
}

// --- Main Execution --- 

(async () => {
  console.log('\n🔄 Starting translation generation process...');
  console.log(`Source dictionary: ${path.basename(sourceFile)}`);
  console.log(`Target languages: ${targetLangs.join(', ')}`);

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