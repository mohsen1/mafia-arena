const path = require('node:path');

/** @type {import('next-i18next').UserConfig} */
module.exports = {
  // https://www.i18next.com/overview/configuration-options
  i18n: {
    // Define all supported language codes here
    locales: [
      'en', 'zh', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'ur', 
      'id', 'de', 'ja', 'sw', 'tr', 'vi', 'ko', 'it', 'th', 'fa', 
      'pl', 'uk', 'ms', 'tl', 'ta', 'mr', 'jv', 'te', 'ha', 'my'
    ],
    // Set the default language
    defaultLocale: 'en',
    // Disable locale detection based on browser/header (we'll use routing)
    localeDetection: false,
  },
  /**
   * @link https://github.com/i18next/next-i18next#6-advanced-configuration
   */
  // localePath is handled by custom App Router setup, remove here
  // localePath: path.resolve('./src/app/[lang]/dictionaries'),
  reloadOnPrerender: process.env.NODE_ENV === 'development',
  // If you have namespaces in your translations, specify them here, otherwise remove or set to false
  // defaultNS: 'translation', // Assuming 'translation' might be the default/only namespace
  // ns: ['translation'],

  // --- Optional configuration options ---
  // debug: process.env.NODE_ENV === 'development',
  // serializeConfig: false, // Recommended for App Router
  // use: [], // Add i18next plugins here if needed
}; 