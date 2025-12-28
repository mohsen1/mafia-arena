import { useState, useEffect } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/index";
import { useAuth } from "~/contexts/auth";
import { getApiUrl } from "~/lib/utils";
import {
  Plus,
  AlertTriangle,
  LogOut,
  Radio,
  Database,
  RefreshCw,
  Layers,
  Activity,
  Zap,
  ChevronRight,
  Key,
  Loader2,
  XCircle,
} from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Admin | Mafia Arena" }];
}

interface LiveStats {
  systemPaused: boolean;
  batchesActive: number;
  gamesRunning: number;
  gamesQueued: number;
  costToday: number;
}

interface Batch {
  id: string;
  name: string;
  status: string;
  completedGames: number;
  totalGames: number;
  progress: number;
  actualCostUsd: number;
  createdAt: number;
}

interface RunningGames {
  running: number;
  stale: number;
}

interface FailedGamesCount {
  total: number;
  recoverable: number;
}

const STATUS_COLORS: Record<string, { light: string; dark: string }> = {
  queued: { light: "text-amber-600", dark: "dark:text-amber-400" },
  processing: { light: "text-blue-600", dark: "dark:text-blue-400" },
  completed: { light: "text-emerald-600", dark: "dark:text-emerald-400" },
  cancelled: { light: "text-muted-foreground", dark: "" },
  paused: { light: "text-amber-600", dark: "dark:text-amber-400" },
};

export default function AdminDashboard() {
  const { authenticated, user, loading: authLoading, apiUrl: authApiUrl, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [staleCount, setStaleCount] = useState(0);
  const [failedGames, setFailedGames] = useState<FailedGamesCount>({ total: 0, recoverable: 0 });
  const [syncing, setSyncing] = useState(false);
  const [killing, setKilling] = useState(false);
  const [toggling, setToggling] = useState(false);

  const apiUrl = authApiUrl || getApiUrl();

  useEffect(() => {
    // Wait for auth check to complete before redirecting
    if (authLoading) return;

    const hasLegacyAuth = typeof window !== "undefined" && sessionStorage.getItem("adminCredentials");

    if (!authenticated && !hasLegacyAuth) {
      window.location.href = "/admin/login?redirect=/admin";
      return;
    }

    loadDashboard();
  }, [authenticated, user, authLoading]);

  async function getHeaders(): Promise<Record<string, string>> {
    const credentials = sessionStorage.getItem("adminCredentials");
    if (credentials) {
      return { Authorization: `Basic ${credentials}` };
    }
    return {};
  }

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    try {
      const headers = await getHeaders();

      const [statsRes, batchesRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/stats/live`, { headers, credentials: "include" }),
        fetch(`${apiUrl}/api/admin/batches?limit=5`, { headers, credentials: "include" }),
      ]);

      if (statsRes.status === 401 || batchesRes.status === 401) {
        sessionStorage.removeItem("adminCredentials");
        window.location.href = "/admin/login?redirect=/admin";
        return;
      }

      if (!statsRes.ok || !batchesRes.ok) {
        throw new Error("Failed to load dashboard data");
      }

      const statsData = (await statsRes.json()) as LiveStats;
      const batchesData = (await batchesRes.json()) as { batches: Batch[] };

      setStats(statsData);
      setBatches(batchesData.batches);

      // Load running games count and failed games count
      loadRunningGames(headers);
      loadFailedGames(headers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function loadRunningGames(headers: Record<string, string>) {
    try {
      const res = await fetch(`${apiUrl}/api/admin/games/running`, {
        headers,
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as RunningGames;
        setStaleCount(data.stale);
      }
    } catch {}
  }

  async function loadFailedGames(headers: Record<string, string>) {
    try {
      const res = await fetch(`${apiUrl}/api/admin/games/failed?limit=1`, {
        headers,
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as { summary: FailedGamesCount };
        setFailedGames(data.summary);
      }
    } catch {}
  }

  async function handleToggleSystem() {
    if (!stats) return;
    setToggling(true);

    try {
      const headers = await getHeaders();
      const endpoint = stats.systemPaused ? "resume" : "pause";
      const res = await fetch(`${apiUrl}/api/admin/system/${endpoint}`, {
        method: "POST",
        headers,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      window.location.reload();
    } catch {
      alert("Failed to update system state");
      setToggling(false);
    }
  }

  async function handleSyncModels() {
    setSyncing(true);
    try {
      const headers = await getHeaders();
      const res = await fetch(`${apiUrl}/api/admin/models/sync`, {
        method: "POST",
        headers,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to sync models");
      const result = (await res.json()) as { total: number; added: number; updated: number };
      alert(`Synced ${result.total} models\n\nAdded: ${result.added}\nUpdated: ${result.updated}`);
    } catch (err) {
      alert(`Failed to sync: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleKillStale() {
    if (!confirm("Kill all games running >10 minutes?\n\nThis action cannot be undone.")) {
      return;
    }

    setKilling(true);
    try {
      const headers = await getHeaders();
      const res = await fetch(`${apiUrl}/api/admin/games/kill-hanging`, {
        method: "POST",
        headers,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      const result = (await res.json()) as { killedCount: number };
      alert(`Killed ${result.killedCount} stale game(s)`);
      window.location.reload();
    } catch (err) {
      alert(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      setKilling(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch(`${apiUrl}/api/auth/logout`, { method: "POST", credentials: "include" });
    } catch {}
    sessionStorage.removeItem("adminCredentials");
    localStorage.removeItem("adminUnlocked");
    logout();
    window.location.href = "/admin/login";
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground font-mono">
            {authLoading ? "Checking session..." : "Loading..."}
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="text-red-500" size={20} />
            </div>
            <div>
              <p className="font-semibold text-foreground">Connection Failed</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header Section */}
      <header className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold tracking-tight">Control Panel</h1>
            {stats && !stats.systemPaused && stats.gamesRunning > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                LIVE
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm">Manage game operations and monitor system health</p>
        </div>
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut size={14} />
          <span>Exit</span>
        </button>
      </header>

      {/* System Status Banner */}
      {stats && (
        <div
          className={`mb-8 rounded-lg border-l-4 p-4 transition-all ${
            stats.systemPaused
              ? "border-amber-500 bg-amber-500/5"
              : "border-emerald-500 bg-emerald-500/5"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className={`w-3 h-3 rounded-full ${
                  stats.systemPaused ? "bg-amber-500" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                }`}
              ></div>
              <div>
                <span className="font-semibold text-sm uppercase tracking-wide">
                  {stats.systemPaused ? "Paused" : "Operational"}
                </span>
                <p className="text-sm text-muted-foreground">
                  {stats.systemPaused
                    ? "System is paused. New games will not be processed."
                    : "System is running. Processing games normally."}
                </p>
              </div>
            </div>
            <button
              onClick={handleToggleSystem}
              disabled={toggling}
              className={`px-4 py-2 rounded text-sm font-medium transition-all ${
                stats.systemPaused
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              }`}
            >
              {toggling ? "..." : stats.systemPaused ? "Resume" : "Pause"}
            </button>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <nav className="flex flex-wrap items-center gap-2 mb-8 pb-8 border-b">
        <Link
          to="/admin/games/new"
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md hover:bg-muted transition-colors"
        >
          <Radio size={14} className="text-muted-foreground" />
          <span>New Game</span>
        </Link>
        <Link
          to="/admin/batches/new"
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md hover:bg-muted transition-colors"
        >
          <Plus size={14} className="text-muted-foreground" />
          <span>New Batch</span>
        </Link>
        <Link 
          to="/admin/batches"
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md hover:bg-muted transition-colors"
        >
          <Layers size={14} className="text-muted-foreground" />
          <span>Batches</span>
        </Link>
        <Link 
          to="/admin/models"
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md hover:bg-muted transition-colors"
        >
          <Database size={14} className="text-muted-foreground" />
          <span>Models</span>
        </Link>
        <Link 
          to="/admin/keys"
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md hover:bg-muted transition-colors"
        >
          <Key size={14} className="text-muted-foreground" />
          <span>API Keys</span>
        </Link>
        <Link 
          to="/admin/games/failed"
          className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            failedGames.total > 0 
              ? "text-red-600 dark:text-red-400 hover:bg-red-500/10" 
              : "hover:bg-muted"
          }`}
        >
          <XCircle size={14} className={failedGames.total > 0 ? "" : "text-muted-foreground"} />
          <span>Failed Games</span>
          {failedGames.total > 0 && (
            <span className="px-1.5 py-0.5 rounded text-xs font-bold tabular-nums bg-red-500 text-white">
              {failedGames.total}
            </span>
          )}
        </Link>

        <div className="flex-1"></div>

        <button
          onClick={handleSyncModels}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
          title="Sync models from OpenRouter"
        >
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          <span>{syncing ? "..." : "Sync"}</span>
        </button>

        <button
          onClick={handleKillStale}
          disabled={killing}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          title="Kill games running >10 minutes"
        >
          <AlertTriangle size={14} />
          <span>{killing ? "..." : "Kill Stale"}</span>
          {staleCount > 0 && (
            <span className="px-1.5 py-0.5 rounded text-xs font-bold tabular-nums bg-red-500 text-white">
              {staleCount}
            </span>
          )}
        </button>
      </nav>

      {/* Metrics Grid */}
      {stats && (
        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Layers size={12} />
              <span>Active Batches</span>
            </div>
            <div className="text-4xl font-bold tabular-nums tracking-tight">{stats.batchesActive}</div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Activity size={12} />
              <span>Games Running</span>
            </div>
            <div className="flex items-baseline gap-3">
              <div className="text-4xl font-bold tabular-nums tracking-tight">{stats.gamesRunning}</div>
              <span className="text-sm text-muted-foreground">{stats.gamesQueued.toLocaleString()} queued</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Zap size={12} />
              <span>Spent Today</span>
            </div>
            <div className="text-4xl font-bold tabular-nums tracking-tight">${stats.costToday.toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* Recent Batches */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Recent Batches</h2>
          <Link
            to="/admin/batches"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>View all</span>
            <ChevronRight size={14} />
          </Link>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Name
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
                      <span className="text-muted-foreground">No batches yet</span>
                      <Link to="/admin/batches/new" className="text-sm text-foreground hover:underline">
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
                        <Link to={`/admin/batches/${batch.id}`} className="font-medium hover:underline">
                          {batch.name || batch.id}
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
                          </span>
                          <div className="w-16 h-1 rounded-full overflow-hidden bg-muted">
                            <div
                              className="h-full bg-foreground/60 transition-all"
                              style={{ width: `${batch.progress}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">
                        ${batch.actualCostUsd.toFixed(4)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">
                        {new Date(batch.createdAt * 1000).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
      </div>
      </section>
    </div>
  );
}
