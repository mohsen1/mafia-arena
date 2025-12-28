import { useEffect } from 'react';
import { useParams, Link } from 'react-router';
import type { Route } from "./+types/$id.live";
import { getGame } from '~/lib/api';
import { getApiUrl } from '~/lib/utils';
import { ArrowLeft, Loader2 } from 'lucide-react';

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
  } catch (error) {
    return { game: null, error: 'Game not found' };
  }
}

export default function LiveGame({ loaderData }: Route.ComponentProps) {
  const { game, error } = loaderData;
  const params = useParams();
  const gameId = params.id!;
  const apiUrl = getApiUrl();

  useEffect(() => {
    // Dynamic import to avoid SSR issues
    import('~/scripts/live-game').then(({ initLiveGame }) => {
      const state = initLiveGame({ gameId, apiUrl });
      return () => state.cleanup();
    });
  }, [gameId, apiUrl]);

  if (error || !game) {
    return (
      <div className="space-y-4">
        <Link to="/games" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft size={12} /> Back to Games
        </Link>
        <div className="border rounded p-8 text-center text-muted-foreground">
          {error || 'Game not found'}
        </div>
      </div>
    );
  }

  const theme = game.persona_theme || 'noir';
  const participants = game.participants || [];
  const mafiaModels = [...new Set(participants.filter(p => p.team === 'mafia').map(p => p.model_name.replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/@.*$/, '')))];
  const townModels = [...new Set(participants.filter(p => p.team === 'town').map(p => p.model_name.replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/@.*$/, '')))];

  return (
    <div className="space-y-4 pb-8" id="live-game-container" data-game-id={gameId} data-api-url={apiUrl}>
      {/* Back Link */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/games" className="hover:text-foreground inline-flex items-center gap-1 transition-colors">
          <ArrowLeft size={12} /> Games
        </Link>
        <span className="opacity-30">/</span>
        <code className="font-mono opacity-50">{gameId.slice(-12)}</code>
        <span className="opacity-30">/</span>
        <span>Live</span>
      </div>

      {/* Status Bar */}
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
          <div id="live-badge" className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-bold tracking-wider uppercase">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            LIVE
          </div>
          <code className="font-mono text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">{gameId}</code>
        </div>

        {/* Teams Display */}
        <div id="teams-display" className="px-4 py-5 bg-gradient-to-b from-background to-muted/20">
          <div className="flex items-center justify-center gap-8">
            <div className="flex-1 text-right">
              <span className="text-rose-500 font-black text-xl">MAFIA</span>
              <div id="mafia-models" className="font-mono text-sm text-muted-foreground">
                {mafiaModels.join(', ') || '—'}
              </div>
            </div>
            <div className="text-muted-foreground font-bold">VS</div>
            <div className="flex-1 text-left">
              <span className="text-indigo-500 font-black text-xl">TOWN</span>
              <div id="town-models" className="font-mono text-sm text-muted-foreground">
                {townModels.join(', ') || '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Telemetry */}
        <div className="grid grid-cols-4 divide-x divide-border border-t bg-muted/20 text-[10px] uppercase tracking-wider">
          <div className="p-2.5 flex flex-col items-center">
            <span className="text-muted-foreground">Round</span>
            <span id="round-display" className="font-mono font-bold text-base">-</span>
          </div>
          <div className="p-2.5 flex flex-col items-center">
            <span className="text-muted-foreground">Phase</span>
            <div id="phase-display" className="font-medium">Starting</div>
          </div>
          <div className="p-2.5 flex flex-col items-center">
            <span className="text-muted-foreground">Duration</span>
            <span id="duration-display" className="font-mono">00:00</span>
          </div>
          <div className="p-2.5 flex flex-col items-center">
            <span className="text-muted-foreground">Tokens</span>
            <span id="token-display" className="font-mono font-bold text-emerald-500">0</span>
          </div>
        </div>
      </div>

      {/* Connection Status */}
      <div id="connection-status" className="text-[10px] text-center text-muted-foreground">
        <div className="flex items-center justify-center gap-2">
          <Loader2 size={10} className="animate-spin" />
          <span>Connecting to feed...</span>
        </div>
      </div>

      {/* Error Banner */}
      <div id="error-banner" className="hidden rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
        <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">Game Failed</div>
        <div id="error-message" className="text-xs text-rose-600/80 dark:text-rose-400/80"></div>
      </div>

      {/* Players Section */}
      <section id="players-section" className="space-y-2 hidden">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">Players</h2>
        <div id="players-grid" className="flex flex-wrap gap-1.5"></div>
      </section>

      {/* Transcript */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Transcript</h2>
        <div id="transcript-container" className="border rounded-md text-xs max-h-[600px] overflow-y-auto">
          <div className="px-3 py-6 text-center text-muted-foreground">
            Waiting for events...
          </div>
        </div>
      </section>

      {/* Game End */}
      <div id="game-end" className="hidden"></div>
    </div>
  );
}

