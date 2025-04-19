import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { match } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';
import { languages as locales, fallbackLng, type LanguageCode } from '@/lib/i18n/settings';

const defaultLocale = 'en';

// Static paths that should be excluded from locale redirection
const STATIC_PATHS = ['/images/', '/fonts/', '/videos/', '/assets/'];

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

  // Skip locale redirect for static files
  if (STATIC_PATHS.some(path => pathname.startsWith(path))) {
    console.log('[Middleware] Skipping redirect for static path.');
    return undefined;
  }

  // Check if there is any supported locale in the pathname
  const pathnameHasLocale = locales.some((locale: LanguageCode) => {
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

  // Check if the pathname is missing a locale
  const pathnameIsMissingLocale = locales.every(
    (locale: LanguageCode) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
  );

  // Redirect if there is no locale
  if (pathnameIsMissingLocale) {
    // Use the default language
    const locale = fallbackLng;

    // e.g. incoming request is /products
    // The new URL is now /en/products
    return NextResponse.redirect(
      new URL(`/${locale}${pathname}`, request.url)
    );
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
  // Matcher ignoring `/_next/`, `/api/`, and static assets
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|images/).*)'],
};
