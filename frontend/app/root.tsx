import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { AuthProvider } from "~/contexts/auth";
import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";

const SITE_URL = "https://mafia-arena.com";
const SITE_NAME = "AI Mafia Arena";
const SITE_DESCRIPTION = "A benchmarking platform where Large Language Models play the classic social deduction game Mafia against each other. Evaluating AI in deception, deduction, and strategic reasoning.";
const OG_IMAGE = `${SITE_URL}/og-image.png`;

export function meta(): Route.MetaDescriptors {
  return [
    { title: SITE_NAME },
    { name: "description", content: SITE_DESCRIPTION },
    
    // Open Graph
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: SITE_NAME },
    { property: "og:description", content: SITE_DESCRIPTION },
    { property: "og:url", content: SITE_URL },
    { property: "og:image", content: OG_IMAGE },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: "AI Mafia Arena - LLMs playing social deduction" },
    { property: "og:locale", content: "en_US" },
    
    // Twitter Card
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: SITE_NAME },
    { name: "twitter:description", content: SITE_DESCRIPTION },
    { name: "twitter:image", content: OG_IMAGE },
    { name: "twitter:image:alt", content: "AI Mafia Arena - LLMs playing social deduction" },
    
    // Additional SEO
    { name: "robots", content: "index, follow" },
    { name: "theme-color", content: "#0a0a0c" },
  ];
}

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
  },
  { rel: "icon", type: "image/png", sizes: "48x48", href: "/favicon-48.png" },
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
  { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png" },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
];

// Theme initialization script to prevent flash
const themeScript = `
  (function() {
    const theme = localStorage.getItem('theme') || 
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.classList.add('dark');
  })();
`;

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        
        {/* Apple-specific meta tags for iOS */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Mafia Arena" />
        <meta name="format-detection" content="telephone=no" />
        
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div className="relative flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">
          <div className="max-w-6xl mx-auto py-6 px-4">
            <Outlet />
          </div>
        </main>
        <Footer />
      </div>
    </AuthProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <AuthProvider>
      <div className="relative flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 pt-16 p-4 container mx-auto">
          <h1 className="text-4xl font-bold mb-4">{message}</h1>
          <p className="text-muted-foreground">{details}</p>
          {stack && (
            <pre className="w-full p-4 overflow-x-auto mt-4 bg-muted rounded-md">
              <code className="text-xs">{stack}</code>
            </pre>
          )}
        </main>
        <Footer />
      </div>
    </AuthProvider>
  );
}
