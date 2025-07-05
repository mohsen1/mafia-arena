'use client';

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import {
  languages,
  fallbackLng,
  defaultNS,
  type LanguageCode,
} from './settings';

// Initialize i18next with dynamic resource loading
i18next
  .use(initReactI18next)
  .use(
    resourcesToBackend(
      (language: string, namespace: string) =>
        import(`@/dictionaries/${language}.json`)
    )
  )
  .init({
    lng: fallbackLng,
    fallbackLng,
    ns: [defaultNS],
    defaultNS,
    supportedLngs: languages,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false, // Important for SSR
    },
  });

export default i18next;

/**
 * Hook to ensure the language is loaded before rendering
 * This prevents hydration mismatches
 */
export async function ensureLanguageLoaded(language: LanguageCode) {
  if (i18next.language !== language) {
    await i18next.changeLanguage(language);
  }
}
