import { Link, useSearchParams, useNavigate } from 'react-router';
import type { Route } from "./+types/index";
import { getGames, getLiveGames, getMatchups, formatDuration, type GameFilters } from '~/lib/api';
import { getDisplayCost, formatCost } from '~/lib/costs';
import { ChevronLeft, ChevronRight, ChevronDown, Radio, X } from 'lucide-react';

const SITE_URL = "https://mafia-arena.com";

export function meta({}: Route.MetaArgs) {
  const title = "Games | Mafia Arena";
  const description = "Browse all AI vs AI Mafia games. Watch LLMs compete in social deduction, deception, and strategic reasoning.";
  const url = `${SITE_URL}/games`;
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
  const url = new URL(request.url);
  const LIMIT = 25;
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const offset = (page - 1) * LIMIT;

  const modelFilter = url.searchParams.get('model') || undefined;
  const winnerFilter = url.searchParams.get('winner') as 'mafia' | 'town' | undefined;
  const themeFilter = url.searchParams.get('theme') as 'noir' | 'victorian' | 'modern' | 'fantasy' | undefined;

  const filters: GameFilters = {};
  if (modelFilter) filters.model = modelFilter;
  if (winnerFilter && (winnerFilter === 'mafia' || winnerFilter === 'town')) filters.winner = winnerFilter;
  if (themeFilter && ['noir', 'victorian', 'modern', 'fantasy'].includes(themeFilter)) filters.theme = themeFilter;

  try {
    const [liveGamesResult, completedGamesResult, matchupsData] = await Promise.all([
      getLiveGames(),
      getGames(LIMIT, offset, 'completed', filters),
      getMatchups(),
    ]);

    return {
      liveGames: liveGamesResult.games,
      games: completedGamesResult.games,
      total: completedGamesResult.total,
      hasMore: completedGamesResult.hasMore,
      page,
      limit: LIMIT,
      filters,
      models: matchupsData.models.filter(m => !m.id.startsWith('test/')),
    };
  } catch (error) {
    return {
      liveGames: [],
      games: [],
      total: 0,
      hasMore: false,
      page,
      limit: LIMIT,
      filters,
      models: [],
    };
  }
}

const THEMES: Record<string, string> = {
  noir: 'Noir',
  victorian: 'Victorian',
  modern: 'Modern',
  fantasy: 'Fantasy',
};

function formatRelativeTime(timestamp: number | string | null | undefined): string {
  if (timestamp == null) return '—';
  
  let ts: number;
  if (typeof timestamp === 'string') {
    ts = new Date(timestamp).getTime();
  } else if (Number.isFinite(timestamp)) {
    ts = timestamp > 9999999999 ? timestamp : timestamp * 1000;
  } else {
    return '—';
  }
  
  if (isNaN(ts)) return '—';
  
  const now = Date.now();
  const diffMs = now - ts;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  
  if (diffDay > 0) return rtf.format(-diffDay, 'day');
  if (diffHour > 0) return rtf.format(-diffHour, 'hour');
  if (diffMin > 0) return rtf.format(-diffMin, 'minute');
  return rtf.format(-diffSec, 'second');
}

function getShortModelName(modelId: string): string {
  let name = modelId.split('/').pop() || modelId;
  if (name.includes(': ')) {
    name = name.split(': ').slice(1).join(': ');
  }
  return name.replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/@.*$/, '');
}

function formatDisplayModelName(name: string): string {
  return name.split('-').map(part => {
    if (part.match(/^\d/)) return part;
    if (part === 'gpt' || part === 'o1' || part === 'o3') return part.toUpperCase();
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join(' ');
}

/**
 * Parse config_hash to extract model IDs for running games.
 * Format: {playerCount}-{mafiaCount}-{model1:count1},{model2:count2}
 * Example: 11-2-google/gemini-2.5-flash-lite:9,fireworks/glm-4p7:2
 */
function parseConfigHash(configHash: string | undefined, mafiaCount?: number) {
  if (!configHash) return { mafia: null, town: null };
  
  const parts = configHash.split('-');
  if (parts.length < 3) return { mafia: null, town: null };
  
  const mafiaCountFromHash = parseInt(parts[1], 10);
  const teamsStr = parts.slice(2).join('-'); // Rejoin in case model IDs contain dashes
  const teams = teamsStr.split(',').map(t => {
    const lastColon = t.lastIndexOf(':');
    if (lastColon === -1) return { modelId: t, count: 0 };
    return {
      modelId: t.slice(0, lastColon),
      count: parseInt(t.slice(lastColon + 1), 10),
    };
  });
  
  // The team with count matching mafiaCount is mafia, the larger one is town
  const actualMafiaCount = mafiaCount ?? mafiaCountFromHash;
  const mafiaTeam = teams.find(t => t.count === actualMafiaCount);
  const townTeam = teams.find(t => t.count !== actualMafiaCount);
  
  return {
    mafia: mafiaTeam?.modelId || null,
    town: townTeam?.modelId || null,
  };
}

function getMatchup(game: any) {
  const participants = game.participants || [];
  const mafia = participants.find((p: any) => p.team === 'mafia');
  const town = participants.find((p: any) => p.team === 'town');
  
  // Fall back to parsing config_hash for running games without participants yet
  let mafiaModel = mafia?.model_name || mafia?.model_id;
  let townModel = town?.model_name || town?.model_id;
  
  if (!mafiaModel || !townModel) {
    const fromConfig = parseConfigHash(game.config_hash, game.mafia_count);
    mafiaModel = mafiaModel || fromConfig.mafia || '?';
    townModel = townModel || fromConfig.town || '?';
  }
  
  const mafiaWon = game.winner === 'mafia';
  const shortMafia = getShortModelName(mafiaModel);
  const shortTown = getShortModelName(townModel);
  return {
    mafia: formatDisplayModelName(shortMafia),
    town: formatDisplayModelName(shortTown),
    mafiaWon,
    winnerModel: mafiaWon ? formatDisplayModelName(shortMafia) : formatDisplayModelName(shortTown),
  };
}

function getGameCost(game: any): number {
  return getDisplayCost(game.cost_usd, game.total_tokens || 0);
}

export default function GamesIndex({ loaderData }: Route.ComponentProps) {
  const { liveGames, games, total, hasMore, page, limit, filters, models } = loaderData;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const hasFilters = Object.keys(filters).length > 0;
  const totalPages = Math.ceil(total / limit);
  const hasPrev = page > 1;
  const hasNext = hasMore;

  const modelFilter = filters.model;
  const winnerFilter = filters.winner;
  const themeFilter = filters.theme;

  // Group models by provider
  const modelsByProvider = models.reduce((acc, model) => {
    const provider = model.provider || 'other';
    if (!acc[provider]) acc[provider] = [];
    acc[provider].push(model);
    return acc;
  }, {} as Record<string, typeof models>);

  const providerOrder = ['anthropic', 'openai', 'google', 'meta', 'other'];
  const sortedProviders = Object.keys(modelsByProvider).sort((a, b) => {
    const aIndex = providerOrder.indexOf(a.toLowerCase());
    const bIndex = providerOrder.indexOf(b.toLowerCase());
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  const selectedModelName = modelFilter 
    ? models.find(m => m.id === modelFilter)?.display_name || modelFilter 
    : null;

  function buildUrl(newPage: number): string {
    const params = new URLSearchParams();
    params.set('page', String(newPage));
    if (modelFilter) params.set('model', modelFilter);
    if (winnerFilter) params.set('winner', winnerFilter);
    if (themeFilter) params.set('theme', themeFilter);
    return `/games?${params}`;
  }

  function updateFilters(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page'); // Reset to page 1 when filters change
    navigate(`/games${params.toString() ? `?${params}` : ''}`);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Games</h1>
        <span className="text-xs text-muted-foreground">
          {total} {hasFilters ? 'matching' : 'completed'}{liveGames.length > 0 && !hasFilters ? ` · ${liveGames.length} live` : ''}
        </span>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2">
        {/* Filters container - horizontal scroll on mobile */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto -mx-1 px-1">
          {/* Model Filter */}
          <div className="relative shrink-0">
            <select 
              className="appearance-none text-xs sm:text-xs border rounded px-2 py-1.5 sm:py-1 pr-6 bg-background hover:bg-muted/50 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
              value={modelFilter || ''}
              onChange={(e) => updateFilters('model', e.target.value)}
            >
              <option value="">All Models</option>
              {sortedProviders.map(provider => (
                <optgroup key={provider} label={provider.charAt(0).toUpperCase() + provider.slice(1)}>
                  {modelsByProvider[provider].map(model => (
                    <option key={model.id} value={model.id}>{model.display_name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
          </div>

          {/* Winner Filter */}
          <div className="relative shrink-0">
            <select 
              className="appearance-none text-xs sm:text-xs border rounded px-2 py-1.5 sm:py-1 pr-6 bg-background hover:bg-muted/50 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
              value={winnerFilter || ''}
              onChange={(e) => updateFilters('winner', e.target.value)}
            >
              <option value="">All Winners</option>
              <option value="mafia">Mafia</option>
              <option value="town">Town</option>
            </select>
            <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
          </div>

          {/* Theme Filter */}
          <div className="relative shrink-0">
            <select 
              className="appearance-none text-xs sm:text-xs border rounded px-2 py-1.5 sm:py-1 pr-6 bg-background hover:bg-muted/50 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
              value={themeFilter || ''}
              onChange={(e) => updateFilters('theme', e.target.value)}
            >
              <option value="">All Themes</option>
              <option value="noir">Noir</option>
              <option value="victorian">Victorian</option>
              <option value="modern">Modern</option>
              <option value="fantasy">Fantasy</option>
            </select>
            <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
          </div>

          {/* Clear Filters */}
          {hasFilters && (
            <Link 
              to="/games" 
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <X size={12} />
              Clear
            </Link>
          )}
        </div>

        {/* Active Filter Pills */}
        {hasFilters && (
          <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
            {selectedModelName && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {selectedModelName}
              </span>
            )}
            {winnerFilter && (
              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${
                winnerFilter === 'mafia' 
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' 
                  : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
              }`}>
                {winnerFilter === 'mafia' ? 'Mafia wins' : 'Town wins'}
              </span>
            )}
            {themeFilter && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                {THEMES[themeFilter]}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Live Games */}
      {!hasFilters && liveGames.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
            </span>
            Live
          </div>
          {liveGames.map(game => {
            const m = getMatchup(game);
            return (
              <Link 
                key={game.id}
                to={`/games/${game.id}/live`} 
                className="flex items-center justify-between border rounded px-3 py-2 hover:bg-muted/30 transition-colors text-xs group"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{m.mafia}</span>
                  <span className="text-muted-foreground/40 text-[10px] font-bold">vs</span>
                  <span className="font-medium">{m.town}</span>
                  {game.rounds > 0 && <span className="text-muted-foreground/50 text-[10px]">R{game.rounds}</span>}
                </div>
                <span className="flex items-center gap-1 text-muted-foreground group-hover:text-foreground transition-colors">
                  <Radio size={10} />
                  Watch
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Games List */}
      {games.length === 0 ? (
        <div className="border rounded py-8 text-center text-sm text-muted-foreground">
          {hasFilters ? 'No games match the selected filters' : 'No games yet'}
        </div>
      ) : (
        <div className="border rounded overflow-hidden text-xs md:border-0 md:rounded-none">
          <table className="w-full card-table">
            <thead className="hidden md:table-header-group">
              <tr className="bg-muted/30 border-b text-[10px] text-muted-foreground uppercase tracking-wide">
                <th className="text-left font-normal px-3 py-1.5 w-[40%]">Matchup <span className="normal-case font-light opacity-70">(Mafia vs Town)</span></th>
                <th className="text-left font-normal px-3 py-1.5 w-[20%]">Winner</th>
                <th className="text-center font-normal px-2 py-1.5 w-14">Rounds</th>
                <th className="text-right font-normal px-2 py-1.5 w-16">Time</th>
                <th className="text-right font-normal px-2 py-1.5 w-14">Cost</th>
                <th className="text-center font-normal px-2 py-1.5 w-20">Theme</th>
                <th className="text-right font-normal px-3 py-1.5">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 md:divide-y">
              {games.map(game => {
                const m = getMatchup(game);
                const theme = (game.persona_theme && THEMES[game.persona_theme]) || 'Noir';
                const cost = getGameCost(game);
                return (
                  <tr 
                    key={game.id}
                    className="hover:bg-muted/20 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/games/${game.id}`)}
                  >
                    <td data-label="Matchup" className="px-3 py-1.5 max-w-0 md:max-w-none">
                      <Link to={`/games/${game.id}`} className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="truncate">{m.mafia}</span>
                        <span className="text-muted-foreground/30 text-[10px] shrink-0">vs</span>
                        <span className="truncate">{m.town}</span>
                      </Link>
                    </td>
                    <td data-label="Winner" className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{m.winnerModel}</span>
                        <span className={`shrink-0 text-[9px] px-1 rounded ${
                          m.mafiaWon ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                        }`}>
                          {m.mafiaWon ? 'M' : 'T'}
                        </span>
                      </div>
                    </td>
                    <td data-label="Rounds" className="px-2 py-1.5 text-center font-mono text-muted-foreground mobile-hide">{game.rounds}</td>
                    <td data-label="Time" className="px-2 py-1.5 text-right font-mono text-muted-foreground whitespace-nowrap mobile-hide">{formatDuration(game.duration_ms || 0)}</td>
                    <td data-label="Cost" className="px-2 py-1.5 text-right font-mono text-muted-foreground mobile-hide">{formatCost(cost)}</td>
                    <td data-label="Theme" className="px-2 py-1.5 text-center text-muted-foreground mobile-hide">{theme}</td>
                    <td data-label="Date" className="px-3 py-1.5 text-right text-muted-foreground whitespace-nowrap">{formatRelativeTime(game.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{page}/{totalPages}</span>
          <div className="flex items-center gap-1">
            {hasPrev ? (
              <Link 
                to={buildUrl(page - 1)}
                className="inline-flex items-center gap-0.5 px-2 py-1 border rounded hover:bg-muted transition-colors"
              >
                <ChevronLeft size={12} /> Prev
              </Link>
            ) : (
              <span className="inline-flex items-center gap-0.5 px-2 py-1 border rounded text-muted-foreground/50 cursor-not-allowed">
                <ChevronLeft size={12} /> Prev
              </span>
            )}
            {hasNext ? (
              <Link 
                to={buildUrl(page + 1)}
                className="inline-flex items-center gap-0.5 px-2 py-1 border rounded hover:bg-muted transition-colors"
              >
                Next <ChevronRight size={12} />
              </Link>
            ) : (
              <span className="inline-flex items-center gap-0.5 px-2 py-1 border rounded text-muted-foreground/50 cursor-not-allowed">
                Next <ChevronRight size={12} />
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

