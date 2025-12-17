'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Keyboard } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Shortcut {
  keys: string[];
  description: string;
  context?: string;
}

export function KeyboardShortcutsDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const shortcuts: Shortcut[] = [
    {
      keys: ['Space'],
      description: t(
        'keyboardShortcuts.toggleAutoPlay',
        'Toggle auto-play mode'
      ),
      context: 'game',
    },
    {
      keys: ['→', 'N'],
      description: t('keyboardShortcuts.nextTurn', 'Advance to next turn'),
      context: 'game',
    },
    {
      keys: ['P'],
      description: t('keyboardShortcuts.pauseResume', 'Pause/Resume game'),
      context: 'game',
    },
    {
      keys: ['?'],
      description: t('keyboardShortcuts.showHelp', 'Show this help dialog'),
      context: 'global',
    },
    {
      keys: ['Esc'],
      description: t('keyboardShortcuts.closeDialogs', 'Close dialogs'),
      context: 'global',
    },
  ];

  useEffect(() => {
    const handleShowShortcuts = () => setOpen(true);
    window.addEventListener('showKeyboardShortcuts', handleShowShortcuts);
    return () =>
      window.removeEventListener('showKeyboardShortcuts', handleShowShortcuts);
  }, []);

  const gameShortcuts = shortcuts.filter((s) => s.context === 'game');
  const globalShortcuts = shortcuts.filter((s) => s.context === 'global');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            {t('KeyboardShortcuts', 'Keyboard Shortcuts')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'KeyboardShortcutsDescription',
              'Quick actions to control the game'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6" role="list">
          {/* Game Controls */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
              {t('GameControls', 'Game Controls')}
            </h3>
            <div className="space-y-2" role="list">
              {gameShortcuts.map((shortcut, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-secondary/50 transition-colors"
                  role="listitem"
                >
                  <span className="text-sm">{shortcut.description}</span>
                  <div className="flex gap-1">
                    {shortcut.keys.map((key, keyIndex) => (
                      <kbd
                        key={keyIndex}
                        className="font-mono text-xs px-2 py-0.5 rounded border bg-muted"
                        aria-label={`Key: ${key}`}
                      >
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Global Shortcuts */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
              {t('GlobalShortcuts', 'Global Shortcuts')}
            </h3>
            <div className="space-y-2" role="list">
              {globalShortcuts.map((shortcut, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-secondary/50 transition-colors"
                  role="listitem"
                >
                  <span className="text-sm">{shortcut.description}</span>
                  <div className="flex gap-1">
                    {shortcut.keys.map((key, keyIndex) => (
                      <kbd
                        key={keyIndex}
                        className="font-mono text-xs px-2 py-0.5 rounded border bg-muted"
                        aria-label={`Key: ${key}`}
                      >
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t text-center">
          <p className="text-xs text-muted-foreground">
            {t(
              'KeyboardShortcutsTip',
              'Press ? at any time to show this dialog'
            )}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
