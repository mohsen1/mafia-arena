'use client';

import { I18nextProvider } from 'react-i18next';
import { createInstance, type Resource } from 'i18next';
import initTranslations from './i18n'; // Import server init function
import type { ReactNode } from 'react';

interface TranslationsProviderProps {
  children: ReactNode;
  locale: string;
  namespaces: string[];
  resources?: Resource; // Allow passing resources directly
}

export default function TranslationsProvider({ 
  children,
  locale,
  namespaces,
  resources
}: TranslationsProviderProps) {
  // Initialize i18next instance on the client
  const i18n = createInstance();

  // Initialize with resources passed from server
  initTranslations(locale, namespaces, i18n, resources);

  return (
    <I18nextProvider i18n={i18n}>
      {children}
    </I18nextProvider>
  );
} 