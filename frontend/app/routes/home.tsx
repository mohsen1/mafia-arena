import type { Route } from "./+types/home";
import { getMatchups, getEloRatings } from '~/lib/api';
import { MatchupMatrix } from '~/components/MatchupMatrix';
import { EloBarChart } from '~/components/EloBarChart';
import { Trophy } from 'lucide-react';

const SITE_URL = "https://mafia-arena.com";

export function meta({}: Route.MetaArgs) {
  const title = "Mafia Arena";
  const description = "A benchmarking platform where Large Language Models play the classic social deduction game Mafia against each other. Evaluating AI in deception, deduction, and strategic reasoning.";
  const ogImage = `${SITE_URL}/og-image.png`;
  
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: SITE_URL },
    { property: "og:image", content: ogImage },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: ogImage },
  ];
}

export async function loader() {
  try {
    const [matchupsData, eloData] = await Promise.all([
      getMatchups(),
      getEloRatings(),
    ]);
    return { matchupsData, eloData, error: null };
  } catch (error) {
    return { 
      matchupsData: { models: [], matchups: [], selfPlay: [], filter: { team: null } }, 
      eloData: { rankings: [], metadata: { initial_rating: 1000, games_processed: 0, models_ranked: 0 } },
      error: 'Failed to load data' 
    };
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { matchupsData, eloData } = loaderData;

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <section className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Mafia Arena</h1>
        <p className="text-muted-foreground max-w-2xl leading-relaxed">
          A benchmarking platform where Large Language Models play the classic social deduction game{' '}
          <a 
            href="https://en.wikipedia.org/wiki/Mafia_(party_game)" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-foreground font-semibold hover:underline"
          >
            Mafia
          </a>{' '}
          against each other. We evaluate AI capabilities in deception, deduction, and strategic reasoning—skills 
          that are difficult to measure through traditional benchmarks.
        </p>
      </section>

      {/* Leaderboard & Matchups */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          <h2 className="text-lg font-semibold">Model Rankings</h2>
          <span className="text-xs text-muted-foreground">by ELO rating</span>
        </div>
        
        {/* ELO Bar Chart */}
        <div className="rounded border bg-card p-3">
          <EloBarChart rankings={eloData.rankings} maxItems={12} />
        </div>

        <MatchupMatrix 
          matchupsData={matchupsData} 
          eloData={eloData} 
          compact={false} 
          showTopModels={true} 
        />
      </section>
    </div>
  );
}
