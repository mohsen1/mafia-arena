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
  BarChart3,
  Skull,
  Play,
  Pause,
  Settings,
  TrendingUp,
  Users,
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
  progress: string;
  actualCostUsd: number;
  createdAt: string;
}

interface RunningGames {
  running: number;
  stale: number;
}

interface FailedGamesCount {
  total: number;
  recoverable: number;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  queued: { 
    bg: "bg-amber-500/10 dark:bg-amber-500/20", 
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500"
  },
  processing: { 
    bg: "bg-blue-500/10 dark:bg-blue-500/20", 
    text: "text-blue-700 dark:text-blue-400",
    dot: "bg-blue-500"
  },
  completed: { 
    bg: "bg-emerald-500/10 dark:bg-emerald-500/20", 
    text: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500"
  },
  cancelled: { 
    bg: "bg-zinc-500/10 dark:bg-zinc-500/20", 
    text: "text-zinc-600 dark:text-zinc-400",
    dot: "bg-zinc-400"
  },
  paused: { 
    bg: "bg-amber-500/10 dark:bg-amber-500/20", 
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500"
  },
  failed: { 
    bg: "bg-red-500/10 dark:bg-red-500/20", 
    text: "text-red-700 dark:text-red-400",
    dot: "bg-red-500"
  },
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
  const [rebuildingLeaderboard, setRebuildingLeaderboard] = useState(false);

  const apiUrl = authApiUrl || getApiUrl();

  useEffect(() => {
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
        fetch(`${apiUrl}/api/batches?limit=5`, { headers, credentials: "include" }),
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
      const res = await fetch(`${apiUrl}/api/admin/games/running`, { headers, credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as RunningGames;
        setStaleCount(data.stale);
      }
    } catch {}
  }

  async function loadFailedGames(headers: Record<string, string>) {
    try {
      const res = await fetch(`${apiUrl}/api/admin/games/failed?limit=1`, { headers, credentials: "include" });
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
      const res = await fetch(`${apiUrl}/api/admin/system/${endpoint}`, { method: "POST", headers, credentials: "include" });
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
      const res = await fetch(`${apiUrl}/api/admin/models/sync`, { method: "POST", headers, credentials: "include" });
      if (!res.ok) throw new Error("Failed to sync models");
      const result = (await res.json()) as { total: number; added: number; updated: number };
      alert(`Synced ${result.total} models\n\nAdded: ${result.added}\nUpdated: ${result.updated}`);
    } catch (err) {
      alert(`Failed to sync: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleRebuildLeaderboard() {
    setRebuildingLeaderboard(true);
    try {
      const headers = await getHeaders();
      const res = await fetch(`${apiUrl}/api/admin/maintenance/rebuild-leaderboard`, { method: "POST", headers, credentials: "include" });
      if (!res.ok) throw new Error("Failed to rebuild leaderboard");
      const result = (await res.json()) as { success: boolean; rowsInserted: number };
      alert(`Leaderboard rebuilt!\n\n${result.rowsInserted} entries updated`);
    } catch (err) {
      alert(`Failed to rebuild: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRebuildingLeaderboard(false);
    }
  }

  async function handleKillStale() {
    if (!confirm("Kill all games running >10 minutes?\n\nThis action cannot be undone.")) return;
    setKilling(true);
    try {
      const headers = await getHeaders();
      const res = await fetch(`${apiUrl}/api/admin/games/kill-hanging`, { method: "POST", headers, credentials: "include" });
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900 flex items-center justify-center">
              <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-muted-foreground">
              {authLoading ? "Verifying session" : "Loading dashboard"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="max-w-sm w-full">
          <div className="bg-gradient-to-b from-red-50 to-red-50/50 dark:from-red-950/30 dark:to-red-950/10 border border-red-200/50 dark:border-red-900/50 rounded-2xl p-8">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-red-900 dark:text-red-200">Connection Failed</h3>
                <p className="text-sm text-red-700/80 dark:text-red-400/80 mt-1">{error}</p>
              </div>
              <button
                onClick={() => loadDashboard()}
                className="mt-2 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-900/70 rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isLive = stats && !stats.systemPaused && (stats.gamesRunning > 0 || stats.gamesQueued > 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-800 dark:from-zinc-100 dark:to-zinc-200 flex items-center justify-center shadow-lg">
            <Settings className="w-6 h-6 text-white dark:text-zinc-900" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">Command Center</h1>
              {isLive && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  Live
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">Monitor and manage game operations</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </header>

      {/* System Status */}
      {stats && (
        <div className={`relative overflow-hidden rounded-2xl border transition-all ${
          stats.systemPaused 
            ? "bg-gradient-to-r from-amber-50 to-amber-50/30 dark:from-amber-950/20 dark:to-amber-950/5 border-amber-200/50 dark:border-amber-900/50"
            : "bg-gradient-to-r from-emerald-50 to-emerald-50/30 dark:from-emerald-950/20 dark:to-emerald-950/5 border-emerald-200/50 dark:border-emerald-900/50"
        }`}>
          <div className="flex items-center justify-between p-5">
            <div className="flex items-center gap-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                stats.systemPaused 
                  ? "bg-amber-100 dark:bg-amber-900/50" 
                  : "bg-emerald-100 dark:bg-emerald-900/50"
              }`}>
                {stats.systemPaused ? (
                  <Pause className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${
                    stats.systemPaused 
                      ? "text-amber-900 dark:text-amber-200" 
                      : "text-emerald-900 dark:text-emerald-200"
                  }`}>
                    {stats.systemPaused ? "System Paused" : "System Operational"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {stats.systemPaused 
                    ? "Queue processing is halted" 
                    : "Processing games normally"}
                </p>
              </div>
            </div>
            <button
              onClick={handleToggleSystem}
              disabled={toggling}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50 ${
                stats.systemPaused
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                  : "bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/50 dark:hover:bg-amber-900/70 text-amber-700 dark:text-amber-300"
              }`}
            >
              {toggling ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : stats.systemPaused ? (
                <Play className="w-4 h-4" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
              {stats.systemPaused ? "Resume" : "Pause"}
            </button>
          </div>
        </div>
      )}

      {/* Metrics */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            icon={Layers}
            label="Active Batches"
            value={stats.batchesActive}
            color="violet"
          />
          <MetricCard
            icon={Activity}
            label="Games Running"
            value={stats.gamesRunning}
            subtitle={`${stats.gamesQueued.toLocaleString()} queued`}
            color="blue"
          />
          <MetricCard
            icon={Zap}
            label="Spent Today"
            value={`$${stats.costToday.toFixed(2)}`}
            color="emerald"
          />
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Primary Actions */}
        <div className="bg-gradient-to-b from-zinc-50 to-zinc-50/50 dark:from-zinc-900/50 dark:to-zinc-900/20 border rounded-2xl p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-2">
            <ActionLink to="/admin/games/new" icon={Radio} label="New Game" />
            <ActionLink to="/admin/batches/new" icon={Plus} label="New Batch" />
            <ActionLink to="/admin/batches" icon={Layers} label="All Batches" />
            <ActionLink to="/admin/models" icon={Database} label="Models" />
            <ActionLink to="/admin/users" icon={Users} label="Users" />
            <ActionLink to="/admin/keys" icon={Key} label="API Keys" />
            <ActionLink 
              to="/admin/games/failed" 
              icon={XCircle} 
              label="Failed Games" 
              badge={failedGames.total > 0 ? failedGames.total : undefined}
              variant={failedGames.total > 0 ? "danger" : undefined}
            />
          </div>
        </div>

        {/* Maintenance Actions */}
        <div className="bg-gradient-to-b from-zinc-50 to-zinc-50/50 dark:from-zinc-900/50 dark:to-zinc-900/20 border rounded-2xl p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Maintenance</h3>
          <div className="grid grid-cols-2 gap-2">
            <ActionButton
              onClick={handleSyncModels}
              loading={syncing}
              icon={RefreshCw}
              label="Sync Models"
            />
            <ActionButton
              onClick={handleRebuildLeaderboard}
              loading={rebuildingLeaderboard}
              icon={BarChart3}
              label="Rebuild Stats"
            />
            <ActionButton
              onClick={handleKillStale}
              loading={killing}
              icon={Skull}
              label="Kill Stale"
              badge={staleCount > 0 ? staleCount : undefined}
              variant="danger"
            />
            <Link 
              to="/stats" 
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-zinc-700/50 hover:border-zinc-300 dark:hover:border-zinc-600 transition-all"
            >
              <TrendingUp size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium">View Stats</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Batches */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent Batches</h2>
          <Link
            to="/admin/batches"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
            <ChevronRight size={16} />
          </Link>
        </div>

        <div className="bg-white dark:bg-zinc-900/50 border rounded-2xl overflow-hidden">
          {batches.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                <Layers className="w-7 h-7 text-zinc-400" />
              </div>
              <p className="text-muted-foreground mb-2">No batches yet</p>
              <Link 
                to="/admin/batches/new" 
                className="text-sm font-medium text-foreground hover:underline inline-flex items-center gap-1"
              >
                Create your first batch
                <ChevronRight size={14} />
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-zinc-50/50 dark:bg-zinc-800/30">
                    <th className="text-left py-3.5 px-5 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Batch
                    </th>
                    <th className="text-left py-3.5 px-5 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-right py-3.5 px-5 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Progress
                    </th>
                    <th className="text-right py-3.5 px-5 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden sm:table-cell">
                      Cost
                    </th>
                    <th className="text-right py-3.5 px-5 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                  {batches.map((batch) => {
                    const statusConfig = STATUS_CONFIG[batch.status] || STATUS_CONFIG.cancelled;
                    const progressPercent = parseFloat(batch.progress) || 0;
                    return (
                      <tr key={batch.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                        <td className="py-4 px-5">
                          <Link to={`/admin/batches/${batch.id}`} className="group">
                            <span className="font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {batch.name || batch.id.slice(0, 8)}
                            </span>
                          </Link>
                        </td>
                        <td className="py-4 px-5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
                            {batch.status}
                          </span>
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex items-center justify-end gap-3">
                            <span className="text-sm tabular-nums text-muted-foreground">
                              {batch.completedGames}/{batch.totalGames}
                            </span>
                            <div className="w-20 h-1.5 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-700">
                              <div
                                className="h-full bg-zinc-900 dark:bg-zinc-100 rounded-full transition-all duration-500"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-5 text-right tabular-nums text-sm text-muted-foreground hidden sm:table-cell">
                          ${batch.actualCostUsd.toFixed(4)}
                        </td>
                        <td className="py-4 px-5 text-right tabular-nums text-sm text-muted-foreground hidden md:table-cell">
                          {formatDate(batch.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ 
  icon: Icon, 
  label, 
  value, 
  subtitle,
  color 
}: { 
  icon: typeof Activity; 
  label: string; 
  value: string | number; 
  subtitle?: string;
  color: "violet" | "blue" | "emerald";
}) {
  const colorStyles = {
    violet: {
      bg: "from-violet-50 to-violet-50/30 dark:from-violet-950/30 dark:to-violet-950/10",
      icon: "bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400",
      border: "border-violet-200/50 dark:border-violet-900/50"
    },
    blue: {
      bg: "from-blue-50 to-blue-50/30 dark:from-blue-950/30 dark:to-blue-950/10",
      icon: "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400",
      border: "border-blue-200/50 dark:border-blue-900/50"
    },
    emerald: {
      bg: "from-emerald-50 to-emerald-50/30 dark:from-emerald-950/30 dark:to-emerald-950/10",
      icon: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400",
      border: "border-emerald-200/50 dark:border-emerald-900/50"
    }
  };

  const styles = colorStyles[color];

  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${styles.bg} ${styles.border} p-5`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">{label}</p>
          <p className="text-3xl font-bold tabular-nums tracking-tight">{value}</p>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${styles.icon}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function ActionLink({ 
  to, 
  icon: Icon, 
  label, 
  badge,
  variant 
}: { 
  to: string; 
  icon: typeof Activity; 
  label: string; 
  badge?: number;
  variant?: "danger";
}) {
  return (
    <Link 
      to={to} 
      className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-zinc-800/50 border transition-all ${
        variant === "danger" && badge
          ? "border-red-200 dark:border-red-900/50 hover:border-red-300 dark:hover:border-red-800"
          : "border-zinc-200/50 dark:border-zinc-700/50 hover:border-zinc-300 dark:hover:border-zinc-600"
      }`}
    >
      <Icon size={18} className={variant === "danger" && badge ? "text-red-500" : "text-muted-foreground"} />
      <span className={`text-sm font-medium flex-1 ${variant === "danger" && badge ? "text-red-700 dark:text-red-400" : ""}`}>
        {label}
      </span>
      {badge !== undefined && (
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${
          variant === "danger" 
            ? "bg-red-500 text-white" 
            : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
        }`}>
          {badge}
        </span>
      )}
    </Link>
  );
}

function ActionButton({ 
  onClick, 
  loading, 
  icon: Icon, 
  label, 
  badge,
  variant 
}: { 
  onClick: () => void; 
  loading: boolean; 
  icon: typeof Activity; 
  label: string; 
  badge?: number;
  variant?: "danger";
}) {
  return (
    <button 
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-zinc-800/50 border transition-all disabled:opacity-50 ${
        variant === "danger"
          ? "border-red-200 dark:border-red-900/50 hover:border-red-300 dark:hover:border-red-800"
          : "border-zinc-200/50 dark:border-zinc-700/50 hover:border-zinc-300 dark:hover:border-zinc-600"
      }`}
    >
      {loading ? (
        <Loader2 size={18} className="animate-spin text-muted-foreground" />
      ) : (
        <Icon size={18} className={variant === "danger" ? "text-red-500" : "text-muted-foreground"} />
      )}
      <span className={`text-sm font-medium flex-1 text-left ${variant === "danger" ? "text-red-700 dark:text-red-400" : ""}`}>
        {label}
      </span>
      {badge !== undefined && (
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${
          variant === "danger" 
            ? "bg-red-500 text-white" 
            : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
