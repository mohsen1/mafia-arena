import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Werewolf AI',
  description: 'Play Werewolf with AI-powered characters',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
