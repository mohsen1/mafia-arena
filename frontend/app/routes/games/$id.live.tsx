/**
 * Live Game Route - Modernized React implementation.
 * Uses React hooks and components instead of imperative DOM manipulation.
 */

import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router';
import type { Route } from './+types/$id.live';
import { getGame } from '~/lib/api';
import { getApiUrl } from '~/lib/utils';
import { ArrowLeft, Moon, Sun, Swords, Vote, MessageCircle, Clock, DollarSign } from 'lucide-react';
import { useGameConnection } from '~/hooks/useGameConnection';
import {
  LiveTranscript,
  PlayerPill,
  PlayerModal,
  BatchBanner,
  ErrorBanner,
  GameEndOverlay,
  ThemeDialog,
  DiscountPricingDialog,
} from '~/components/game';
import { ThemeIcon } from '~/components/ThemeIcon';
import type { PlayerInfo } from '~/lib/game-types';
import { formatDuration, getPhaseConfig, getShortModelName } from '~/lib/game-types';
import { getTheme } from '~/lib/themes';
import { sortPlayers } from '~/lib/game-utils';

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
  const [showThemeDialog, setShowThemeDialog] = useState(false);
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);

  // Game connection hook
  const { state, isConnected, isConnecting, isPolling } = useGameConnection({
    gameId,
    apiUrl,
  });

  // Derive display values
  const theme = getTheme(game?.persona_theme);
  const players = Object.values(state.players);
  const sortedPlayers = useMemo(() => sortPlayers(players), [players]);

  // Derive team models - use game.participants as fallback when state.players is empty
  const mafiaModels = useMemo(() => {
    if (players.length > 0) {
      const models = [...new Set(players.filter(p => p.team === 'mafia').map(p => getShortModelName(p.modelId)))];
      return models.join(', ') || '—';
    }
    // Fallback to game participants from loader (use model_name or model_id)
    if (game?.participants && game.participants.length > 0) {
      const mafiaParticipants = game.participants.filter(p => p.team === 'mafia');
      if (mafiaParticipants.length > 0) {
        const models = [...new Set(mafiaParticipants.map(p => p.model_name || getShortModelName(p.model_id)))];
        return models.filter(Boolean).join(', ') || '—';
      }
    }
    return '—';
  }, [players, game?.participants]);

  const townModels = useMemo(() => {
    if (players.length > 0) {
      const models = [...new Set(players.filter(p => p.team === 'town').map(p => getShortModelName(p.modelId)))];
      return models.join(', ') || '—';
    }
    // Fallback to game participants from loader (use model_name or model_id)
    if (game?.participants && game.participants.length > 0) {
      const townParticipants = game.participants.filter(p => p.team === 'town');
      if (townParticipants.length > 0) {
        const models = [...new Set(townParticipants.map(p => p.model_name || getShortModelName(p.model_id)))];
        return models.filter(Boolean).join(', ') || '—';
      }
    }
    return '—';
  }, [players, game?.participants]);

  // Phase config
  const phaseConfig = getPhaseConfig(state.currentPhase || undefined);

  // Effective status: prefer state from WebSocket, fall back to initial game status
  const effectiveStatus = state.status === 'idle' && game?.status ? game.status : state.status;
  const effectiveError = state.error || game?.errorMessage || null;

  // Status badge - consistent styling across all states
  const statusBadge = useMemo(() => {
    const baseClasses = "flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold tracking-widest uppercase";
    
    if (effectiveStatus === 'running') {
      return (
        <div className={`${baseClasses} bg-rose-500/10 text-rose-600 dark:text-rose-400`}>
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500" />
          </span>
          LIVE
        </div>
      );
    }
    if (effectiveStatus === 'completed') {
      return (
        <div className={`${baseClasses} bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          DONE
        </div>
      );
    }
    if (effectiveStatus === 'failed') {
      return (
        <div className={`${baseClasses} bg-rose-500/10 text-rose-600 dark:text-rose-400`}>
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          FAILED
        </div>
      );
    }
    return (
      <div className={`${baseClasses} bg-amber-500/10 text-amber-600 dark:text-amber-400`}>
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        STARTING
      </div>
    );
  }, [effectiveStatus]);

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

  // Check if we're in character generation phase (progress bar only shows then)
  const isCharacterGeneration = state.progress?.label?.toLowerCase().includes('generat') || 
    (!state.currentPhase || state.currentPhase === 'introduction' && state.events.length === 0);

  return (
    <div className="fixed inset-0 top-14 flex flex-col overflow-hidden bg-background">
      <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-4 pt-2 pb-1.5 space-y-1.5">
          {/* Row 1: Status + Theme + Matchup */}
          <div className="flex items-center gap-2 text-[10px]">
            {statusBadge}

            {/* Discount Pricing Pill */}
            {game?.discountPricing && (
              <button
                onClick={() => setShowDiscountDialog(true)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium cursor-pointer hover:opacity-80 transition-opacity bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              >
                <DollarSign size={10} />
                <span>50% off</span>
              </button>
            )}

            <button
              onClick={() => setShowThemeDialog(true)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium cursor-pointer hover:opacity-80 transition-opacity ${theme.classes}`}
            >
              <ThemeIcon type={theme.iconType} />
              {theme.label}
            </button>

            <div className="h-3 w-px bg-border/40" />

            {/* Matchup */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-[12px] tracking-wide text-red-700 dark:text-red-400 relative">
                MAFIA
                {state.winner === 'mafia' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-700 dark:bg-red-400" />}
              </span>
              <span className="font-mono text-[11px] font-semibold text-foreground truncate max-w-[120px]">
                {mafiaModels}
              </span>
              {state.winner === 'mafia' && <span className="text-red-700 dark:text-red-400 text-[10px] font-bold">won</span>}
              <span className="text-foreground font-medium text-[10px]">vs</span>
              <span className="font-bold text-[12px] tracking-wide text-blue-700 dark:text-blue-400 relative">
                TOWN
                {state.winner === 'town' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-700 dark:bg-blue-400" />}
              </span>
              <span className="font-mono text-[11px] font-semibold text-foreground truncate max-w-[120px]">
                {townModels}
              </span>
              {state.winner === 'town' && <span className="text-blue-700 dark:text-blue-400 text-[10px] font-bold">won</span>}
            </div>

            <div className="flex-1" />

            {/* Stats */}
            <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
              <span>Round <span className="font-mono font-semibold text-foreground">{state.currentRound || '-'}</span></span>
              <div className={`inline-flex items-center gap-1 font-medium ${phaseConfig.color}`}>
                <PhaseIcon icon={phaseConfig.icon} />
                {phaseConfig.label}
              </div>
              <span className="font-mono tabular-nums">{formatDuration(state.durationMs || 0)}</span>
              <span className="font-mono tabular-nums">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{state.totalTokens.toLocaleString()}</span>
                <span className="text-muted-foreground/70 ml-0.5">tok</span>
              </span>
            </div>
          </div>

          {/* Row 2: Players */}
          {sortedPlayers.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {sortedPlayers.map(player => (
                <PlayerPill
                  key={player.playerId}
                  player={player}
                  onClick={() => setSelectedPlayer(player)}
                />
              ))}
            </div>
          )}

          {/* Progress Indicator - Only during character generation */}
          {effectiveStatus === 'running' && isCharacterGeneration && (state.progress || state.batchStatus) && (
            <div className="pt-0.5">
              {/* Batch Status (for discount pricing games) */}
              {state.batchStatus?.isWaitingForBatch && (
                <div className="flex items-center gap-2 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1.5 rounded">
                  <Clock size={12} className="shrink-0" />
                  <span className="font-medium">Waiting for batch API</span>
                  {state.batchStatus.estimatedWaitHours !== undefined && (
                    <span className="text-amber-600/60 dark:text-amber-400/60">
                      ~{state.batchStatus.estimatedWaitHours}h remaining
                    </span>
                  )}
                </div>
              )}
              
              {/* Progress bar (only during character generation) */}
              {!state.batchStatus?.isWaitingForBatch && state.progress && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-300 ease-out"
                      style={{ width: `${Math.min(100, (state.progress.current / state.progress.total) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground/70 tabular-nums w-10 text-right">
                    {state.progress.current}/{state.progress.total}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Batch Banner */}
          <BatchBanner
            status={state.status}
            aiProgress={state.aiProgress}
            suspenseReason={state.suspenseReason}
            healthStatus={state.healthStatus}
          />

          {/* Error Banner */}
          {effectiveError && <ErrorBanner error={effectiveError} />}
        </div>

        {/* Transcript or Error State */}
        <div className="flex-1 min-h-0 px-4 pb-4">
          {effectiveStatus === 'failed' ? (
            <div className="h-full flex flex-col items-center justify-center rounded-lg bg-rose-500/5 border border-rose-500/20">
              <div className="text-center space-y-3 max-w-md px-4">
                <div className="text-4xl">💀</div>
                <div className="text-lg font-semibold text-rose-600 dark:text-rose-400">Game Failed</div>
                {effectiveError && (
                  <div className="text-sm text-muted-foreground bg-background/50 rounded-lg p-3 text-left">
                    <div className="font-mono text-xs break-all">{effectiveError}</div>
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {mafiaModels !== '—' && townModels !== '—' && (
                    <span>
                      <span className="text-rose-500 font-medium">Mafia</span> ({mafiaModels}) vs{' '}
                      <span className="text-indigo-500 font-medium">Town</span> ({townModels})
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <LiveTranscript
              events={state.events}
              players={state.players}
              thinkingState={state.thinkingState}
              currentPhase={state.currentPhase}
              batchStatus={state.batchStatus}
            />
          )}
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

      {/* Theme Dialog */}
      <ThemeDialog
        isOpen={showThemeDialog}
        onClose={() => setShowThemeDialog(false)}
        themeKey={game?.persona_theme}
      />

      {/* Discount Pricing Dialog */}
      <DiscountPricingDialog
        isOpen={showDiscountDialog}
        onClose={() => setShowDiscountDialog(false)}
        estimatedWaitHours={state.batchStatus?.estimatedWaitHours}
        pendingRequests={state.batchStatus?.pendingRequests}
      />
    </div>
  );
}
