import type { Route } from "./+types/new";
import { useAuth } from '~/contexts/auth';

export function meta({}: Route.MetaArgs) {
  return [{ title: "Run Game | Mafia Arena" }];
}

export default function RunGame() {
  const { user } = useAuth();

  if (!user?.isAdmin) {
    return <div>Access denied</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Run Game</h1>
      <p className="text-muted-foreground">Game runner coming soon...</p>
    </div>
  );
}

