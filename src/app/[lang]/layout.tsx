'use client';

import { Geist, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/ThemeProvider';
import { SessionProvider } from 'next-auth/react';
import '../globals.css';

import { type LanguageCode, defaultNS } from '@/lib/i18n/settings';
import i18nInstance from '@/lib/i18n/i18n.client';
import { I18nextProvider } from 'react-i18next';
import { use } from 'react';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export default function RootLayout({
  children,
  params: paramsProp,
}: Readonly<{
  children: React.ReactNode;
  params: { lang: LanguageCode };
}>) {
  const params = use(
    paramsProp as unknown as Promise<{ lang: LanguageCode }>
  ) as { lang: LanguageCode };
  const { lang } = params;

  if (i18nInstance.language !== lang) {
    i18nInstance.changeLanguage(lang);
  }

  const direction = i18nInstance.dir(lang);

  return (
    <html lang={i18nInstance.language} dir={direction} suppressHydrationWarning>
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
            </ThemeProvider>
          </I18nextProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
