# React Suspension Error Fix

## Problem
After the voice integration, the application was throwing errors related to params handling in Next.js 15:

1. First error:
```
Error: A component was suspended by an uncached promise. Creating promises inside a Client Component or hook is not yet supported, except via a Suspense-compatible library or framework.
```

2. Second error (after initial fix):
```
Error: A param property was accessed directly with `params.lang`. `params` is now a Promise and should be unwrapped with `React.use()` before accessing properties of the underlying params object.
```

## Root Cause
Next.js 15 has changed how params are handled in layouts and pages. The `params` prop is now a Promise that needs to be unwrapped using `React.use()` before accessing its properties. The initial error was caused by trying to use `use()` with a promise for language loading, which is not supported in Client Components.

## Solution
The fix required two steps:

1. **Update params type to Promise**: Changed the params type from `{ lang: LanguageCode }` to `Promise<{ lang: LanguageCode }>`
2. **Use React.use() to unwrap params**: Used `const { lang } = use(params)` to properly unwrap the params Promise
3. **Keep useEffect for language loading**: Maintained the `useEffect` hook for language loading instead of using `use()` with the language loading promise

```typescript
// Fixed code:
export default function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: LanguageCode }>;
}>) {
  const { lang } = use(params);

  // Ensure the language is loaded
  useEffect(() => {
    if (i18nInstance.language !== lang) {
      i18nInstance.changeLanguage(lang);
    }
  }, [lang]);
  
  // ... rest of component
}
```

## Key Changes
1. Added `use` import from React
2. Changed params type to `Promise<{ lang: LanguageCode }>`
3. Used `use(params)` to unwrap the params Promise
4. Kept `useEffect` for language loading (not using `use()` with promises for side effects)

## Impact
- Both errors are resolved
- The application loads successfully
- Language switching works correctly
- Params are properly handled according to Next.js 15 conventions
- No functionality is lost

## Lessons Learned
- Next.js 15 introduces breaking changes in how params are handled
- The `params` prop is now a Promise that must be unwrapped with `React.use()`
- Don't use `React.use()` for side effects or async operations in Client Components - use `useEffect` instead
- Always check the Next.js migration guide when upgrading major versions 