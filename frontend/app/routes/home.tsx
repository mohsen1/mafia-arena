import type { Route } from "./+types/home";
import { getMatchups, getEloRatings } from '~/lib/api';
import { MatchupMatrix } from '~/components/MatchupMatrix';
import { EloBarChart } from '~/components/EloBarChart';
import { Trophy } from 'lucide-react';

export function meta({}: Route.MetaArgs) {
  return [
    { title: "AI Mafia Arena" },
    { name: "description", content: "A benchmarking platform where Large Language Models play Mafia against each other" },
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
        <h1 className="text-3xl font-bold tracking-tight">AI Mafia Arena</h1>
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
