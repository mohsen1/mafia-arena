import type { Route } from "./+types/$id";
import { Link } from 'react-router';
import { getGame, getTranscript, formatDuration } from '~/lib/api';
import { getDisplayCost, formatCost } from '~/lib/costs';
import { ArrowLeft, Clock, Coins, Users, Trophy } from 'lucide-react';

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: `Game ${data?.game?.id?.slice(-8) || ''} | Mafia Arena` },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const gameId = params.id!;
  try {
    const [game, transcript] = await Promise.all([
      getGame(gameId),
      getTranscript(gameId).catch(() => null),
    ]);
    return { game, transcript, error: null };
  } catch (error) {
    return { game: null, transcript: null, error: 'Game not found' };
  }
}

export default function GameDetail({ loaderData }: Route.ComponentProps) {
  const { game, transcript, error } = loaderData;

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

  const cost = getDisplayCost(game.cost_usd, game.total_tokens);
  const winner = game.winner;
  const winnerColor = winner === 'mafia' ? 'text-rose-500' : 'text-indigo-500';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/games" className="hover:text-foreground inline-flex items-center gap-1 transition-colors">
          <ArrowLeft size={12} /> Games
        </Link>
        <span className="opacity-30">/</span>
        <code className="font-mono">{game.id.slice(-12)}</code>
      </div>

      {/* Game Info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border rounded p-3 space-y-1">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Trophy size={12} />
            Winner
          </div>
          <div className={`font-semibold capitalize ${winnerColor}`}>
            {winner || 'In Progress'}
          </div>
        </div>
        <div className="border rounded p-3 space-y-1">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Users size={12} />
            Players
          </div>
          <div className="font-semibold">{game.player_count}</div>
        </div>
        <div className="border rounded p-3 space-y-1">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock size={12} />
            Duration
          </div>
          <div className="font-mono">{formatDuration(game.duration_ms || 0)}</div>
        </div>
        <div className="border rounded p-3 space-y-1">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Coins size={12} />
            Cost
          </div>
          <div className="font-mono">{formatCost(cost)}</div>
        </div>
      </div>

      {/* Participants */}
      {game.participants && game.participants.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Participants</h2>
          <div className="flex flex-wrap gap-2">
            {game.participants.map((p, i) => (
              <span 
                key={i}
                className={`text-xs px-2 py-1 rounded border ${
                  p.team === 'mafia' 
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400' 
                    : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
                }`}
              >
                {p.model_name} ({p.player_count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Transcript */}
      {transcript && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Transcript</h2>
          <div className="border rounded p-4 max-h-[600px] overflow-y-auto">
            <pre className="text-xs whitespace-pre-wrap font-mono">
              {JSON.stringify(transcript, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

