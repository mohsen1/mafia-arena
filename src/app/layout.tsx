import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { headers } from 'next/headers';
import "./globals.css";

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
  description: "Play the classic game of Werewolf with intelligent AI players. Can you survive the night?",
  keywords: ["werewolf", "ai", "game", "social deduction", "mafia", "party game"],
  themeColor: "#1a1a1a", // Example theme color, adjust as needed
  openGraph: {
    title: "Werewolf AI",
    description: "Play Werewolf with intelligent AI players.",
    type: "website",
    // url: "YOUR_APP_URL", // Replace with your actual URL
    // images: [{ url: "/og-image.png" }], // Replace with your OG image path
  },

};

// Helper function to determine direction based on language code
const getDirection = (lang: string | undefined): 'ltr' | 'rtl' => {
  if (!lang) return 'ltr';
  // Extract the primary language subtag (e.g., 'en' from 'en-US')
  const languageCode = lang.split('-')[0].toLowerCase();
  // Add more RTL language codes as needed
  const rtlLanguages = ['ar', 'he', 'fa', 'ur', 'yi', 'sd'];
  return rtlLanguages.includes(languageCode) ? 'rtl' : 'ltr';
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();

  // Read the specific lang header set by middleware
  const langFromHeader = headersList.get('x-lang');

  let preferredLang: string | undefined;

  // Prioritize lang from header (originally from URL)
  if (langFromHeader) {
    preferredLang = langFromHeader;
  } else {
    // Fallback to accept-language header
    const acceptLanguage = headersList.get('accept-language');
    preferredLang = acceptLanguage?.split(',')[0].split(';')[0];
  }

  const direction = getDirection(preferredLang);
  console.log("[Layout] preferredLang:", preferredLang);
  console.log("[Layout] direction:", direction);
  // Use the full preferred language tag for the lang attribute if available, default to 'en'
  const finalLang = preferredLang || 'en';

  return (
    <html lang={finalLang} dir={direction} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
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
