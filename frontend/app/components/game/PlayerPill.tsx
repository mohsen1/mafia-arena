/**
 * PlayerPill - Compact player badge showing team, name, and alive status.
 * Clickable to open player details modal.
 */

import { Skull } from 'lucide-react';
import type { PlayerInfo } from '~/lib/game-types';

interface PlayerPillProps {
  player: PlayerInfo;
  onClick?: () => void;
}

export function PlayerPill({ player, onClick }: PlayerPillProps) {
  const isMafia = player.team === 'mafia';
  const isAlive = player.isAlive;

  const borderClass = isMafia
    ? isAlive
      ? 'border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20'
      : 'border-rose-500/20 bg-rose-500/5 border-dashed hover:bg-rose-500/10'
    : isAlive
      ? 'border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20'
      : 'border-indigo-500/20 bg-indigo-500/5 border-dashed hover:bg-indigo-500/10';

  const textClass = isMafia
    ? 'text-rose-600 dark:text-rose-400'
    : 'text-indigo-600 dark:text-indigo-400';

  const dotClass = isMafia ? 'bg-rose-500' : 'bg-indigo-500';
  const opacityClass = isAlive ? '' : 'opacity-50';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] cursor-pointer transition-colors ${borderClass} ${opacityClass}`}
    >
      {!isAlive ? (
        <span className="text-muted-foreground/50"><Skull size={11} /></span>
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      )}
      <span className={`font-semibold font-display ${textClass} truncate max-w-[90px]`}>
        {player.playerName}
      </span>
    </button>
  );
}

