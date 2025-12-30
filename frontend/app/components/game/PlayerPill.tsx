/**
 * PlayerPill - Compact player badge showing team, name, model, and alive status.
 * Clickable to open player details modal.
 */

import { Skull } from 'lucide-react';
import type { PlayerInfo } from '~/lib/game-types';
import { getShortModelName } from '~/lib/game-types';

interface PlayerPillProps {
  player: PlayerInfo;
  onClick?: () => void;
  showModel?: boolean;
}

export function PlayerPill({ player, onClick, showModel = true }: PlayerPillProps) {
  const isMafia = player.team === 'mafia';
  const isAlive = player.isAlive;

  const borderClass = isMafia
    ? isAlive
      ? 'border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10'
      : 'border-rose-500/20 bg-transparent border-dashed hover:bg-rose-500/5'
    : isAlive
      ? 'border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10'
      : 'border-indigo-500/20 bg-transparent border-dashed hover:bg-indigo-500/5';

  const textClass = isMafia
    ? 'text-rose-600 dark:text-rose-400'
    : 'text-indigo-600 dark:text-indigo-400';

  const dotClass = isMafia ? 'bg-rose-500' : 'bg-indigo-500';
  const opacityClass = isAlive ? '' : 'opacity-50';
  
  const shortModelName = showModel ? getShortModelName(player.modelId) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] cursor-pointer transition-colors ${borderClass} ${opacityClass}`}
    >
      {!isAlive ? (
        <Skull size={10} className="text-muted-foreground/40 shrink-0" />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
      )}
      <span className={`font-semibold ${textClass}`}>
        {player.playerName}
      </span>
      {shortModelName && (
        <span className="text-[9px] text-muted-foreground/50 font-mono">
          {shortModelName}
        </span>
      )}
    </button>
  );
}

