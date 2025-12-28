import { useEffect } from 'react';
import { useParams, Link } from 'react-router';
import type { Route } from "./+types/$id.live";
import { getGame } from '~/lib/api';
import { getApiUrl } from '~/lib/utils';
import { ArrowLeft } from 'lucide-react';
import { GameHeader, GameLayout, TranscriptContainer } from '~/components/GameHeader';

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

  const participants = game.participants || [];
  const mafiaModels = [...new Set(participants.filter(p => p.team === 'mafia').map(p => p.model_name.replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/@.*$/, '')))].join(', ');
  const townModels = [...new Set(participants.filter(p => p.team === 'town').map(p => p.model_name.replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/@.*$/, '')))].join(', ');

  return (
    <GameLayout gameId={gameId} apiUrl={apiUrl}>
      <GameHeader
        status="live"
        theme={game.persona_theme || 'noir'}
        mafiaModels={mafiaModels}
        townModels={townModels}
        isLive={true}
      />
      <TranscriptContainer />
    </GameLayout>
  );
}
