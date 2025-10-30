'use client';

import { ThemeProvider } from '@/components/ThemeProvider';
import { UnifiedSessionProvider } from '@/components/auth/UnifiedSessionProvider';
import '../globals.css';

import { type LanguageCode, defaultNS } from '@/lib/i18n/settings';
import i18nInstance from '@/lib/i18n/client';
import { I18nextProvider } from 'react-i18next';
import { use, useEffect } from 'react';
import { Toaster } from '@/components/ui/toaster';

export default function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: LanguageCode }>;
}>) {
  const { lang } = use(params);

  // Ensure the language is loaded
  useEffect(() => {
    if (i18nInstance.language !== lang) {
      i18nInstance.changeLanguage(lang);
    }
  }, [lang]);

  const direction = i18nInstance.dir(lang);

  return (
    <html lang={lang} dir={direction} suppressHydrationWarning>
      <head>
        <meta
          name="keywords"
          content="werewolf, ai, game, social deduction, mafia, party game"
        />
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="antialiased">
        <UnifiedSessionProvider>
          <I18nextProvider i18n={i18nInstance} defaultNS={defaultNS}>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              {children}
              <Toaster />
            </ThemeProvider>
          </I18nextProvider>
        </UnifiedSessionProvider>
      </body>
    </html>
  );
}
