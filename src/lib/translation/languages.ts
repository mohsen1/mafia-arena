// Define supported language codes, their English names, and native labels
export const supportedLanguagesInfo = {
    en: { name: "English", label: "English", code: "en" },
    zh: { name: "Mandarin Chinese", label: "汉语", code: "zh" },
    hi: { name: "Hindi", label: "हिन्दी", code: "hi" },
    es: { name: "Spanish", label: "Español", code: "es" },
    fr: { name: "French", label: "Français", code: "fr" },
    ar: { name: "Modern Standard Arabic", label: "العربية", code: "ar" },
    bn: { name: "Bengali", label: "বাংলা", code: "bn" },
    pt: { name: "Portuguese", label: "Português", code: "pt" },
    ru: { name: "Russian", label: "Русский", code: "ru" },
    ur: { name: "Urdu", label: "اردو", code: "ur" },
    id: { name: "Indonesian", label: "Bahasa Indonesia", code: "id" },
    de: { name: "German", label: "Deutsch", code: "de" },
    ja: { name: "Japanese", label: "日本語", code: "ja" },
    sw: { name: "Swahili", label: "Kiswahili", code: "sw" },
    tr: { name: "Turkish", label: "Türkçe", code: "tr" },
    vi: { name: "Vietnamese", label: "Tiếng Việt", code: "vi" },
    ko: { name: "Korean", label: "한국어", code: "ko" },
    it: { name: "Italian", label: "Italiano", code: "it" },
    th: { name: "Thai", label: "ภาษาไทย", code: "th" },
    fa: { name: "Persian", label: "فارسی", code: "fa" },
    pl: { name: "Polish", label: "Polski", code: "pl" },
    uk: { name: "Ukrainian", label: "Українська", code: "uk" },
    ms: { name: "Malay", label: "Bahasa Melayu", code: "ms" },
    tl: { name: "Filipino", label: "Tagalog", code: "tl" }, // Tagalog is often used for Filipino
    ta: { name: "Tamil", label: "தமிழ்", code: "ta" },
    mr: { name: "Marathi", label: "मराठी", code: "mr" },
    jv: { name: "Javanese", label: "Basa Jawa", code: "jv" },
    te: { name: "Telugu", label: "తెలుగు", code: "te" },
    ha: { name: "Hausa", label: "Hausa", code: "ha" },
    my: { name: "Burmese", label: "မြန်မာဘာသာ", code: "my" },
  }
  

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


// --- Types ---
// Export these types for use in actions.ts
export interface TranslationEntry {
  phrase: string;
  translation: string;
  description: string;
  preTranslated?: boolean; // Added optional flag
}
export type DictionaryData = Partial<Record<LanguageCode, TranslationEntry[]>>;
