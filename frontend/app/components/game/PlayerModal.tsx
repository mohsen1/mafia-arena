/**
 * PlayerModal - Detailed player information overlay.
 * Shows persona details, model info, and team/status.
 */

import { useEffect, useCallback } from 'react';
import { X, User, MessageCircle, Brain, Skull } from 'lucide-react';
import type { PlayerInfo } from '~/lib/game-types';
import { getShortModelName, getProviderFromModel } from '~/lib/game-types';

interface PlayerModalProps {
  player: PlayerInfo;
  onClose: () => void;
}

function getProviderBadgeClass(provider: string): string {
  const classes: Record<string, string> = {
    OpenAI: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    Anthropic: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    Google: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    DeepSeek: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    Meta: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  };
  return classes[provider] || 'bg-muted text-muted-foreground';
}

export function PlayerModal({ player, onClose }: PlayerModalProps) {
  const isMafia = player.team === 'mafia';
  const teamColor = isMafia ? 'rose' : 'indigo';
  const teamLabel = isMafia ? 'Mafia' : 'Town';
  const modelName = getShortModelName(player.modelId);
  const provider = getProviderFromModel(player.modelId);
  const providerClass = provider ? getProviderBadgeClass(provider) : 'bg-muted text-muted-foreground';

  // Close on Escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-background border border-border rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-${teamColor}-500/20 border-2 border-${teamColor}-500/40`}>
              <span className={`text-lg font-bold text-${teamColor}-500`}>
                {player.playerName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">{player.playerName}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-${teamColor}-500/10 text-${teamColor}-500 border border-${teamColor}-500/30`}>
                  <span className={`w-1.5 h-1.5 rounded-full bg-${teamColor}-500`} />
                  {teamLabel}
                </span>
                {!player.isAlive ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-muted-foreground bg-muted border border-border">
                    <Skull size={10} /> Eliminated
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Alive
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Model Info */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Model</span>
            <span className={`text-xs px-2 py-0.5 rounded font-mono ${providerClass}`}>{modelName}</span>
            {provider && <span className="text-[10px] text-muted-foreground">({provider})</span>}
          </div>

          {/* Player ID */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">ID</span>
            <code className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {player.playerId}
            </code>
          </div>

          {/* Persona Section */}
          {player.persona && (
            <div className="space-y-3 mt-4 pt-4 border-t border-border/50">
              {player.persona.occupation && (
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground shrink-0 mt-0.5"><User size={12} /></span>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Role</div>
                    <div className="text-sm text-foreground">{player.persona.occupation}</div>
                  </div>
                </div>
              )}
              {player.persona.background && (
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground shrink-0 mt-0.5"><MessageCircle size={12} /></span>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Background</div>
                    <div className="text-xs text-foreground/80 leading-relaxed">{player.persona.background}</div>
                  </div>
                </div>
              )}
              {player.persona.personality && (
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground shrink-0 mt-0.5"><Brain size={12} /></span>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Personality</div>
                    <div className="text-xs text-foreground/80 leading-relaxed">{player.persona.personality}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

