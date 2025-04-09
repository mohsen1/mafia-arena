import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import acceptLanguage from 'accept-language';
import i18nConfig from '../next-i18next.config'; // Adjust path as needed

const { locales, defaultLocale } = i18nConfig.i18n;
acceptLanguage.languages(locales);

export const config = {
  // matcher: '/', // Example: Match only the root path
  // Match all paths except _next/static, _next/image, assets, favicon.ico, sw.js
  matcher: [
    '/((?!api|_next/static|_next/image|assets|images|favicon.ico|sw.js).*)', // Standard matcher
  ],
};

const cookieName = 'i18next'; // Cookie name to store preferred language

export function middleware(req: NextRequest) {
  let lng: string | null = null; // Initialize explicitly to null

  // 1. Try getting locale from cookie
  if (req.cookies.has(cookieName)) {
    lng = acceptLanguage.get(req.cookies.get(cookieName)?.value);
  }
  // 2. Try getting locale from Accept-Language header
  if (!lng) {
    lng = acceptLanguage.get(req.headers.get('Accept-Language'));
  }
  // 3. Use default locale if none detected
  if (!lng) {
    lng = defaultLocale;
  }

  const pathname = req.nextUrl.pathname;

  // Check if the pathname already includes a supported locale
  const pathnameIsMissingLocale = locales.every(
    (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`,
  );

  // Redirect if locale is missing
  if (pathnameIsMissingLocale) {
    // e.g. incoming request is /products
    // The new URL is now /en-US/products
    const newUrl = new URL(`/${lng}${pathname}`, req.url);
    console.log(`[Middleware] Redirecting to: ${newUrl.toString()}`);
    return NextResponse.redirect(newUrl);
  }

  // If locale is present, store it in a cookie for future requests
  const response = NextResponse.next(); // Use const
  const referer = req.headers.get('referer'); // Get referer safely
  if (referer) { // Check if referer exists
    const refererUrl = new URL(referer);
    const lngInReferer = locales.find((l) => refererUrl.pathname.startsWith(`/${l}`))
    if (lngInReferer) {
      console.log(`[Middleware] Setting lang cookie from referer: ${lngInReferer}`);
      response.cookies.set(cookieName, lngInReferer);
    }
  }

  // Optionally add header for client components to read (less common now)
  // res.headers.set('x-lang', lng);

  return response;
}
