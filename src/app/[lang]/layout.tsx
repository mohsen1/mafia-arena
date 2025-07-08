'use client';

// Use local fonts instead of Google Fonts to avoid CI issues
import { ThemeProvider } from '@/components/ThemeProvider';
import { SessionProvider } from 'next-auth/react';
import '../globals.css';

import { type LanguageCode, defaultNS } from '@/lib/i18n/settings';
import i18nInstance from '@/lib/i18n/client';
import { I18nextProvider } from 'react-i18next';
import { use, useEffect } from 'react';
import { Toaster } from '@/components/ui/toaster';

// Use system fonts as fallback for CI environments
const geistSans = {
  variable: '--font-geist-sans',
  className: '',
  style: {
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
  },
};
const geistMono = {
  variable: '--font-geist-mono',
  className: '',
  style: {
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
  },
};

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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SessionProvider>
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
        </SessionProvider>
      </body>
    </html>
  );
}
