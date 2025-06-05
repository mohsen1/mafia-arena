import { createInstance } from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { languages, fallbackLng, defaultNS, type LanguageCode } from './settings';

import enTranslation from '@/dictionaries/en.json';

const initI18next = async (lng: LanguageCode) => {
  const i18nInstance = createInstance();
  await i18nInstance
    .use(
      resourcesToBackend(() => {
        return enTranslation;
      })
    )
    .init({
      lng,
      fallbackLng,
      supportedLngs: languages,
      defaultNS,
      ns: [defaultNS],
      interpolation: {
        escapeValue: false,
      },
    });
  return i18nInstance;
};

export async function getTranslation(
  lng: LanguageCode,
  ns = defaultNS
) {
  const i18nextInstance = await initI18next(lng);
  return {
    t: i18nextInstance.getFixedT(lng, Array.isArray(ns) ? ns[0] : ns),
    i18n: i18nextInstance,
  };
}

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
  const getNestedValue = (obj: Record<string, unknown>, path: string): string | undefined => {
    const keys = path.split('.');
    let current: unknown = obj;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && current !== null && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }
    
    return typeof current === 'string' ? current : undefined;
  };

  const translation = getNestedValue(enTranslation, key);
  
  if (!translation) {
    console.warn(`Translation missing for key: ${key} in language: ${language}`);
    return key;
  }

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
  
  const normalized = language.toLowerCase().split('-')[0];
  
  return (languages.includes(normalized as LanguageCode) ? normalized : fallbackLng) as LanguageCode;
} 