import { useCallback } from 'react';

interface UseTranslationArgs {
    translations: Record<string, string>;
    isLoading?: boolean;
    error?: string | null;
}

/**
 * Hook to provide a translation function based on a loaded dictionary.
 *
 * @param translations A map where keys are phrase IDs and values are translated strings.
 * @param isLoading Optional flag indicating if translations are currently loading.
 * @param error Optional error message if loading failed.
 * @returns An object containing:
 *          - t: Function to get a translation by phrase key.
 *          - isLoading: Boolean indicating loading state.
 *          - error: String containing error message, or null.
 */
export function useTranslation({ translations, isLoading = false, error = null }: UseTranslationArgs) {
    
    const t = useCallback((phraseKey: string, fallback?: string): string => {
        // Return the specific translation if found
        if (translations && phraseKey in translations) {
            return translations[phraseKey];
        }
        // Return the provided fallback text if translation not found
        if (fallback !== undefined) {
            return fallback;
        }
        // Return the key itself as a last resort, indicating missing translation
        console.warn(`[Translation] Missing translation for key: ${phraseKey}`);
        return phraseKey; 
    }, [translations]); // Dependency: re-create t only if the translations map changes

    return { 
        t, 
        isLoading, 
        error 
    };
} 