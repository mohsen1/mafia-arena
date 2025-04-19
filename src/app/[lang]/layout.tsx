import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import "../globals.css";
import type { Locale } from "./dictionaries"; // Import Locale type if needed

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
  params: { lang: Locale }; // Use Locale type
}>) {
  const { lang } = params;
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
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
