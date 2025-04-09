const path = require('node:path');

/** @type {import('next-i18next').UserConfig} */
module.exports = {
  // https://www.i18next.com/overview/configuration-options
  i18n: {
    // Define all supported language codes here
    locales: ['en', 'de', 'fa'],
    // Set the default language
    defaultLocale: 'en',
    // Disable locale detection based on browser/header (we'll use routing)
    localeDetection: false,
  },
  /**
   * @link https://github.com/i18next/next-i18next#6-advanced-configuration
   */
  // localePath: path.resolve('./public/locales'), // Default path
  localePath: path.resolve('./data/translations'), // Use our existing cache path
  reloadOnPrerender: process.env.NODE_ENV === 'development',
  // If you have namespaces in your translations, specify them here, otherwise remove or set to false
  // defaultNS: 'common', // Example default namespace
  // ns: ['common', 'home'], // Example list of namespaces

  // --- Optional configuration options ---
  // debug: process.env.NODE_ENV === 'development',
  // serializeConfig: false, // Recommended for App Router
  // use: [], // Add i18next plugins here if needed
}; 