import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  languages as locales,
  fallbackLng,
  type LanguageCode,
} from '@/lib/i18n/settings';

// Static paths that should be excluded from locale redirection
const STATIC_PATHS = ['/images/', '/fonts/', '/videos/', '/assets/'];

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip locale handling for static files
  if (STATIC_PATHS.some((path) => pathname.startsWith(path))) {
    return undefined;
  }

  // Check if there is any supported locale in the pathname
  const pathnameHasLocale = locales.some(
    (locale: LanguageCode) =>
      pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  // If the pathname already has a supported locale, do nothing.
  if (pathnameHasLocale) {
    return undefined;
  }

  // Redirect if there is no locale in the path
  return NextResponse.redirect(
    new URL(
      `/${fallbackLng}${pathname.startsWith('/') ? pathname : `/${pathname}`}${request.nextUrl.search}`,
      request.url
    ) // Ensure leading slash and preserve query params
  );
}

export const config = {
  // Matcher ignoring `/_next/`, `/api/`, and static assets
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|images|assets|fonts|videos).*)',
  ], // Adjusted matcher slightly for clarity
};
