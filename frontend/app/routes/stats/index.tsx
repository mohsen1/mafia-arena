import type { Route } from "./+types/index";
import { getStatsOverview } from '~/lib/api';

export function meta({}: Route.MetaArgs) {
  return [{ title: "Stats | Mafia Arena" }];
}

export async function loader() {
  try {
    const stats = await getStatsOverview();
    return { stats, error: null };
  } catch (error) {
    return { stats: null, error: 'Failed to load stats' };
  }
}

export default function Stats({ loaderData }: Route.ComponentProps) {
  const { stats, error } = loaderData;

  if (error || !stats) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
        <div className="border rounded p-8 text-center text-muted-foreground">
          {error || 'Failed to load stats'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border rounded p-4 space-y-1">
          <div className="text-xs text-muted-foreground">Total Games</div>
          <div className="text-2xl font-bold">{stats.totals.games}</div>
        </div>
        <div className="border rounded p-4 space-y-1">
          <div className="text-xs text-muted-foreground">Mafia Wins</div>
          <div className="text-2xl font-bold text-rose-500">{stats.totals.mafiaWins}</div>
        </div>
        <div className="border rounded p-4 space-y-1">
          <div className="text-xs text-muted-foreground">Town Wins</div>
          <div className="text-2xl font-bold text-indigo-500">{stats.totals.townWins}</div>
        </div>
        <div className="border rounded p-4 space-y-1">
          <div className="text-xs text-muted-foreground">Total Tokens</div>
          <div className="text-2xl font-bold">{stats.totals.tokens.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

