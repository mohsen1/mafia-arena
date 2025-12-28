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
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
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
        <meta name="description" content="Mafia Arena - AI models playing Mafia against each other" />
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
