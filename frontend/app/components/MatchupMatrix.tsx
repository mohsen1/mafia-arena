import { getProviderColor } from '~/lib/providers';
import type { MatchupsResponse, EloResponse } from '~/lib/api';

interface Props {
  matchupsData: MatchupsResponse;
  eloData: EloResponse;
  compact?: boolean;
  showTopModels?: boolean;
}

export function MatchupMatrix({ matchupsData, eloData, compact = false, showTopModels = true }: Props) {
  // Deduplicate models by display_name
  const modelMap = new Map<string, { id: string; display_name: string; provider: string; ids: string[] }>();
  for (const m of matchupsData.models) {
    const existing = modelMap.get(m.display_name);
    if (existing) {
      existing.ids.push(m.id);
    } else {
      modelMap.set(m.display_name, { ...m, ids: [m.id] });
    }
  }
  const uniqueModels = Array.from(modelMap.values());

  // Build matchup matrix with deduplication
  const matrix: Record<string, Record<string, { games: number; wins: number; rate: number }>> = {};

  for (const rowModel of uniqueModels) {
    matrix[rowModel.display_name] = {};
    for (const colModel of uniqueModels) {
      let totalGames = 0;
      let totalWins = 0;
      
      for (const rowId of rowModel.ids) {
        for (const colId of colModel.ids) {
          const matchup = matchupsData.matchups.find(m => m.model_a === rowId && m.model_b === colId);
          if (matchup) {
            totalGames += matchup.games;
            totalWins += matchup.model_a_wins;
          }
        }
      }
      
      if (totalGames > 0) {
        matrix[rowModel.display_name][colModel.display_name] = {
          games: totalGames,
          wins: totalWins,
          rate: totalWins / totalGames,
        };
      }
    }
  }

  // Use ELO rankings for the leaderboard (top 10)
  const eloTop10 = eloData.rankings.slice(0, 10);

  // Map ELO rankings to include model info for display
  const top10WithModels = eloTop10.map(elo => {
    const modelInfo = uniqueModels.find(m => m.display_name === elo.display_name);
    return {
      ...elo,
      model: modelInfo || { id: elo.model_ids?.[0] || '', display_name: elo.display_name, provider: '', ids: elo.model_ids || [] },
    };
  });

  // For the matrix, use ELO order
  const eloModelNames = eloTop10.map(e => e.display_name);
  const sortedModels = eloModelNames
    .map(name => uniqueModels.find(m => m.display_name === name))
    .filter(Boolean) as typeof uniqueModels;

  // For the matrix, only show top 10 models
  const displayModels = compact ? sortedModels.slice(0, 6) : sortedModels.slice(0, 10);

  function getHeatColor(rate: number): string {
    const hue = Math.round(rate * 120);
    const sat = 70 + Math.abs(rate - 0.5) * 40;
    const light = 45;
    return `hsl(${hue}, ${sat}%, ${light}%)`;
  }

  function getRankIcon(index: number): string {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `${index + 1}`;
  }

  if (displayModels.length === 0) {
    return (
      <div className="rounded border p-4 text-center text-sm text-muted-foreground">
        No matchup data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top 10 Models Table - ELO Rankings */}
      {showTopModels && top10WithModels.length > 0 && (
        <div className="rounded border bg-card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-8">#</th>
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Model</th>
                <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-14">ELO</th>
                <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-14">Win%</th>
                <th className="px-2 py-1.5 text-right font-medium text-muted-foreground w-14">W-L</th>
              </tr>
            </thead>
            <tbody>
              {top10WithModels.map((entry, i) => {
                const modelId = entry.model_ids?.[0] || entry.model.ids?.[0] || '';
                const gamesUrl = modelId ? `/games?model=${encodeURIComponent(modelId)}` : '/games';
                
                return (
                  <tr 
                    key={entry.display_name}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer group"
                    onClick={() => window.location.href = gamesUrl}
                  >
                    <td className="px-2 py-1 font-medium tabular-nums">{getRankIcon(i)}</td>
                    <td className="px-2 py-1">
                      <a href={gamesUrl} className="flex items-center gap-1.5 group-hover:text-primary transition-colors">
                        <span 
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0" 
                          style={{ background: getProviderColor(entry.model.provider) }}
                        />
                        <span className="font-medium truncate">{entry.display_name}</span>
                      </a>
                    </td>
                    <td className="px-2 py-1 text-right font-bold tabular-nums text-emerald-500">
                      {entry.elo}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                      {(entry.win_rate * 100).toFixed(0)}%
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                      {entry.wins}-{entry.losses}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-2 py-1 text-[10px] text-muted-foreground border-t bg-muted/20">
            ELO accounts for opponent strength — beating strong models earns more points
          </div>
        </div>
      )}

      {/* Head-to-Head Matrix */}
      <div className="rounded border bg-card overflow-hidden">
        {/* Mobile: Hidden matrix, show message */}
        <div className="md:hidden p-4 text-center text-sm text-muted-foreground">
          <p>Matrix view available on larger screens</p>
        </div>
        
        {/* Desktop: Full matrix */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-card border-b border-r p-0">
                  <div className={`${compact ? 'w-24 h-20' : 'w-28 h-24'} relative`}>
                    <span className="absolute top-1 left-1.5 text-[8px] text-muted-foreground font-medium">vs</span>
                    <div className={`absolute top-1 ${compact ? 'left-6 right-0.5' : 'left-7 right-1'} flex items-center gap-0.5`}>
                      <div className="flex-1 border-t border-dashed border-blue-400/50"></div>
                      <span className="text-[7px] text-blue-400 uppercase tracking-wide font-semibold">town</span>
                      <span className="text-blue-400 text-[10px] leading-none">→</span>
                    </div>
                    <div className={`absolute ${compact ? 'top-5 bottom-0.5 left-1.5' : 'top-6 bottom-1 left-1.5'} flex flex-col items-center gap-0.5`}>
                      <div className="flex-1 border-l border-dashed border-red-400/50"></div>
                      <span className="text-[7px] text-red-400 uppercase tracking-wide font-semibold [writing-mode:vertical-lr]">mafia</span>
                      <span className="text-red-400 text-[10px] leading-none">↓</span>
                    </div>
                  </div>
                </th>
                {displayModels.map(m => (
                  <th key={m.id} className={`border-b p-0 min-w-[32px] ${compact ? 'h-20' : 'h-24'} align-bottom`}>
                    <div className="h-full flex flex-col items-center justify-end pb-1">
                      <div className="[writing-mode:vertical-rl] rotate-180 flex items-center gap-0.5">
                        <span 
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0" 
                          style={{ background: getProviderColor(m.provider) }}
                        />
                        <span className="font-medium whitespace-nowrap text-[9px]">{m.display_name}</span>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayModels.map((rowModel) => (
                <tr key={rowModel.id} className="group">
                  <td className="sticky left-0 z-10 bg-card border-r p-0">
                    <div className={`${compact ? 'w-24' : 'w-28'} h-7 flex items-center gap-1 px-1 group-hover:bg-muted/50 transition-colors`}>
                      <span 
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0" 
                        style={{ background: getProviderColor(rowModel.provider) }}
                      />
                      <span className="font-medium truncate text-[9px]">{rowModel.display_name}</span>
                    </div>
                  </td>
                  {displayModels.map((colModel) => {
                    const cell = matrix[rowModel.display_name]?.[colModel.display_name];
                    const isSelf = rowModel.display_name === colModel.display_name;
                    
                    return (
                      <td key={colModel.id} className="p-px">
                        {isSelf ? (
                          <div className="w-full h-7 bg-muted/30 flex items-center justify-center text-muted-foreground">—</div>
                        ) : cell ? (
                          <div 
                            className="w-full h-7 flex items-center justify-center text-white text-[9px] font-semibold hover:ring-1 hover:ring-white/50"
                            style={{ background: getHeatColor(cell.rate) }}
                            title={`${rowModel.display_name} vs ${colModel.display_name}\n${cell.wins}/${cell.games} wins (${(cell.rate * 100).toFixed(1)}%)`}
                          >
                            {(cell.rate * 100).toFixed(0)}%
                          </div>
                        ) : (
                          <div className="w-full h-7 bg-muted/10 flex items-center justify-center text-[8px] text-muted-foreground/50">—</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

