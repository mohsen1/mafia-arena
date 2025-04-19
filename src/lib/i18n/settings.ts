import type { InitOptions } from 'i18next'

// Define supported language codes, their English names, and native labels
export const supportedLanguagesInfo = {
  en: {
    name: "English",
    label: "English",
    code: "en",
    longCode: "en-US",
    dir: "ltr",
  },
  zh: {
    name: "Mandarin Chinese",
    label: "汉语",
    code: "zh",
    longCode: "zh-CN",
    dir: "ltr",
  },
  hi: {
    name: "Hindi",
    label: "हिन्दी",
    code: "hi",
    longCode: "hi-IN",
    dir: "ltr",
  },
  es: {
    name: "Spanish",
    label: "Español",
    code: "es",
    longCode: "es-ES",
    dir: "ltr",
  },
  fr: {
    name: "French",
    label: "Français",
    code: "fr",
    longCode: "fr-FR",
    dir: "ltr",
  },
  ar: {
    name: "Modern Standard Arabic",
    label: "العربية",
    code: "ar",
    longCode: "ar-SA",
    dir: "rtl",
  },
  bn: {
    name: "Bengali",
    label: "বাংলা",
    code: "bn",
    longCode: "bn-BD",
    dir: "ltr",
  },
  pt: {
    name: "Portuguese",
    label: "Português",
    code: "pt",
    longCode: "pt-PT",
    dir: "ltr",
  },
  ru: {
    name: "Russian",
    label: "Русский",
    code: "ru",
    longCode: "ru-RU",
    dir: "ltr",
  },
  ur: {
    name: "Urdu",
    label: "اردو",
    code: "ur",
    longCode: "ur-PK",
    dir: "rtl",
  },
  id: {
    name: "Indonesian",
    label: "Bahasa Indonesia",
    code: "id",
    longCode: "id-ID",
    dir: "ltr",
  },
  de: {
    name: "German",
    label: "Deutsch",
    code: "de",
    longCode: "de-DE",
    dir: "ltr",
  },
  ja: {
    name: "Japanese",
    label: "日本語",
    code: "ja",
    longCode: "ja-JP",
    dir: "ltr",
  },
  sw: {
    name: "Swahili",
    label: "Kiswahili",
    code: "sw",
    longCode: "sw-KE",
    dir: "ltr",
  },
  tr: {
    name: "Turkish",
    label: "Türkçe",
    code: "tr",
    longCode: "tr-TR",
    dir: "ltr",
  },
  vi: {
    name: "Vietnamese",
    label: "Tiếng Việt",
    code: "vi",
    longCode: "vi-VN",
    dir: "ltr",
  },
  ko: {
    name: "Korean",
    label: "한국어",
    code: "ko",
    longCode: "ko-KR",
    dir: "ltr",
  },
  it: {
    name: "Italian",
    label: "Italiano",
    code: "it",
    longCode: "it-IT",
    dir: "ltr",
  },
  th: {
    name: "Thai",
    label: "ภาษาไทย",
    code: "th",
    longCode: "th-TH",
    dir: "ltr",
  },
  fa: {
    name: "Persian",
    label: "فارسی",
    code: "fa",
    longCode: "fa-IR",
    dir: "rtl",
  },
  pl: {
    name: "Polish",
    label: "Polski",
    code: "pl",
    longCode: "pl-PL",
    dir: "ltr",
  },
  uk: {
    name: "Ukrainian",
    label: "Українська",
    code: "uk",
    longCode: "uk-UA",
    dir: "ltr",
  },
  ms: {
    name: "Malay",
    label: "Bahasa Melayu",
    code: "ms",
    longCode: "ms-MY",
    dir: "ltr",
  },
  tl: {
    name: "Filipino",
    label: "Tagalog",
    code: "tl",
    longCode: "tl-PH",
    dir: "ltr",
  },
  ta: {
    name: "Tamil",
    label: "தமிழ்",
    code: "ta",
    longCode: "ta-IN",
    dir: "ltr",
  },
  mr: {
    name: "Marathi",
    label: "मराठी",
    code: "mr",
    longCode: "mr-IN",
    dir: "ltr",
  },
  jv: {
    name: "Javanese",
    label: "Basa Jawa",
    code: "jv",
    longCode: "jv-ID",
    dir: "ltr",
  },
  te: {
    name: "Telugu",
    label: "తెలుగు",
    code: "te",
    longCode: "te-IN",
    dir: "ltr",
  },
  ha: {
    name: "Hausa",
    label: "Hausa",
    code: "ha",
    longCode: "ha-NG",
    dir: "ltr",
  },
  my: {
    name: "Burmese",
    label: "မြန်မာဘာသာ",
    code: "my",
    longCode: "my-MM",
    dir: "ltr",
  },
};

// Type for the language codes (e.g., 'en', 'fa')
export type LanguageCode = keyof typeof supportedLanguagesInfo;

// Type for the full English language names (e.g., 'English', 'Persian')
export type LanguageName =
  (typeof supportedLanguagesInfo)[LanguageCode]["name"];

// Array of available language codes derived from the info object
export const languages = Object.keys(
  supportedLanguagesInfo,
) as LanguageCode[];

export const fallbackLng = 'en'
export const defaultNS = 'translation' // Assuming 'translation' is your primary namespace based on dictionary filenames

// Utility functions moved from languages.ts
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

export function mapLanguageCodeToLongCode(
  code: LanguageCode,
): string | undefined {
  return supportedLanguagesInfo[code]?.longCode;
}

export function getLanguageInfoByCode(
  code: LanguageCode,
): (typeof supportedLanguagesInfo)[LanguageCode] {
  return supportedLanguagesInfo[code];
}

export function getLanguageInfoByName(
  name: LanguageName | string,
): (typeof supportedLanguagesInfo)[LanguageCode] | undefined {
  const code = mapLanguageNameToCode(name);
  return code ? supportedLanguagesInfo[code] : undefined;
}

// i18next options function
export function getOptions (lng: string = fallbackLng, ns: string | string[] = defaultNS): InitOptions {
  return {
    supportedLngs: languages,
    fallbackLng,
    lng,
    fallbackNS: defaultNS,
    defaultNS,
    ns
  }
} 