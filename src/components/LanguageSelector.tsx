'use client';

import type { LanguageCode as Locale } from '@/lib/i18n/settings';
import { supportedLanguagesInfo } from '@/lib/i18n/settings';
import { usePathname, useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface LanguageSelectorProps {
  currentLang: Locale;
  className?: string;
  id?: string;
}

export default function LanguageSelector({
  currentLang,
  className,
  id,
}: LanguageSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();

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
      <SelectTrigger className={cn('w-[180px]', className)} id={id}>
        <Globe className="mr-2 h-4 w-4" />
        <SelectValue placeholder={t('languageSelector.selectLanguage')} />
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
