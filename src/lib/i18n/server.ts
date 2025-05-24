import type { LanguageCode } from './settings';
import { fallbackLng } from './settings';

// Import all dictionary files
import enTranslation from '@/dictionaries/en.json';
import zhTranslation from '@/dictionaries/zh.json';
import hiTranslation from '@/dictionaries/hi.json';
import esTranslation from '@/dictionaries/es.json';
import frTranslation from '@/dictionaries/fr.json';
import arTranslation from '@/dictionaries/ar.json';
import bnTranslation from '@/dictionaries/bn.json';
import ptTranslation from '@/dictionaries/pt.json';
import ruTranslation from '@/dictionaries/ru.json';
import urTranslation from '@/dictionaries/ur.json';
import idTranslation from '@/dictionaries/id.json';
import deTranslation from '@/dictionaries/de.json';
import jaTranslation from '@/dictionaries/ja.json';
import swTranslation from '@/dictionaries/sw.json';
import trTranslation from '@/dictionaries/tr.json';
import viTranslation from '@/dictionaries/vi.json';
import koTranslation from '@/dictionaries/ko.json';
import itTranslation from '@/dictionaries/it.json';
import thTranslation from '@/dictionaries/th.json';
import faTranslation from '@/dictionaries/fa.json';
import plTranslation from '@/dictionaries/pl.json';
import ukTranslation from '@/dictionaries/uk.json';
import msTranslation from '@/dictionaries/ms.json';
import tlTranslation from '@/dictionaries/tl.json';
import taTranslation from '@/dictionaries/ta.json';
import mrTranslation from '@/dictionaries/mr.json';
import jvTranslation from '@/dictionaries/jv.json';
import teTranslation from '@/dictionaries/te.json';
import haTranslation from '@/dictionaries/ha.json';
import myTranslation from '@/dictionaries/my.json';

type Dictionary = Record<string, string | Record<string, string | Record<string, string>>>;

const dictionaries: Record<LanguageCode, Dictionary> = {
  en: enTranslation,
  zh: zhTranslation,
  hi: hiTranslation,
  es: esTranslation,
  fr: frTranslation,
  ar: arTranslation,
  bn: bnTranslation,
  pt: ptTranslation,
  ru: ruTranslation,
  ur: urTranslation,
  id: idTranslation,
  de: deTranslation,
  ja: jaTranslation,
  sw: swTranslation,
  tr: trTranslation,
  vi: viTranslation,
  ko: koTranslation,
  it: itTranslation,
  th: thTranslation,
  fa: faTranslation,
  pl: plTranslation,
  uk: ukTranslation,
  ms: msTranslation,
  tl: tlTranslation,
  ta: taTranslation,
  mr: mrTranslation,
  jv: jvTranslation,
  te: teTranslation,
  ha: haTranslation,
  my: myTranslation,
};

/**
 * Server-side translation function for the game engine
 * @param key - The translation key (supports dot notation like 'profile.title')
 * @param language - The language code to translate to
 * @param replacements - Object containing variable replacements (e.g., {round: 1})
 * @returns The translated string with variables replaced
 */
export function translate(
  key: string, 
  language: LanguageCode | string = fallbackLng, 
  replacements: Record<string, string | number> = {}
): string {
  // Normalize language to LanguageCode
  const lang = language in dictionaries ? language as LanguageCode : fallbackLng as LanguageCode;
  
  // Get the dictionary for the specified language, fallback to English
  const dictionary = dictionaries[lang] || dictionaries[fallbackLng as LanguageCode];
  
  // Helper function to get nested value from object using dot notation
  const getNestedValue = (obj: Dictionary, path: string): string | undefined => {
    const keys = path.split('.');
    let current: unknown = obj;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }
    
    return typeof current === 'string' ? current : undefined;
  };
  
  // Get the translation, fallback to English if not found
  let translation = getNestedValue(dictionary, key);
  if (!translation && lang !== fallbackLng) {
    translation = getNestedValue(dictionaries[fallbackLng as LanguageCode], key);
  }
  
  // If still no translation found, return the key itself
  if (!translation) {
    console.warn(`Translation missing for key: ${key} in language: ${lang}`);
    return key;
  }
  
  // Replace variables in the translation
  let result = translation;
  for (const [variable, value] of Object.entries(replacements)) {
    const placeholder = `{{${variable}}}`;
    result = result.replace(new RegExp(placeholder, 'g'), String(value));
  }
  
  return result;
}

/**
 * Helper function to get the appropriate language code from various language formats
 */
export function normalizeLanguageCode(language: string | undefined): LanguageCode {
  if (!language) return fallbackLng as LanguageCode;
  
  // Handle common language variations
  const normalized = language.toLowerCase().split('-')[0];
  
  return (normalized in dictionaries ? normalized : fallbackLng) as LanguageCode;
} 