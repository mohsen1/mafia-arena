"use client"; // Make this a client component

// Remove Metadata import if no longer used here
// import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import "../globals.css";

// Import i18n utilities and types
import { dir } from 'i18next';
import { type LanguageCode, /* languages, */ defaultNS, fallbackLng } from "@/lib/i18n/settings"; // Remove languages if unused

// Import and execute client-side i18n config
import i18nInstance from '@/lib/i18n/i18n.client';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { use } from 'react'; // Import the use hook

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], });

// Remove the metadata export - cannot be exported from client components
// export const metadata: Metadata = { ... };

// Remove generateStaticParams - It's for Server Components

// RootLayout is now a Client Component
export default function RootLayout({
  children,
  params: paramsProp, // Rename prop to avoid conflict with potential promise
}: Readonly<{
  children: React.ReactNode;
  params: { lang: LanguageCode };
}>) {

  // Unwrap params using React.use() and assert the expected type
  const params = use(paramsProp as unknown as Promise<{ lang: LanguageCode }>) as { lang: LanguageCode };
  const { lang } = params;

  if (i18nInstance.language !== lang) {
      i18nInstance.changeLanguage(lang);
  }

  const direction = i18nInstance.dir(lang);

  return (
    <html lang={i18nInstance.language} dir={direction} suppressHydrationWarning>
      {/* Add static meta tags here if needed */}
      <head>
          <meta name="keywords" content="werewolf, ai, game, social deduction, mafia, party game" />
          {/* Add other static meta tags like viewport, charset etc. */}
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          {/* Consider adding OpenGraph tags statically if they don't change much */}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
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
      </body>
    </html>
  );
}
