import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";
import nextI18nConfig from '../../next-i18next.config.js'; // Import config
import { createTranslation } from '@/app/i18n'; // Use path relative to src
import TranslationsProvider from '@/app/TranslationsProvider'; // Use path relative to src

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

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: { lang?: string }; // Expect lang param from URL
}>) {
  // Determine language from URL params or default
  const lang = params.lang || nextI18nConfig.i18n.defaultLocale;
  // Initialize i18next on the server for this request
  const { resources } = await createTranslation(lang, 'translation'); // Removed unused t variable
  const dir = lang === 'fa' ? 'rtl' : 'ltr';

  return (
    <html lang={lang} dir={dir} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TranslationsProvider 
            resources={resources} 
            locale={lang} 
            namespaces={['translation']} // Match namespace used in createTranslation
          >
            {children}
          </TranslationsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
