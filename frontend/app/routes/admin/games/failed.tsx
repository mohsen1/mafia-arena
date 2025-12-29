import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/failed";
import { useAuth } from "~/contexts/auth";
import { getApiUrl } from "~/lib/utils";
import {
  AlertTriangle,
  RefreshCw,
  Play,
  Loader2,
  Clock,
  Wifi,
  Key,
  CircleSlash,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
} from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Failed Games | Mafia Arena Admin" }];
}

interface FailedGame {
  id: string;
  batchId: string | null;
  rounds: number | null;
  errorMessage: string | null;
  playerCount: number;
  mafiaCount: number;
  createdAt: number;
  updatedAt: number | null;
  lastActivity: number | null;
  personaTheme: string | null;
  errorCategory: "rate_limit" | "timeout" | "auth" | "model_error" | "network" | "unknown";
  recoverable: boolean;
}

interface Summary {
  total: number;
  byCategory: {
    rate_limit: number;
    timeout: number;
    auth: number;
    model_error: number;
    network: number;
    unknown: number;
  };
  recoverable: number;
}

const CATEGORY_INFO: Record<
  string,
  {
    label: string;
    icon: typeof AlertTriangle;
    color: string;
    bgColor: string;
    description: string;
  }
> = {
  rate_limit: {
    label: "Rate Limit",
    icon: Clock,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500/10",
    description: "API rate limit exceeded. Safe to retry after waiting.",
  },
  timeout: {
    label: "Timeout",
    icon: Clock,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-500/10",
    description: "Request timed out. Usually safe to retry.",
  },
  network: {
    label: "Network",
    icon: Wifi,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500/10",
    description: "Network connectivity issue. Retry when connection restored.",
  },
  auth: {
    label: "Auth Error",
    icon: Key,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500/10",
    description: "Authentication failed. Check API keys before retrying.",
  },
  model_error: {
    label: "Model Error",
    icon: CircleSlash,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500/10",
    description: "Model not found or context length exceeded. May require config fix.",
  },
  unknown: {
    label: "Unknown",
    icon: HelpCircle,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    description: "Unknown error. May be safe to retry.",
  },
};

export default function FailedGames() {
  const { authenticated, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const pageParam = searchParams.get("page") || "1";
  const categoryFilter = searchParams.get("category") || "";
  const page = parseInt(pageParam);
  const limit = 20;
  const offset = (page - 1) * limit;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<FailedGame[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [total, setTotal] = useState(0);
  const [resumingIds, setResumingIds] = useState<Set<string>>(new Set());

  const apiUrl = getApiUrl();

  useEffect(() => {
    if (authLoading) return;

    const credentials = sessionStorage.getItem("adminCredentials");
    if (!credentials && !authenticated) {
      window.location.href = `/admin/login?redirect=${encodeURIComponent(
        window.location.pathname + window.location.search
      )}`;
      return;
    }
    loadGames();
  }, [page, categoryFilter, authLoading, authenticated]);

  async function loadGames() {
    setLoading(true);
    setError(null);

    const credentials = sessionStorage.getItem("adminCredentials");
    const headers: Record<string, string> = credentials
      ? { Authorization: `Basic ${credentials}` }
      : {};

    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));

      const res = await fetch(`${apiUrl}/api/admin/games/failed?${params}`, {
        headers,
        credentials: "include",
      });

      if (res.status === 401) {
        sessionStorage.removeItem("adminCredentials");
        window.location.href = "/admin/login?redirect=" + encodeURIComponent(window.location.pathname);
        return;
      }

      if (!res.ok) throw new Error("Failed to load failed games");

      const data = (await res.json()) as {
        games: FailedGame[];
        total: number;
        summary: Summary;
      };

      // Apply client-side filtering by category if needed
      let filteredGames = data.games;
      if (categoryFilter) {
        filteredGames = data.games.filter((g) => g.errorCategory === categoryFilter);
      }

      setGames(filteredGames);
      setTotal(categoryFilter ? filteredGames.length : data.total);
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleResume(gameId: string) {
    const credentials = sessionStorage.getItem("adminCredentials");
    const headers: Record<string, string> = credentials
      ? { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" };

    setResumingIds((prev) => new Set([...prev, gameId]));

    try {
      const res = await fetch(`${apiUrl}/api/admin/games/${gameId}/resume`, {
        method: "POST",
        headers,
        credentials: "include",
      });

      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        throw new Error(err.message || "Failed to resume game");
      }

      // Remove from list on success
      setGames((prev) => prev.filter((g) => g.id !== gameId));
      setTotal((prev) => prev - 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to resume game");
    } finally {
      setResumingIds((prev) => {
        const next = new Set(prev);
        next.delete(gameId);
        return next;
      });
    }
  }

  async function handleResumeAll() {
    const recoverableGames = games.filter((g) => g.recoverable);
    if (recoverableGames.length === 0) return;

    if (
      !confirm(
        `Resume all ${recoverableGames.length} recoverable games?\n\nThis will attempt to restart games from their last checkpoint.`
      )
    ) {
      return;
    }

    for (const game of recoverableGames) {
      await handleResume(game.id);
    }
  }

  const totalPages = Math.ceil(total / limit);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground font-mono">
            {authLoading ? "Checking session..." : "Loading..."}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono mb-2">
            <Link to="/admin" className="hover:text-foreground transition-colors">
              admin
            </Link>
            <span>/</span>
            <span>games</span>
            <span>/</span>
            <span>failed</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Failed Games</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and retry games that encountered errors
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadGames}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border hover:bg-muted transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          {summary && summary.recoverable > 0 && (
            <button
              onClick={handleResumeAll}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              <Play size={14} />
              Resume All ({summary.recoverable})
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Link
            to="/admin/games/failed"
            className={`border rounded-lg p-3 hover:bg-muted/50 transition-colors ${
              !categoryFilter ? "ring-2 ring-foreground/20" : ""
            }`}
          >
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Total
            </div>
            <div className="text-2xl font-bold tabular-nums">{summary.total}</div>
          </Link>

          {Object.entries(CATEGORY_INFO).map(([key, info]) => {
            const count = summary.byCategory[key as keyof typeof summary.byCategory];
            const Icon = info.icon;
            return (
              <Link
                key={key}
                to={`/admin/games/failed?category=${key}`}
                className={`border rounded-lg p-3 hover:bg-muted/50 transition-colors ${
                  categoryFilter === key ? "ring-2 ring-foreground/20" : ""
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Icon size={12} className={info.color} />
                  <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    {info.label}
                  </span>
                </div>
                <div className={`text-2xl font-bold tabular-nums ${count > 0 ? info.color : ""}`}>
                  {count}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Table */}
      {!error && (
        <div className="space-y-4">
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Game ID
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Category
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Error Message
                  </th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Failed At
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {games.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle size={32} className="text-emerald-500" />
                        <span className="text-muted-foreground">No failed games!</span>
                        <span className="text-xs text-muted-foreground">
                          All games are running or completed successfully.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  games.map((game) => {
                    const categoryInfo = CATEGORY_INFO[game.errorCategory];
                    const Icon = categoryInfo.icon;
                    const isResuming = resumingIds.has(game.id);

                    return (
                      <tr key={game.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4">
                          <Link
                            to={`/games/${game.id}`}
                            className="font-mono text-xs hover:underline"
                          >
                            {game.id.substring(0, 20)}...
                          </Link>
                          {game.batchId && (
                            <div className="text-xs text-muted-foreground">
                              <Link
                                to={`/admin/batches/${game.batchId}`}
                                className="hover:underline"
                              >
                                batch: {game.batchId.substring(0, 12)}...
                              </Link>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${categoryInfo.bgColor} ${categoryInfo.color}`}
                          >
                            <Icon size={12} />
                            {categoryInfo.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <p className="text-sm text-muted-foreground truncate" title={game.errorMessage ?? ""}>
                            {game.errorMessage || "No error message"}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-xs text-muted-foreground">
                            Round {game.rounds ?? 0} • {game.playerCount}p ({game.mafiaCount}m)
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-muted-foreground tabular-nums text-xs">
                          {game.updatedAt
                            ? new Date(game.updatedAt).toLocaleString()
                            : new Date(game.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {game.recoverable ? (
                            <button
                              onClick={() => handleResume(game.id)}
                              disabled={isResuming}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                            >
                              {isResuming ? (
                                <>
                                  <Loader2 size={12} className="animate-spin" />
                                  Resuming...
                                </>
                              ) : (
                                <>
                                  <Play size={12} />
                                  Resume
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground">
                              <XCircle size={12} />
                              Not Recoverable
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </p>
              <div className="flex items-center gap-1">
                <Link
                  to={`/admin/games/failed?page=${page - 1}${categoryFilter ? `&category=${categoryFilter}` : ""}`}
                  className={`p-2 rounded transition-colors hover:bg-muted text-muted-foreground hover:text-foreground ${
                    page <= 1 ? "pointer-events-none opacity-30" : ""
                  }`}
                >
                  <ChevronLeft size={16} />
                </Link>
                <span className="px-3 text-sm tabular-nums text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Link
                  to={`/admin/games/failed?page=${page + 1}${categoryFilter ? `&category=${categoryFilter}` : ""}`}
                  className={`p-2 rounded transition-colors hover:bg-muted text-muted-foreground hover:text-foreground ${
                    page >= totalPages ? "pointer-events-none opacity-30" : ""
                  }`}
                >
                  <ChevronRight size={16} />
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Help Section */}
      <div className="border rounded-lg p-4 bg-muted/20">
        <h3 className="font-medium text-sm mb-3">Error Categories</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {Object.entries(CATEGORY_INFO).map(([key, info]) => {
            const Icon = info.icon;
            return (
              <div key={key} className="flex items-start gap-2">
                <Icon size={14} className={`${info.color} mt-0.5`} />
                <div>
                  <span className="font-medium">{info.label}:</span>{" "}
                  <span className="text-muted-foreground">{info.description}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

