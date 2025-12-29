/**
 * ThemeDialog - Modal dialog showing theme details.
 */

import { X } from 'lucide-react';
import { ThemeIcon } from '~/components/ThemeIcon';
import { getTheme } from '~/lib/themes';

interface ThemeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  themeKey?: string | null;
}

export function ThemeDialog({ isOpen, onClose, themeKey }: ThemeDialogProps) {
  if (!isOpen) return null;

  const theme = getTheme(themeKey);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-background border rounded-lg shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className={`flex items-center gap-2 px-2 py-1 rounded-full text-sm font-medium ${theme.classes}`}>
            <ThemeIcon type={theme.iconType} />
            {theme.label} Theme
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {theme.description}
        </p>
      </div>
    </div>
  );
}

