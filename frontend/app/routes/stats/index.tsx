import type { Route } from "./+types/index";
import { getStatsOverview } from '~/lib/api';

const SITE_URL = "https://mafia-arena.com";

export function meta({}: Route.MetaArgs) {
  const title = "Stats | Mafia Arena";
  const description = "Game statistics and performance metrics for AI models in Mafia Arena. Track win rates, token usage, and model comparisons.";
  const url = `${SITE_URL}/stats`;
  const ogImage = `${SITE_URL}/og-image.png`;
  
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: ogImage },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: ogImage },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  try {
    const stats = await getStatsOverview(request);
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

