import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "~/contexts/auth";
import { getApiUrl } from "~/lib/utils";
import { Plus, ChevronLeft, ChevronRight, Loader2, KeyRound, AlertCircle } from "lucide-react";

export function meta() {
  return [
    { title: "Batche Games | Mafia Arena" },
    { name: "description", content: "Manage your batch game runs on Mafia Arena" },
  ];
}

interface Batch {
  id: string;
  name: string;
  status: string;
  completedGames: number;
  totalGames: number;
  failedGames: number;
  progress: string;
  actualCostUsd: number;
  estimatedCostUsd?: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

interface BatchLimits {
  maxBatchSize: number;
  maxActiveBatches: number;
  rateLimitMinutes: number;
}

const STATUSES = ["", "queued", "processing", "completed", "cancelled"];

const STATUS_COLORS: Record<string, { light: string; dark: string }> = {
  queued: { light: "text-amber-600", dark: "dark:text-amber-400" },
  processing: { light: "text-blue-600", dark: "dark:text-blue-400" },
  completed: { light: "text-emerald-600", dark: "dark:text-emerald-400" },
  cancelled: { light: "text-muted-foreground", dark: "" },
  paused: { light: "text-amber-600", dark: "dark:text-amber-400" },
};

export default function UserBatches() {
  const { authenticated, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const status = searchParams.get("status") || "";
  const pageParam = searchParams.get("page") || "1";
  const page = parseInt(pageParam);
  const limit = 20;
  const offset = (page - 1) * limit;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [total, setTotal] = useState(0);
  const [limits, setLimits] = useState<BatchLimits | null>(null);

  const apiUrl = getApiUrl();

  useEffect(() => {
    if (authLoading) return;
    if (!authenticated) return;
    loadBatches();
  }, [status, page, authLoading, authenticated]);

  async function loadBatches() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      params.set("limit", String(limit));
      params.set("offset", String(offset));

      const res = await fetch(`${apiUrl}/api/batches?${params}`, {
        credentials: "include",
      });

      if (res.status === 401) {
        setError("Please sign in to view your batches");
        setLoading(false);
        return;
      }

      if (!res.ok) throw new Error("Failed to load batches");

      const data = (await res.json()) as {
        batches: Batch[];
        total: number;
        limits: BatchLimits;
      };
      setBatches(data.batches);
      setTotal(data.total);
      setLimits(data.limits);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.ceil(total / limit);

  // Not authenticated
  if (!authLoading && !authenticated) {
    // Use apiUrl which handles dev vs prod
    const signInUrl = `${apiUrl}/api/auth/google?redirect=/batches`;

    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
          <KeyRound className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Sign In Required</h1>
          <p className="text-muted-foreground">
            Create an account to run batch games using your own API keys.
          </p>
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
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground font-mono">
            {authLoading ? "Checking session..." : "Loading batches..."}
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
          <h1 className="text-2xl font-bold tracking-tight">Batche Games</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Run batch games using your own API keys
          </p>
        </div>
        <Link
          to="/batches/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus size={14} />
          New Batch
        </Link>
      </div>

      {/* Limits Info */}
      {limits && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground border-b pb-4">
          <span>
            <strong className="text-foreground">{limits.maxBatchSize}</strong> games/batch
          </span>
          <span>•</span>
          <span>
            <strong className="text-foreground">{limits.maxActiveBatches}</strong> active batches max
          </span>
          <span>•</span>
          <span>
            <strong className="text-foreground">{limits.rateLimitMinutes}</strong> min between batches
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 pb-4 border-b">
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Filter</span>
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <Link
              key={s || "all"}
              to={`/batches${s ? `?status=${s}` : ""}`}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                status === s || (!status && !s)
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {s || "all"}
            </Link>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
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
                    Batch
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Cost
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-muted-foreground">No batches found</span>
                        <Link to="/batches/new" className="text-sm text-foreground hover:underline">
                          Create your first batch →
                        </Link>
                      </div>
                    </td>
                  </tr>
                ) : (
                  batches.map((batch) => {
                    const statusColor = STATUS_COLORS[batch.status] || STATUS_COLORS.cancelled;

                    return (
                      <tr key={batch.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4">
                          <Link to={`/batches/${batch.id}`} className="hover:underline">
                            <div className="font-medium">{batch.name || batch.id}</div>
                            <div className="text-xs text-muted-foreground font-mono">{batch.id}</div>
                          </Link>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-xs font-medium uppercase tracking-wide ${statusColor.light} ${statusColor.dark}`}
                          >
                            {batch.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <span className="tabular-nums text-muted-foreground">
                              {batch.completedGames}/{batch.totalGames}
                              {batch.failedGames > 0 && (
                                <span className="text-red-500"> ({batch.failedGames})</span>
                              )}
                            </span>
                            <div className="w-20 h-1 rounded-full overflow-hidden bg-muted">
                              <div
                                className="h-full bg-foreground/60 transition-all"
                                style={{ width: `${batch.progress}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">
                          ${(batch.actualCostUsd || 0).toFixed(4)}
                        </td>
                        <td className="py-3 px-4 text-right text-muted-foreground tabular-nums">
                          {new Date(batch.createdAt).toLocaleDateString()}
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
                  to={`/batches?page=${page - 1}${status ? `&status=${status}` : ""}`}
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
                  to={`/batches?page=${page + 1}${status ? `&status=${status}` : ""}`}
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
    </div>
  );
}

