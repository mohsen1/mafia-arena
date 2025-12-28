import { useState, useEffect } from "react";
import { Link, useParams } from "react-router";
import type { Route } from "./+types/$id";
import { getApiUrl } from "~/lib/utils";
import { AlertTriangle, RotateCcw, Loader2, Pause, Play, XCircle } from "lucide-react";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `Batch ${params.id} | Mafia Arena Admin` }];
}

interface BatchDetail {
  id: string;
  name: string;
  status: string;
  totalGames: number;
  completedGames: number;
  failedGames: number;
  progress: number;
  actualCostUsd: number;
  estimatedCostUsd?: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  config?: {
    playerCount: number;
    mafiaCount: number;
    teams: Array<{ modelId: string; team: string; count: number }>;
  };
  games?: Array<{
    id: string;
    status: string;
    winner?: string;
    costUsd?: number;
    createdAt: number;
  }>;
}

const STATUS_COLORS: Record<string, { light: string; dark: string }> = {
  queued: { light: "text-amber-600", dark: "dark:text-amber-400" },
  processing: { light: "text-blue-600", dark: "dark:text-blue-400" },
  completed: { light: "text-emerald-600", dark: "dark:text-emerald-400" },
  cancelled: { light: "text-muted-foreground", dark: "" },
  paused: { light: "text-amber-600", dark: "dark:text-amber-400" },
  failed: { light: "text-red-600", dark: "dark:text-red-400" },
  running: { light: "text-blue-600", dark: "dark:text-blue-400" },
};

export default function BatchDetail() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const apiUrl = getApiUrl();

  useEffect(() => {
    const credentials = sessionStorage.getItem("adminCredentials");
    if (!credentials) {
      window.location.href = `/admin/login?redirect=/admin/batches/${id}`;
      return;
    }
    loadBatch();

    // Poll for updates if batch is processing
    const interval = setInterval(() => {
      if (batch?.status === "processing" || batch?.status === "queued") {
        loadBatch();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [id]);

  async function loadBatch() {
    const credentials = sessionStorage.getItem("adminCredentials");
    const headers: Record<string, string> = { Authorization: `Basic ${credentials}` };

    try {
      const res = await fetch(`${apiUrl}/api/admin/batches/${id}`, {
        headers,
        credentials: "include",
      });

      if (res.status === 401) {
        sessionStorage.removeItem("adminCredentials");
        window.location.href = `/admin/login?redirect=/admin/batches/${id}`;
        return;
      }

      if (res.status === 404) {
        setError("Batch not found");
        setLoading(false);
        return;
      }

      if (!res.ok) throw new Error("Failed to load batch");

      const data = (await res.json()) as BatchDetail;
      setBatch(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(action: "pause" | "resume" | "cancel") {
    if (!batch) return;

    setActionLoading(action);

    const credentials = sessionStorage.getItem("adminCredentials");
    const headers: Record<string, string> = {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    };

    try {
      const res = await fetch(`${apiUrl}/api/admin/batches/${id}/${action}`, {
        method: "POST",
        headers,
        credentials: "include",
      });

      if (!res.ok) throw new Error(`Failed to ${action} batch`);

      await loadBatch();
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${action} batch`);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground font-mono">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mb-6">
          <Link to="/admin" className="hover:text-foreground transition-colors">
            admin
          </Link>
          <span>/</span>
          <Link to="/admin/batches" className="hover:text-foreground transition-colors">
            batches
          </Link>
          <span>/</span>
          <span className="text-foreground">{id}</span>
        </div>

        <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="font-semibold">Error</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/admin/batches"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm border rounded-md hover:bg-muted transition-colors"
          >
            ← Back
          </Link>
          <button
            onClick={loadBatch}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-foreground text-background rounded-md hover:opacity-90 transition-opacity"
          >
            <RotateCcw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!batch) return null;

  const statusColor = STATUS_COLORS[batch.status] || STATUS_COLORS.cancelled;
  const duration =
    batch.completedAt && batch.startedAt
      ? batch.completedAt - batch.startedAt
      : batch.startedAt
      ? Math.floor(Date.now() / 1000) - batch.startedAt
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mb-6">
        <Link to="/admin" className="hover:text-foreground transition-colors">
          admin
        </Link>
        <span>/</span>
        <Link to="/admin/batches" className="hover:text-foreground transition-colors">
          batches
        </Link>
        <span>/</span>
        <span className="text-foreground">{id}</span>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{batch.name || batch.id}</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">{batch.id}</p>
        </div>

        <div className="flex items-center gap-2">
          {batch.status === "processing" && (
            <button
              onClick={() => handleAction("pause")}
              disabled={actionLoading !== null}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-md hover:bg-amber-500/10 transition-colors disabled:opacity-50"
            >
              <Pause size={14} />
              {actionLoading === "pause" ? "..." : "Pause"}
            </button>
          )}
          {batch.status === "paused" && (
            <button
              onClick={() => handleAction("resume")}
              disabled={actionLoading !== null}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-md hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
            >
              <Play size={14} />
              {actionLoading === "resume" ? "..." : "Resume"}
            </button>
          )}
          {(batch.status === "processing" || batch.status === "paused" || batch.status === "queued") && (
            <button
              onClick={() => handleAction("cancel")}
              disabled={actionLoading !== null}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              <XCircle size={14} />
              {actionLoading === "cancel" ? "..." : "Cancel"}
            </button>
          )}
        </div>
      </div>

      {/* Status Banner */}
      <div
        className={`rounded-lg border-l-4 p-4 ${
          batch.status === "completed"
            ? "border-emerald-500 bg-emerald-500/5"
            : batch.status === "cancelled" || batch.status === "failed"
            ? "border-red-500 bg-red-500/5"
            : batch.status === "paused"
            ? "border-amber-500 bg-amber-500/5"
            : "border-blue-500 bg-blue-500/5"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className={`w-3 h-3 rounded-full ${
                batch.status === "completed"
                  ? "bg-emerald-500"
                  : batch.status === "processing"
                  ? "bg-blue-500 animate-pulse"
                  : batch.status === "paused"
                  ? "bg-amber-500"
                  : "bg-red-500"
              }`}
            ></div>
            <div>
              <span className={`font-semibold text-sm uppercase tracking-wide ${statusColor.light} ${statusColor.dark}`}>
                {batch.status}
              </span>
              <p className="text-sm text-muted-foreground">
                {batch.completedGames} / {batch.totalGames} games completed
                {batch.failedGames > 0 && <span className="text-red-500"> ({batch.failedGames} failed)</span>}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">{batch.progress.toFixed(1)}%</div>
            {duration !== null && (
              <div className="text-xs text-muted-foreground tabular-nums">
                {duration < 60 ? `${duration}s` : `${Math.floor(duration / 60)}m ${duration % 60}s`}
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-2 rounded-full overflow-hidden bg-muted">
          <div
            className={`h-full transition-all ${
              batch.status === "completed"
                ? "bg-emerald-500"
                : batch.status === "cancelled" || batch.status === "failed"
                ? "bg-red-500"
                : "bg-blue-500"
            }`}
            style={{ width: `${batch.progress}%` }}
          ></div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border rounded-lg p-4 space-y-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Total Games</div>
          <div className="text-2xl font-bold tabular-nums">{batch.totalGames}</div>
        </div>
        <div className="border rounded-lg p-4 space-y-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Completed</div>
          <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {batch.completedGames}
          </div>
        </div>
        <div className="border rounded-lg p-4 space-y-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Failed</div>
          <div className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">{batch.failedGames}</div>
        </div>
        <div className="border rounded-lg p-4 space-y-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Total Cost</div>
          <div className="text-2xl font-bold tabular-nums">${batch.actualCostUsd.toFixed(4)}</div>
          {batch.estimatedCostUsd && (
            <div className="text-xs text-muted-foreground">/ ${batch.estimatedCostUsd.toFixed(2)} est.</div>
          )}
        </div>
      </div>

      {/* Configuration */}
      {batch.config && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Configuration</h2>
          <div className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Players</span>
              <span>{batch.config.playerCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Mafia Count</span>
              <span className="text-red-500">{batch.config.mafiaCount}</span>
            </div>
            {batch.config.teams?.map((team, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className={team.team === "mafia" ? "text-red-500" : "text-blue-500"}>
                  {team.team.charAt(0).toUpperCase() + team.team.slice(1)} ({team.count})
                </span>
                <span className="font-mono text-xs text-muted-foreground">{team.modelId}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Games List */}
      {batch.games && batch.games.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Games ({batch.games.length})
          </h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left py-2 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Game ID
                  </th>
                  <th className="text-left py-2 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left py-2 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Winner
                  </th>
                  <th className="text-right py-2 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {batch.games.slice(0, 50).map((game) => {
                  const gameStatusColor = STATUS_COLORS[game.status] || STATUS_COLORS.cancelled;
                  return (
                    <tr key={game.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-4">
                        <Link to={`/games/${game.id}`} className="font-mono text-xs hover:underline">
                          {game.id.substring(0, 8)}...
                        </Link>
                      </td>
                      <td className="py-2 px-4">
                        <span className={`text-xs font-medium uppercase ${gameStatusColor.light} ${gameStatusColor.dark}`}>
                          {game.status}
                        </span>
                      </td>
                      <td className="py-2 px-4">
                        {game.winner && (
                          <span className={game.winner === "mafia" ? "text-red-500" : "text-blue-500"}>
                            {game.winner}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">
                        {game.costUsd !== undefined ? `$${game.costUsd.toFixed(4)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {batch.games.length > 50 && (
              <div className="py-2 px-4 text-center text-xs text-muted-foreground border-t">
                Showing 50 of {batch.games.length} games
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
