/**
 * GameEndOverlay - Victory celebration when game completes.
 */

import { Trophy } from 'lucide-react';

interface GameEndOverlayProps {
  winner: 'mafia' | 'town';
}

export function GameEndOverlay({ winner }: GameEndOverlayProps) {
  const isMafia = winner === 'mafia';
  const winnerClass = isMafia
    ? 'bg-rose-500/10 border-rose-500/30 text-rose-500'
    : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-500';

  return (
    <div className={`text-center py-4 rounded-md border ${winnerClass}`}>
      <span className="inline-block mb-1">
        <Trophy size={16} />
      </span>
      <div className="text-sm font-bold">
        {isMafia ? 'Mafia' : 'Town'} Wins
      </div>
    </div>
  );
}


