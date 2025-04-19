'use client';

import type { Locale } from "@/app/[lang]/dictionaries";
import { supportedLanguagesInfo } from "@/lib/translation/languages";
import { usePathname, useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Languages } from "lucide-react";

interface LanguageSelectorProps {
  currentLang: Locale;
}

export default function LanguageSelector({ currentLang }: LanguageSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLanguageChange = (newLangCode: string) => {
    console.log('[LanguageSelector] Current Lang:', currentLang);
    console.log('[LanguageSelector] Current Pathname:', pathname);
    console.log('[LanguageSelector] New Lang Code:', newLangCode);

    if (!newLangCode || newLangCode === currentLang) return;

    const segments = pathname.split('/').filter(Boolean);
    console.log('[LanguageSelector] Path Segments:', segments);

    if (segments.length > 0) {
      segments[0] = newLangCode;
      const newPath = `/${segments.join('/')}`;
      console.log('[LanguageSelector] New Path:', newPath);
      router.push(newPath);
    } else {
      const newPath = `/${newLangCode}`;
      console.log('[LanguageSelector] New Path (from root):', newPath);
      router.push(newPath);
    }
  };

  return (
    <div className="mb-6 flex flex-col items-start justify-start gap-2 max-w-96 mx-auto">
      <Label
        htmlFor="language-select"
        className="text-sm font-medium text-muted-foreground whitespace-nowrap flex items-center gap-1"
      >
        <Languages size={16} />
        {/* TODO: Translate this label if needed */}
        Game Language:
      </Label>
      <Select value={currentLang} onValueChange={handleLanguageChange}>
        <SelectTrigger id="language-select" className="w-full">
          <SelectValue placeholder="Select language" />
        </SelectTrigger>
        <SelectContent>
          {/* Map over all supported languages */}
          {Object.entries(supportedLanguagesInfo).map(([code, { label }]) => (
            <SelectItem key={code} value={code}>
              {label} {/* Display native language label */}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
} 