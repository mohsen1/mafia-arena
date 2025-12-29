import { useState, useEffect } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "~/contexts/auth";
import { getApiUrl } from "~/lib/utils";
import { Loader2, XCircle, KeyRound, ExternalLink, AlertCircle, RefreshCw } from "lucide-react";

export function meta({ params }: { params: { id: string } }) {
  return [
    { title: `Batch ${params.id} | Mafia Arena` },
    { name: "description", content: "View your batch game progress" },
  ];
}

interface BatchDetail {
  id: string;
  name: string;
  status: string;
  totalGames: number;
  completedGames: number;
  failedGames: number;
  progress: string;
  actualCostUsd: number;
  estimatedCostUsd?: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  errorMessage?: string;
  recentGames: Array<{
    id: string;
    status: string;
    winner?: string;
    rounds?: number;
    durationMs?: number;
    createdAt: Date;
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

export default function UserBatchDetail() {
  const { authenticated, loading: authLoading } = useAuth();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const apiUrl = getApiUrl();

  useEffect(() => {
    if (authLoading) return;
    if (!authenticated) return;
    loadBatch();

    // Poll for updates if batch is processing
    const interval = setInterval(() => {
      if (batch?.status === "processing" || batch?.status === "queued") {
        loadBatch();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [id, authLoading, authenticated, batch?.status]);

  async function loadBatch() {
    try {
      const res = await fetch(`${apiUrl}/api/batches/${id}`, {
        credentials: "include",
      });

      if (res.status === 401) {
        setError("Please sign in to view this batch");
        setLoading(false);
        return;
      }

      if (res.status === 403) {
        setError("You don't have permission to view this batch");
        setLoading(false);
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

  async function handleCancel() {
    if (!batch || !confirm("Are you sure you want to cancel this batch?")) return;

    setCancelling(true);

    try {
      const res = await fetch(`${apiUrl}/api/batches/${id}/cancel`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to cancel batch");

      await loadBatch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel batch");
    } finally {
      setCancelling(false);
    }
  }

  // Not authenticated
  if (!authLoading && !authenticated) {
    // Use apiUrl which handles dev vs prod
    const signInUrl = `${apiUrl}/api/auth/google?redirect=/batches/${id}`;

    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
          <KeyRound className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Sign In Required</h1>
          <p className="text-muted-foreground">Sign in to view your batch details.</p>
        </div>
        <a
          href={signInUrl}
          className="inline-flex items-center gap-2 px-6 py-3 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Sign in with Google
        </a>
      </div>
    );
  }

  if (authLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground font-mono">
          {authLoading ? "Checking session..." : "Loading batch..."}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Error</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
        <Link
          to="/batches"
          className="inline-flex items-center gap-2 px-6 py-3 border rounded-md text-sm font-medium hover:bg-muted transition-colors"
        >
          Back to Batches
        </Link>
      </div>
    );
  }

  if (!batch) return null;

  const statusColor = STATUS_COLORS[batch.status] || STATUS_COLORS.cancelled;
  const isActive = batch.status === "queued" || batch.status === "processing";
  const progressNum = parseFloat(batch.progress);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mb-2">
          <Link to="/batches" className="hover:text-foreground transition-colors">
            batches
          </Link>
          <span>/</span>
          <span>{batch.id}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{batch.name || batch.id}</h1>
            <p className="text-sm text-muted-foreground mt-1 font-mono">{batch.id}</p>
          </div>
          {isActive && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-red-500/30 text-red-600 dark:text-red-400 rounded-md hover:bg-red-500/5 transition-colors disabled:opacity-50"
            >
              <XCircle size={14} />
              {cancelling ? "Cancelling..." : "Cancel Batch"}
            </button>
          )}
        </div>
      </div>

      {/* Status Banner */}
      <div
        className={`flex items-center justify-between p-4 rounded-lg border ${
          isActive ? "bg-blue-500/5 border-blue-500/30" : "bg-muted/30"
        }`}
      >
        <div className="flex items-center gap-4">
          <span
            className={`text-sm font-medium uppercase tracking-wide ${statusColor.light} ${statusColor.dark}`}
          >
            {batch.status}
          </span>
          {isActive && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>
        {isActive && (
          <span className="text-xs text-muted-foreground">Auto-refreshing every 5s</span>
        )}
      </div>

      {/* Progress */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium tabular-nums">
            {batch.completedGames + batch.failedGames} / {batch.totalGames} games
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden bg-muted">
          <div
            className={`h-full transition-all duration-500 ${
              batch.status === "completed"
                ? "bg-emerald-500"
                : batch.status === "cancelled"
                ? "bg-muted-foreground"
                : "bg-blue-500"
            }`}
            style={{ width: `${progressNum}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{batch.completedGames} completed</span>
          {batch.failedGames > 0 && (
            <span className="text-red-500">{batch.failedGames} failed</span>
          )}
          <span>{batch.progress}%</span>
        </div>
      </div>

      {/* Error Message */}
      {batch.errorMessage && (
        <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/30">
          <p className="text-sm text-red-600 dark:text-red-400">{batch.errorMessage}</p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Total Games
          </div>
          <div className="text-2xl font-bold tabular-nums">{batch.totalGames}</div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Completed
          </div>
          <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {batch.completedGames}
          </div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Failed</div>
          <div className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
            {batch.failedGames}
          </div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Cost</div>
          <div className="text-2xl font-bold tabular-nums">${batch.actualCostUsd.toFixed(4)}</div>
          {batch.estimatedCostUsd && (
            <div className="text-xs text-muted-foreground">
              / ${batch.estimatedCostUsd.toFixed(2)} est.
            </div>
          )}
        </div>
      </div>

      {/* Recent Games */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Recent Games
        </h2>

        {batch.recentGames.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border rounded-lg">
            No games completed yet
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Game
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Winner
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Rounds
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {batch.recentGames.map((game) => {
                  const gameStatusColor = STATUS_COLORS[game.status] || STATUS_COLORS.cancelled;
                  return (
                    <tr key={game.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4">
                        <Link
                          to={`/games/${game.id}`}
                          className="font-mono text-xs hover:underline flex items-center gap-1"
                        >
                          {game.id.slice(0, 20)}...
                          <ExternalLink size={12} className="text-muted-foreground" />
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs font-medium uppercase ${gameStatusColor.light} ${gameStatusColor.dark}`}
                        >
                          {game.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {game.winner ? (
                          <span
                            className={`text-xs font-medium uppercase ${
                              game.winner === "mafia"
                                ? "text-red-500"
                                : "text-blue-500"
                            }`}
                          >
                            {game.winner}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">
                        {game.rounds || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Back Link */}
      <div className="pt-4 border-t">
        <Link
          to="/batches"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to Batche Games
        </Link>
      </div>
    </div>
  );
}

