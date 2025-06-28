'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AutoSaveIndicatorProps {
  isSaving: boolean;
  lastSaved?: Date | null;
}

export function AutoSaveIndicator({
  isSaving,
  lastSaved,
}: AutoSaveIndicatorProps) {
  const { t } = useTranslation();
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (!isSaving && lastSaved) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isSaving, lastSaved]);

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 5) return t('JustNow', 'Just now');
    if (diffSecs < 60)
      return t('SecondsAgo', '{{count}} seconds ago', { count: diffSecs });

    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins === 1) return t('OneMinuteAgo', '1 minute ago');
    if (diffMins < 60)
      return t('MinutesAgo', '{{count}} minutes ago', { count: diffMins });

    return date.toLocaleTimeString();
  };

  return (
    <div className="fixed bottom-4 start-4 z-50">
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-md bg-background/95 border shadow-sm transition-all duration-300',
          isSaving
            ? 'opacity-100 translate-y-0'
            : showSaved
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-2'
        )}
      >
        {isSaving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              {t('Saving', 'Saving...')}
            </span>
          </>
        ) : showSaved && lastSaved ? (
          <>
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-sm text-muted-foreground">
              {t('SavedAt', 'Saved {{time}}', { time: formatTime(lastSaved) })}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
