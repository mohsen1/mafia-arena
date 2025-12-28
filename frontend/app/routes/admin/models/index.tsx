import { useState, useEffect } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/index";
import { getApiUrl } from "~/lib/utils";
import { RefreshCw, Database, Cloud, Check, Loader2 } from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Models | Mafia Arena Admin" }];
}

interface Model {
  id: string;
  name: string;
  contextLength: number;
  pricing: { inputPer1M: number; outputPer1M: number };
}

interface DbModel {
  id: string;
  display_name: string;
  provider: string;
  created_at: number;
}

interface OpenRouterData {
  providers: string[];
  modelsByProvider: Record<string, Model[]>;
  totalModels: number;
  cachedAt?: string;
}

export default function AdminModels() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ added: number; updated: number; total: number } | null>(null);
  const [orData, setOrData] = useState<OpenRouterData | null>(null);
  const [dbModels, setDbModels] = useState<DbModel[]>([]);
  const [dbTotal, setDbTotal] = useState(0);

  const apiUrl = getApiUrl();

  useEffect(() => {
    const credentials = sessionStorage.getItem("adminCredentials");
    if (!credentials) {
      window.location.href = "/admin/login?redirect=/admin/models";
      return;
    }
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    await Promise.all([loadOpenRouterModels(), loadDbModels()]);
    setLoading(false);
  }

  async function loadOpenRouterModels() {
    try {
      const res = await fetch(`${apiUrl}/api/models/openrouter`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = (await res.json()) as OpenRouterData;
      setOrData(data);
    } catch (err) {
      console.error("Failed to load OpenRouter models:", err);
    }
  }

  async function loadDbModels() {
    const credentials = sessionStorage.getItem("adminCredentials");
    const headers: Record<string, string> = credentials
      ? { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" };

    try {
      const res = await fetch(`${apiUrl}/api/admin/models`, { headers, credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = (await res.json()) as { models: DbModel[]; total: number };
      setDbModels(data.models);
      setDbTotal(data.total);
    } catch (err) {
      console.error("Failed to load DB models:", err);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);

    const credentials = sessionStorage.getItem("adminCredentials");
    const headers: Record<string, string> = credentials
      ? { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" };

    try {
      const res = await fetch(`${apiUrl}/api/admin/models/sync`, {
        method: "POST",
        headers,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      const result = (await res.json()) as { added: number; updated: number; total: number };
      setSyncResult(result);
      await loadData();
    } catch (err) {
      alert("Failed to sync models");
    } finally {
      setSyncing(false);
    }
  }

  function formatContext(length: number) {
    if (length >= 1000000) return `${(length / 1000000).toFixed(0)}M ctx`;
    if (length >= 1000) return `${(length / 1000).toFixed(0)}K ctx`;
    return `${length} ctx`;
  }

  function formatPrice(price: number) {
    if (price === 0) return "Free";
    if (price < 0.01) return `$${(price * 1000).toFixed(2)}/B`;
    if (price < 1) return `$${price.toFixed(2)}/M`;
    return `$${price.toFixed(0)}/M`;
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground font-mono">Loading models...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono mb-2">
            <Link to="/admin" className="hover:text-foreground transition-colors">
              admin
            </Link>
            <span>/</span>
            <span>models</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Model Registry</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage AI models synced from OpenRouter</p>
        </div>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          Sync Models
        </button>
      </div>

      {/* Sync Results */}
      {syncResult && (
        <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Check size={18} className="text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-emerald-600 dark:text-emerald-400 text-sm">Sync Complete</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Added {syncResult.added}, updated {syncResult.updated}. Total: {syncResult.total} models.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">
            <Database size={12} />
            DB Models
          </div>
          <div className="text-3xl font-bold tabular-nums tracking-tight">{dbTotal}</div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">
            <Cloud size={12} />
            OpenRouter
          </div>
          <div className="text-3xl font-bold tabular-nums tracking-tight">{orData?.totalModels || "—"}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Providers</div>
          <div className="text-3xl font-bold tabular-nums tracking-tight">{orData?.providers.length || "—"}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Last Sync</div>
          <div className="text-sm font-medium text-muted-foreground">
            {orData?.cachedAt ? new Date(orData.cachedAt).toLocaleString() : "Never"}
          </div>
        </div>
      </div>

      {/* Models by Provider */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Available Models</h2>
        <div className="border rounded-lg overflow-hidden divide-y divide-border/50">
          {orData?.providers.map((provider) => {
            const models = orData.modelsByProvider[provider] || [];
            return (
              <details key={provider} className="group">
                <summary className="px-4 py-3 cursor-pointer hover:bg-muted/30 flex items-center justify-between transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{provider}</span>
                    <span className="text-xs text-muted-foreground">{models.length} models</span>
                  </div>
                  <svg
                    className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="px-4 pb-3 bg-muted/20">
                  <div className="space-y-0.5">
                    {models.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between py-2 text-sm border-b border-border/30 last:border-0"
                      >
                        <span className="font-mono text-xs text-muted-foreground truncate mr-4">{m.id}</span>
                        <div className="flex items-center gap-4 shrink-0 text-muted-foreground">
                          <span className="text-xs">{m.name}</span>
                          <span className="text-xs tabular-nums">{formatContext(m.contextLength)}</span>
                          <span className="font-mono text-xs tabular-nums">{formatPrice(m.pricing.inputPer1M)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </section>

      {/* DB Models Table */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Database Registry</h2>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Model ID
                </th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Display Name
                </th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Provider
                </th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Added
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {dbModels.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-muted-foreground">
                    No models in database. Click "Sync Models" to import.
                  </td>
                </tr>
              ) : (
                dbModels.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{m.id}</td>
                    <td className="py-3 px-4">{m.display_name}</td>
                    <td className="py-3 px-4">
                      <span className="text-xs font-medium text-muted-foreground">{m.provider}</span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground tabular-nums">
                      {new Date(m.created_at * 1000).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
