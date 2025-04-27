'use client';

import type { LanguageCode as Locale } from "@/lib/i18n/settings";
import { supportedLanguagesInfo } from "@/lib/i18n/settings";
import { usePathname, useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LanguageSelectorProps {
  currentLang: Locale;
  id?: string;
}

export default function LanguageSelector({ currentLang, id }: LanguageSelectorProps) {
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
    <Select value={currentLang} onValueChange={handleLanguageChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Select language" />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(supportedLanguagesInfo).map(([code, { label }]) => (
          <SelectItem key={code} value={code}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
} 