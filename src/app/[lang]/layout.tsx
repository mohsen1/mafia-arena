import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import "../globals.css";
import type { Locale } from "./dictionaries"; // Import Locale type if needed

// Import i18n utilities
import { dir } from 'i18next' // Use dir from i18next
// import { languages, defaultNS } from "@/lib/i18n/settings";
// Remove server-side hook import, we initialize directly here
// import { useTranslation } from "@/lib/i18n"; 
// import { TranslationsProvider } from "@/lib/i18n/client"; 
// import i18next, { createInstance, type Resource } from 'i18next'; // Import necessary i18next functions/types
// import { initReactI18next } from 'react-i18next/initReactI18next';
// import { getOptions } from '@/lib/i18n/settings';
// import fs from 'node:fs/promises';
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Werewolf AI - Social Deduction Game",
  description:
    "Play the classic game of Werewolf with intelligent AI players. Can you survive the night?",
  keywords: [
    "werewolf",
    "ai",
    "game",
    "social deduction",
    "mafia",
    "party game",
  ],
  openGraph: {
    title: "Werewolf AI",
    description: "Play Werewolf with intelligent AI players.",
    type: "website",
    // url: "YOUR_APP_URL", // Replace with your actual URL
    // images: [{ url: "/og-image.png" }], // Replace with your OG image path
  },
};

// Function to generate static params for supported languages
// export async function generateStaticParams() {
//   return languages.map((lng) => ({ lang: lng }))
// }

// initI18next function, similar to the one previously in index.ts
// We need it here to create the instance and pass resources
// const initServerI18next = async (lng: string, ns: string | string[]) => {
//   const i18nInstance = createInstance();
//   const dictionaryDir = `${process.cwd()}/src/app/[lang]/dictionaries/`;
//   const dictionaryPath = `${dictionaryDir}/${lng}.json`;
//   const dictionary = JSON.parse(await fs.readFile(dictionaryPath, 'utf-8'));
//   const langs = Array.isArray(ns) ? ns : [ns];
//   const resources: Resource = {};
//   for (const lang of langs) {
//     resources[lang] = {
//       [defaultNS]: dictionary
//     };
//   }
//   await i18nInstance
//     .use(initReactI18next)
//     // Load the dictionary dynamically WITHIN the layout/server component context
//     .init({
//       ...getOptions(lng, ns),
//       resources
//     });
//   return i18nInstance;
// };

export default async function RootLayout({
  children,
  params, 
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: Locale }>; 
}>) {
  // Initialize i18next instance here, loading the necessary resources
  const { lang } = await params;
  // const i18n = await initServerI18next(lang, defaultNS);
  
  return (
    <html lang={lang} dir={dir(lang)} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Remove TranslationsProvider wrapper */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
