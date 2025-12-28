import { useState, useEffect } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/keys";
import { getApiUrl } from "~/lib/utils";
import {
  Key,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
} from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [{ title: "API Keys | Mafia Arena Admin" }];
}

interface ApiKeyStatus {
  provider: string;
  displayName: string;
  maskedKey: string;
  status: "active" | "error" | "unconfigured";
  balance?: { label: string; amount: number };
  usage?: { amount: number; limit: number | null };
  error?: string;
  latencyMs?: number;
}

interface KeysResponse {
  keys: ApiKeyStatus[];
  cached?: boolean;
  checkedAt?: string;
}

const PROVIDER_COLORS: Record<string, string> = {
  openrouter: "from-violet-500/20 to-purple-500/20",
  openai: "from-emerald-500/20 to-teal-500/20",
  anthropic: "from-orange-500/20 to-amber-500/20",
  google: "from-blue-500/20 to-cyan-500/20",
  cerebras: "from-pink-500/20 to-rose-500/20",
  fireworks: "from-red-500/20 to-orange-500/20",
  minimax: "from-indigo-500/20 to-blue-500/20",
};

export default function AdminKeys() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<ApiKeyStatus[]>([]);
  const [cached, setCached] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const apiUrl = getApiUrl();

  useEffect(() => {
    const credentials = sessionStorage.getItem("adminCredentials");
    if (!credentials) {
      window.location.href = "/admin/login?redirect=/admin/keys";
      return;
    }
    loadKeys(false);
  }, []);

  async function loadKeys(forceRefresh: boolean) {
    setRefreshing(true);
    setError(null);

    const credentials = sessionStorage.getItem("adminCredentials");
    const headers: Record<string, string> = credentials
      ? { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" };

    try {
      const url = forceRefresh ? `${apiUrl}/api/admin/keys?refresh=true` : `${apiUrl}/api/admin/keys`;
      const res = await fetch(url, { headers, credentials: "include" });

      if (res.status === 401) {
        sessionStorage.removeItem("adminCredentials");
        window.location.href = "/admin/login?redirect=/admin/keys";
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as KeysResponse;
      setKeys(data.keys || []);
      setCached(data.cached || false);
      setCheckedAt(data.checkedAt || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const activeCount = keys.filter((k) => k.status === "active").length;
  const errorCount = keys.filter((k) => k.status === "error").length;
  const unconfiguredCount = keys.filter((k) => k.status === "unconfigured").length;

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground font-mono">Checking API keys...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono mb-2">
            <Link to="/admin" className="hover:text-foreground transition-colors">
              admin
            </Link>
            <span>/</span>
            <span>keys</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">API Key Status</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor connectivity and balances for configured AI providers
          </p>
        </div>

        <button
          onClick={() => loadKeys(true)}
          disabled={refreshing}
          className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          <span>{refreshing ? "Checking..." : "Refresh"}</span>
        </button>
      </div>

      {/* Info Banner */}
      <div className="border border-amber-500/20 bg-amber-500/5 rounded-lg px-4 py-3 flex items-start gap-3">
        <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Note:</span> API keys are configured via Wrangler secrets. This
          page shows current status and available credits where supported.
          <span className="text-muted-foreground/70"> Results are cached for 5 minutes.</span>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">
            <CheckCircle size={12} className="text-emerald-500" />
            Active
          </div>
          <div className="text-3xl font-bold tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400">
            {activeCount}
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">
            <XCircle size={12} className="text-red-500" />
            Errors
          </div>
          <div className="text-3xl font-bold tabular-nums tracking-tight text-red-600 dark:text-red-400">
            {errorCount}
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">
            <AlertCircle size={12} className="text-muted-foreground" />
            Unconfigured
          </div>
          <div className="text-3xl font-bold tabular-nums tracking-tight">{unconfiguredCount}</div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">
            <Clock size={12} />
            Last Check
          </div>
          <div className="text-sm font-medium text-muted-foreground">
            {checkedAt ? new Date(checkedAt).toLocaleTimeString() : "—"}
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-6 text-center">
          <XCircle size={24} className="mx-auto text-red-500 mb-3" />
          <p className="font-medium text-red-600 dark:text-red-400">Failed to check API keys</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
          <button
            onClick={() => loadKeys(false)}
            className="mt-4 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Keys Grid */}
      {!error && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {keys.map((key) => {
            const gradientClass = PROVIDER_COLORS[key.provider] || "from-gray-500/20 to-slate-500/20";
            const statusBorderColor = {
              active: "border-emerald-500/30 hover:border-emerald-500/50",
              error: "border-red-500/30 hover:border-red-500/50",
              unconfigured: "border-border hover:border-border/80",
            }[key.status];

            return (
              <div key={key.provider} className="relative group">
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${gradientClass} rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
                ></div>
                <div className={`relative p-5 rounded-xl border ${statusBorderColor} bg-card transition-all duration-200`}>
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-lg bg-gradient-to-br ${gradientClass} flex items-center justify-center`}
                      >
                        <span className="text-sm font-bold uppercase">{key.provider.substring(0, 2)}</span>
                      </div>
                      <div>
                        <h3 className="font-semibold">{key.displayName}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{key.maskedKey}</p>
                      </div>
                    </div>
                    <div className={key.status === "active" ? "text-emerald-500" : ""}>
                      {key.status === "active" && <CheckCircle size={20} />}
                      {key.status === "error" && <XCircle size={20} className="text-red-500" />}
                      {key.status === "unconfigured" && <AlertCircle size={20} className="text-muted-foreground/50" />}
                    </div>
                  </div>

                  {/* Status Info */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <span
                        className={`font-medium uppercase text-xs ${
                          key.status === "active"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : key.status === "error"
                            ? "text-red-500"
                            : "text-muted-foreground/50"
                        }`}
                      >
                        {key.status}
                      </span>
                    </div>

                    {key.balance && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{key.balance.label}</span>
                        <span
                          className={`font-mono font-bold ${
                            key.balance.amount < 5 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          ${key.balance.amount.toFixed(2)}
                        </span>
                      </div>
                    )}

                    {key.error && (
                      <div className="mt-2 px-2 py-1.5 rounded bg-red-500/10 border border-red-500/20">
                        <span className="text-xs text-red-600 dark:text-red-400 font-mono">{key.error}</span>
                      </div>
                    )}

                    {key.latencyMs && key.status !== "unconfigured" && (
                      <div className="flex justify-end pt-2 border-t border-border/50">
                        <span className="text-[10px] text-muted-foreground/50 tabular-nums">{key.latencyMs}ms</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cache indicator */}
      {cached && (
        <div className="text-center">
          <span className="text-xs text-muted-foreground/60">
            Results from cache ·{" "}
            <button
              onClick={() => loadKeys(true)}
              className="text-foreground/60 hover:text-foreground underline underline-offset-2"
            >
              Force refresh
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
