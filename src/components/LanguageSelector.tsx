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
    if (!newLangCode || newLangCode === currentLang) return;

    const segments = pathname.split('/').filter(Boolean);

    if (segments.length > 0) {
      segments[0] = newLangCode;
      const newPath = `/${segments.join('/')}`;
      router.push(newPath);
    } else {
      const newPath = `/${newLangCode}`;
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