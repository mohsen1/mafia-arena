/**
 * Live Game Route - Modernized React implementation.
 * Uses React hooks and components instead of imperative DOM manipulation.
 */

import { useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router';
import type { Route } from './+types/$id.live';
import { getGame } from '~/lib/api';
import { getApiUrl } from '~/lib/utils';
import { ArrowLeft, Trophy, Feather, Scroll, Building2, Sparkles, Loader2, Moon, Sun, Swords, Vote, MessageCircle } from 'lucide-react';
import { useGameConnection } from '~/hooks/useGameConnection';
import {
  LiveTranscript,
  PlayerPill,
  PlayerModal,
  BatchBanner,
  ConnectionStatus,
  ErrorBanner,
  GameEndOverlay,
} from '~/components/game';
import type { PlayerInfo } from '~/lib/game-types';
import { formatDuration, getPhaseConfig, getShortModelName, getProviderFromModel } from '~/lib/game-types';

// =============================================================================
// Theme Configuration
// =============================================================================

const THEME_CONFIG: Record<string, { label: string; iconType: string; classes: string }> = {
  noir: { label: 'Noir', iconType: 'feather', classes: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400' },
  victorian: { label: 'Victorian', iconType: 'scroll', classes: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  modern: { label: 'Modern', iconType: 'building', classes: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400' },
  fantasy: { label: 'Fantasy', iconType: 'sparkles', classes: 'bg-purple-500/10 text-purple-700 dark:text-purple-400' },
};

function ThemeIcon({ type }: { type: string }) {
  switch (type) {
    case 'feather': return <Feather size={10} />;
    case 'scroll': return <Scroll size={10} />;
    case 'building': return <Building2 size={10} />;
    case 'sparkles': return <Sparkles size={10} />;
    default: return null;
  }
}

function PhaseIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'moon': return <Moon size={10} />;
    case 'sun': return <Sun size={10} />;
    case 'swords': return <Swords size={10} />;
    case 'vote': return <Vote size={10} />;
    case 'message': return <MessageCircle size={10} />;
    default: return <MessageCircle size={10} />;
  }
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

// =============================================================================
// Route Meta & Loader
// =============================================================================

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: `Live: ${data?.game?.id?.slice(-8) || ''} | Mafia Arena` },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const gameId = params.id!;
  try {
    const game = await getGame(gameId);
    return { game, error: null };
  } catch {
    return { game: null, error: 'Game not found' };
  }
}

// =============================================================================
// Main Component
// =============================================================================

export default function LiveGame({ loaderData }: Route.ComponentProps) {
  const { game, error: loaderError } = loaderData;
  const params = useParams();
  const gameId = params.id!;
  const apiUrl = getApiUrl();

  // Modal state
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerInfo | null>(null);

  // Game connection hook
  const { state, isConnected, isConnecting, isPolling } = useGameConnection({
    gameId,
    apiUrl,
  });

  // Derive display values
  const theme = THEME_CONFIG[game?.persona_theme || 'noir'] || THEME_CONFIG.noir;
  const players = Object.values(state.players);
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      if (a.team !== b.team) return a.team === 'mafia' ? -1 : 1;
      return a.isAlive === b.isAlive ? 0 : a.isAlive ? -1 : 1;
    });
  }, [players]);

  // Derive team models
  const mafiaModels = useMemo(() => {
    const models = [...new Set(players.filter(p => p.team === 'mafia').map(p => getShortModelName(p.modelId)))];
    return models.join(', ') || '—';
  }, [players]);

  const townModels = useMemo(() => {
    const models = [...new Set(players.filter(p => p.team === 'town').map(p => getShortModelName(p.modelId)))];
    return models.join(', ') || '—';
  }, [players]);

  // Derive providers
  const providers = useMemo(() => {
    const allModels = players.map(p => p.modelId);
    return [...new Set(allModels.map(getProviderFromModel).filter((p): p is string => p !== null))];
  }, [players]);

  // Phase config
  const phaseConfig = getPhaseConfig(state.currentPhase || undefined);

  // Status badge
  const statusBadge = useMemo(() => {
    if (state.status === 'running') {
      return (
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[8px] font-bold tracking-wider uppercase">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500" />
          </span>
          LIVE
        </div>
      );
    }
    if (state.status === 'completed') {
      return (
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[8px] font-bold tracking-wider uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          COMPLETED
        </div>
      );
    }
    if (state.status === 'failed') {
      return (
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[8px] font-bold tracking-wider uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          FAILED
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[8px] font-bold tracking-wider uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        STARTING
      </div>
    );
  }, [state.status]);

  // Handle error states
  if (loaderError || !game) {
    return (
      <div className="space-y-4 p-4">
        <Link to="/games" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft size={12} /> Back to Games
        </Link>
        <div className="border rounded p-8 text-center text-muted-foreground">
          {loaderError || 'Game not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 top-14 flex flex-col overflow-hidden bg-background">
      <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-4 pt-2 pb-1">
          {/* Status bar + Matchup */}
          <div className="flex items-center gap-3 text-[10px]">
            {statusBadge}

            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-medium ${theme.classes}`}>
              <ThemeIcon type={theme.iconType} />
              {theme.label}
            </div>

            <div className="h-3 w-px bg-border/50" />

            {/* Matchup */}
            <div className="flex items-center gap-1.5">
              {state.winner === 'mafia' && <Trophy size={10} className="text-amber-500" />}
              <span className={`font-bold ${state.winner === 'town' ? 'opacity-50' : ''} text-rose-500`}>MAFIA</span>
              <span className={`font-mono text-foreground/60 truncate max-w-[120px] ${state.winner === 'town' ? 'opacity-50' : ''}`}>
                {mafiaModels}
              </span>
              <span className="text-muted-foreground/40 text-[8px]">vs</span>
              {state.winner === 'town' && <Trophy size={10} className="text-amber-500" />}
              <span className={`font-bold ${state.winner === 'mafia' ? 'opacity-50' : ''} text-indigo-500`}>TOWN</span>
              <span className={`font-mono text-foreground/60 truncate max-w-[120px] ${state.winner === 'mafia' ? 'opacity-50' : ''}`}>
                {townModels}
              </span>
            </div>

            <div className="flex-1" />

            {/* Stats */}
            <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
              <span>Round <span className="font-mono font-bold text-foreground">{state.currentRound || '-'}</span></span>
              <div className={`inline-flex items-center gap-1 font-medium ${phaseConfig.color}`}>
                <PhaseIcon icon={phaseConfig.icon} />
                {phaseConfig.label}
              </div>
              <span className="font-mono tabular-nums">{formatDuration(state.durationMs || 0)}</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {state.totalTokens.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Players Grid */}
          {sortedPlayers.length > 0 && (
            <div className="pt-1.5">
              <div className="flex flex-wrap gap-1">
                {sortedPlayers.map(player => (
                  <PlayerPill
                    key={player.playerId}
                    player={player}
                    onClick={() => setSelectedPlayer(player)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Providers */}
          {providers.length > 0 && (
            <div className="flex items-center gap-1 pt-1">
              {providers.map(provider => (
                <span
                  key={provider}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getProviderBadgeClass(provider)}`}
                >
                  {provider}
                </span>
              ))}
            </div>
          )}

          {/* Connection Status */}
          <div className="text-[9px] pt-1">
            <ConnectionStatus
              isConnected={isConnected}
              isConnecting={isConnecting}
              isPolling={isPolling}
              aiProgress={state.aiProgress}
              suspenseReason={state.suspenseReason}
              eventCount={state.events.length}
            />
          </div>

          {/* Batch Banner */}
          <BatchBanner
            status={state.status}
            aiProgress={state.aiProgress}
            suspenseReason={state.suspenseReason}
            healthStatus={state.healthStatus}
          />

          {/* Error Banner */}
          {state.error && <ErrorBanner error={state.error} />}
        </div>

        {/* Transcript */}
        <div className="flex-1 min-h-0 px-4 pb-4">
          <LiveTranscript
            events={state.events}
            players={state.players}
            thinkingState={state.thinkingState}
          />
        </div>

        {/* Game End Overlay */}
        {state.winner && (
          <div className="px-4 pb-4">
            <GameEndOverlay winner={state.winner} />
          </div>
        )}
      </div>

      {/* Player Modal */}
      {selectedPlayer && (
        <PlayerModal
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}
