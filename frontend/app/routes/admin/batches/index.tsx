import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/index";
import { useAuth } from "~/contexts/auth";
import { getApiUrl } from "~/lib/utils";
import { Plus, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Batches | Mafia Arena Admin" }];
}

interface Batch {
  id: string;
  name: string;
  status: string;
  completedGames: number;
  totalGames: number;
  failedGames: number;
  progress: number;
  actualCostUsd: number;
  estimatedCostUsd?: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

const STATUSES = ["", "queued", "processing", "completed", "cancelled", "paused"];

const STATUS_COLORS: Record<string, { light: string; dark: string }> = {
  queued: { light: "text-amber-600", dark: "dark:text-amber-400" },
  processing: { light: "text-blue-600", dark: "dark:text-blue-400" },
  completed: { light: "text-emerald-600", dark: "dark:text-emerald-400" },
  cancelled: { light: "text-muted-foreground", dark: "" },
  paused: { light: "text-amber-600", dark: "dark:text-amber-400" },
};

export default function AdminBatches() {
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

  const apiUrl = getApiUrl();

  useEffect(() => {
    if (authLoading) return;

    const credentials = sessionStorage.getItem("adminCredentials");
    if (!credentials && !authenticated) {
      window.location.href = `/admin/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return;
    }
    loadBatches();
  }, [status, page, authLoading, authenticated]);

  async function loadBatches() {
    setLoading(true);
    setError(null);

    const credentials = sessionStorage.getItem("adminCredentials");
    const headers: Record<string, string> = credentials
      ? { Authorization: `Basic ${credentials}` }
      : {};

    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      params.set("limit", String(limit));
      params.set("offset", String(offset));

      const res = await fetch(`${apiUrl}/api/admin/batches?${params}`, {
        headers,
        credentials: "include",
      });

      if (res.status === 401) {
        sessionStorage.removeItem("adminCredentials");
        window.location.href = "/admin/login?redirect=" + encodeURIComponent(window.location.pathname);
        return;
      }

      if (!res.ok) throw new Error("Failed to load batches");

      const data = (await res.json()) as { batches: Batch[]; total: number };
      setBatches(data.batches);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
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
            <span>batches</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Batch Operations</h1>
        </div>
        <Link
          to="/admin/batches/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium hover:bg-muted transition-colors"
        >
          <Plus size={14} className="text-muted-foreground" />
          New Batch
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 pb-4 border-b">
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Filter</span>
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <Link
              key={s || "all"}
              to={`/admin/batches${s ? `?status=${s}` : ""}`}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                (status === s || (!status && !s))
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
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-muted-foreground">No batches found</span>
                        <Link to="/admin/batches/new" className="text-sm text-foreground hover:underline">
                          Create a batch →
                        </Link>
                      </div>
                    </td>
                  </tr>
                ) : (
                  batches.map((batch) => {
                    const duration =
                      batch.completedAt && batch.startedAt
                        ? batch.completedAt - batch.startedAt
                        : batch.startedAt
                        ? Math.floor(Date.now() / 1000) - batch.startedAt
                        : null;

                    const durationStr =
                      duration !== null
                        ? duration < 60
                          ? `${duration}s`
                          : `${Math.floor(duration / 60)}m ${duration % 60}s`
                        : "—";

                    const statusColor = STATUS_COLORS[batch.status] || STATUS_COLORS.cancelled;

                    return (
                      <tr key={batch.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4">
                          <Link to={`/admin/batches/${batch.id}`} className="hover:underline">
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
                          <div>${batch.actualCostUsd.toFixed(4)}</div>
                          {batch.estimatedCostUsd && (
                            <div className="text-xs opacity-60">/ ${batch.estimatedCostUsd.toFixed(2)}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-muted-foreground tabular-nums">
                          {new Date(batch.createdAt * 1000).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">{durationStr}</td>
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
                  to={`/admin/batches?page=${page - 1}${status ? `&status=${status}` : ""}`}
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
                  to={`/admin/batches?page=${page + 1}${status ? `&status=${status}` : ""}`}
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
