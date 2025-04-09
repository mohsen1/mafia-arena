import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const lang = url.searchParams.get("lang");

  // Clone the request headers
  const requestHeaders = new Headers(request.headers);

  // Set utility headers (optional but can be useful)
  requestHeaders.set("x-url", request.url);
  requestHeaders.set("x-pathname", url.pathname);

  // Set the specific language header only if lang query param exists
  if (lang) {
    requestHeaders.set("x-lang", lang);
  }
  // Removed: requestHeaders.set("x-search-params", url.searchParams.toString());

  // Pass the modified headers along
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  return response;
}

// Config remains the same
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
