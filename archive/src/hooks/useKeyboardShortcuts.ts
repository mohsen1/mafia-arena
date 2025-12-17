import { useEffect, useCallback, useMemo } from 'react';
import { useGameContext } from '@/context/GameContext';

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
  enabled?: boolean;
}

export function useKeyboardShortcuts() {
  const {
    isAutoRunning,
    toggleAutoRun,
    runNextTurn,
    isLoadingNextTurn,
    gameState,
  } = useGameContext();

  const shortcuts: KeyboardShortcut[] = useMemo(
    () => [
      {
        key: ' ', // Spacebar
        action: toggleAutoRun,
        description: 'Toggle auto-play',
        enabled: gameState?.phase !== 'GameOver',
      },
      {
        key: 'ArrowRight',
        action: runNextTurn,
        description: 'Next turn',
        enabled:
          !isAutoRunning &&
          !isLoadingNextTurn &&
          gameState?.phase !== 'GameOver',
      },
      {
        key: 'n',
        action: runNextTurn,
        description: 'Next turn',
        enabled:
          !isAutoRunning &&
          !isLoadingNextTurn &&
          gameState?.phase !== 'GameOver',
      },
      {
        key: 'p',
        action: toggleAutoRun,
        description: 'Pause/Play',
        enabled: gameState?.phase !== 'GameOver',
      },
      {
        key: '?',
        shift: true,
        action: () => {
          // Show help dialog
          const event = new CustomEvent('showKeyboardShortcuts');
          window.dispatchEvent(event);
        },
        description: 'Show keyboard shortcuts',
        enabled: true,
      },
    ],
    [
      toggleAutoRun,
      runNextTurn,
      isAutoRunning,
      isLoadingNextTurn,
      gameState?.phase,
    ]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }

      for (const shortcut of shortcuts) {
        if (shortcut.enabled === false) continue;

        const keyMatch = event.key === shortcut.key;
        const ctrlMatch = !shortcut.ctrl || event.ctrlKey === shortcut.ctrl;
        const shiftMatch = !shortcut.shift || event.shiftKey === shortcut.shift;
        const altMatch = !shortcut.alt || event.altKey === shortcut.alt;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          event.preventDefault();
          shortcut.action();
          break;
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { shortcuts };
}
