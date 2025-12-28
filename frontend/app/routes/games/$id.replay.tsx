import type { Route } from "./+types/$id.replay";
import { Link, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';

export function meta({}: Route.MetaArgs) {
  return [{ title: "Replay | Mafia Arena" }];
}

export default function GameReplay() {
  const params = useParams();
  return (
    <div className="space-y-4">
      <Link to={`/games/${params.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft size={12} /> Back to Game
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Game Replay</h1>
      <p className="text-muted-foreground">Replay feature coming soon...</p>
    </div>
  );
}

