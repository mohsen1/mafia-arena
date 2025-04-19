import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { match } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';
import { availableLanguageCodes } from '@/lib/translation/languages'; // Import all codes

const locales = availableLanguageCodes; // Use all codes from the languages file
const defaultLocale = 'en';

// Get the preferred locale, similar to the example in Next.js docs
function getLocale(request: NextRequest): string {
  const negotiatorHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    negotiatorHeaders[key] = value;
  });

  // @ts-ignore locales are readonly
  const languages = new Negotiator({ headers: negotiatorHeaders }).languages(locales);

  try {
      return match(languages, locales, defaultLocale);
  } catch (e) {
      // Handle cases where match might fail (e.g., invalid languages)
      console.error("Locale matching failed:", e);
      return defaultLocale;
  }
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  console.log('[Middleware] Pathname:', pathname);

  // Check if the pathname already starts with a supported locale
  const pathnameHasLocale = locales.some((locale) => {
    const hasLocale = pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`;
    // console.log(`[Middleware] Checking locale '${locale}': ${hasLocale}`); // Optional detailed log
    return hasLocale;
  });

  console.log('[Middleware] Pathname has locale:', pathnameHasLocale);

  // If the pathname already has a supported locale, do nothing.
  if (pathnameHasLocale) {
    console.log('[Middleware] Skipping redirect.');
    return undefined;
  }

  // Otherwise, redirect if there is no locale (or it's an unsupported one)
  console.log('[Middleware] No supported locale found, determining preferred locale...');
  const locale = getLocale(request);
  const newUrl = new URL(
    locale,
    request.url
  );
  console.log(`[Middleware] Redirecting to: ${newUrl.toString()}`);
  return NextResponse.redirect(newUrl);
}

export const config = {
  // Matcher ignoring `/_next/` and `/api/`
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
