import { createInstance, type i18n as I18nInstanceType, type Resource } from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { initReactI18next } from 'react-i18next/initReactI18next';
import i18nConfig from '../../next-i18next.config';

// Initialize the i18next instance
export default async function initTranslations(
  locale: string,
  namespaces: string | string[] = ['translation'], // Default namespace
  i18nInstanceParam?: I18nInstanceType, // Use imported type, rename param
  resources?: Resource, // Use i18next Resource type
) {
  // Create a new instance or use the one passed in
  const instance = i18nInstanceParam || createInstance();

  instance.use(initReactI18next);

  // Only configure backend loading if resources aren't provided
  if (!resources) {
    instance.use(
      resourcesToBackend(
        (language: string, /* namespace: string */) => {
          const localePath = i18nConfig.localePath;
          // Type guard and check for string type
          if (typeof localePath === 'string') {
            // Dynamically import the JSON file from our cache/locale path
            const relativePath = localePath.replace(/^\.\//, '').replace(/\\/g, '/');
            // Adjust path based on namespace assumption (single file per lang)
            return import(`../../${relativePath}/${language}.json`);
          }
          // Code here only runs if localePath was NOT a string
          console.error('[i18n init] localePath is not a valid string in config:', localePath);
          // Return a promise resolving to null or an empty object to avoid breaking import()
          return Promise.resolve({});
        }
      ),
    );
  }

  await instance.init({
    lng: locale,
    resources,
    fallbackLng: i18nConfig.i18n.defaultLocale,
    supportedLngs: i18nConfig.i18n.locales,
    defaultNS: Array.isArray(namespaces) ? namespaces[0] : namespaces,
    fallbackNS: Array.isArray(namespaces) ? namespaces[0] : namespaces,
    ns: Array.isArray(namespaces) ? namespaces : [namespaces],
    preload: resources ? [] : i18nConfig.i18n.locales,
    // debug: i18nConfig.debug, // Uncomment for debugging
  });

  return {
    i18n: instance,
    resources: instance.services.resourceStore.data,
    t: instance.t,
  };
}

// Helper function specifically for server components
export async function createTranslation(lang: string, ns: string | string[]) {
  return initTranslations(lang, ns);
} 