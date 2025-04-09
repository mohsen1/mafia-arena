import { useCallback, useRef } from "react";
import { addMissingEnglishPhrase } from "@/app/actions/translation"; // Import the action

interface UseTranslationArgs {
  translations: Record<string, string>;
  isLoading?: boolean;
  error?: string | null;
  isSourceLanguage?: boolean; // Add new prop to indicate if this is the source dict (English)
}

/**
 * Hook to provide a translation function based on a loaded dictionary.
 *
 * @param translations A map where keys are phrase IDs and values are translated strings.
 * @param isLoading Optional flag indicating if translations are currently loading.
 * @param error Optional error message if loading failed.
 * @param isSourceLanguage Optional boolean indicating if the translations are for the source language (e.g., English).
 *                       If true, missing keys with fallbacks will trigger an attempt to update the source dictionary.
 * @returns An object containing:
 *          - t: Function to get a translation by phrase key.
 *          - isLoading: Boolean indicating loading state.
 *          - error: String containing error message, or null.
 */
export function useTranslation({
  translations,
  isLoading = false,
  error = null,
  isSourceLanguage = false, // Default to false
}: UseTranslationArgs) {
  // Keep track of keys we've already tried to add in this session to avoid spamming
  const addedKeysRef = useRef<Set<string>>(new Set());

  const t = useCallback(
    (phraseKey: string, fallback?: string): string => {
      // 1. Return the specific translation if found
      if (translations && phraseKey in translations) {
        return translations[phraseKey];
      }

      // 2. If source language, key is missing, and fallback exists, try adding it
      if (
        isSourceLanguage &&
        fallback !== undefined &&
        !addedKeysRef.current.has(phraseKey) // Check if already attempted
      ) {
        console.warn(
          `[Translation] Missing source (${'en'}) key: "${phraseKey}". Attempting to add with fallback: "${fallback}"`,
        );
        addedKeysRef.current.add(phraseKey); // Mark as attempted

        // Call server action asynchronously (fire and forget)
        addMissingEnglishPhrase(phraseKey, fallback)
          .then((result) => {
            if (!result.success) {
              console.error(
                `[Translation] Failed to add missing key "${phraseKey}" to dictionary: ${result.message}`,
              );
              // Optionally remove from addedKeysRef if you want to retry on next render?
              // addedKeysRef.current.delete(phraseKey);
            } else {
              console.log(
                `[Translation] Server action reported success for adding/checking key: "${phraseKey}"`,
              );
            }
          })
          .catch((err) => {
            console.error(
              `[Translation] Error calling addMissingEnglishPhrase for key "${phraseKey}":`,
              err,
            );
            // Optionally remove from addedKeysRef on unexpected error?
            // addedKeysRef.current.delete(phraseKey);
          });
      } else if (fallback === undefined) {
        // 3. Log warning if key is missing and no fallback provided
        console.warn(`[Translation] Missing translation for key: "${phraseKey}"`);
      }

      // 4. Return fallback if provided, otherwise return the key itself
      return fallback !== undefined ? fallback : phraseKey;
    },
    [translations, isSourceLanguage], // Add isSourceLanguage to dependency array
  );

  return {
    t,
    isLoading,
    error,
  };
}
