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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Polyfill for esbuild's __name helper
              if (typeof __name === 'undefined') {
                window.__name = function(target, value) {
                  Object.defineProperty(target, 'name', { value, configurable: true });
                  return target;
                };
              }
            `,
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
