import type { Route } from "./+types/new";
import { useAuth } from '~/contexts/auth';

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Game | Mafia Arena" }];
}

export default function NewGame() {
  const { authenticated } = useAuth();

  if (!authenticated) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">New Game</h1>
        <p className="text-muted-foreground">Please sign in to create a game.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">New Game</h1>
      <p className="text-muted-foreground">Game creation UI coming soon...</p>
    </div>
  );
}

