import { useState, useEffect } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/index";
import { useAuth } from "~/contexts/auth";
import { getApiUrl } from "~/lib/utils";
import { 
  RefreshCw, Database, Cloud, Check, Loader2, Edit2, 
  Plus, Trash2, Key, Filter, AlertTriangle, X 
} from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Models | Mafia Arena Admin" }];
}

// Types
interface DbModel {
  id: string;
  family: string;
  display_name: string;
  api_provider: string;
  api_model_id: string | null;
  supports_batch_pricing: boolean;
  elo_rating: number;
  elo_games_played: number;
  pricing: { inputPer1K: number; outputPer1K: number } | null;
  context_length: number | null;
  created_at: number;
}

interface KeyStatus {
  provider: string;
  status: "active" | "error" | "unconfigured";
  balance?: number;
  masked?: string;
}

interface OpenRouterData {
  providers: string[];
  totalModels: number;
  cachedAt?: string;
}

type ModalMode = "add" | "edit" | null;

const API_PROVIDERS = [
  { value: "openrouter", label: "OpenRouter" },
  { value: "anthropic", label: "Anthropic (Direct)" },
  { value: "google", label: "Google (Direct)" },
  { value: "openai", label: "OpenAI (Direct)" },
  { value: "mistral", label: "Mistral (Direct)" },
  { value: "groq", label: "Groq (Direct)" },
];

const MODEL_FAMILIES = [
  "anthropic",
  "google",
  "openai",
  "meta-llama",
  "mistralai",
  "qwen",
  "deepseek",
  "microsoft",
  "cohere",
  "x-ai",
];

export default function AdminModels() {
  const { authenticated, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ added: number; updated: number; total: number } | null>(null);
  const [orData, setOrData] = useState<OpenRouterData | null>(null);
  const [dbModels, setDbModels] = useState<DbModel[]>([]);
  const [keys, setKeys] = useState<Record<string, KeyStatus>>({});

  // Filtering
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingModel, setEditingModel] = useState<DbModel | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state for add/edit
  const [formData, setFormData] = useState({
    id: "",
    display_name: "",
    family: "anthropic",
    api_provider: "openrouter",
    api_model_id: "",
    supports_batch_pricing: false,
    pricing_input: "",
    pricing_output: "",
    context_length: "",
  });

  const apiUrl = getApiUrl();

  useEffect(() => {
    if (authLoading) return;

    const credentials = sessionStorage.getItem("adminCredentials");
    if (!credentials && !authenticated) {
      window.location.href = "/admin/login?redirect=/admin/models";
      return;
    }
    loadData();
  }, [authLoading, authenticated]);

  async function loadData() {
    setLoading(true);
    const credentials = sessionStorage.getItem("adminCredentials");
    const headers: Record<string, string> = credentials
      ? { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" };
    const fetchOptions = { headers, credentials: "include" as const };

    try {
      const [modelsRes, keysRes, orRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/models`, fetchOptions),
        fetch(`${apiUrl}/api/admin/keys`, fetchOptions),
        fetch(`${apiUrl}/api/models/openrouter`),
      ]);

      if (modelsRes.ok) {
        const data = (await modelsRes.json()) as { models: DbModel[]; total: number };
        setDbModels(data.models);
      }

      if (keysRes.ok) {
        const data = (await keysRes.json()) as { keys: KeyStatus[] };
        const keyMap: Record<string, KeyStatus> = {};
        data.keys.forEach((k) => {
          keyMap[k.provider] = k;
        });
        setKeys(keyMap);
      }

      if (orRes.ok) {
        const data = (await orRes.json()) as OpenRouterData;
        setOrData(data);
      }
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
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

  function openAddModal() {
    setFormData({
      id: "",
      display_name: "",
      family: "anthropic",
      api_provider: "anthropic",
      api_model_id: "",
      supports_batch_pricing: false,
      pricing_input: "",
      pricing_output: "",
      context_length: "",
    });
    setEditingModel(null);
    setModalMode("add");
  }

  function openEditModal(model: DbModel) {
    setFormData({
      id: model.id,
      display_name: model.display_name,
      family: model.family,
      api_provider: model.api_provider,
      api_model_id: model.api_model_id || "",
      supports_batch_pricing: model.supports_batch_pricing,
      pricing_input: model.pricing ? (model.pricing.inputPer1K * 1000).toString() : "",
      pricing_output: model.pricing ? (model.pricing.outputPer1K * 1000).toString() : "",
      context_length: model.context_length?.toString() || "",
    });
    setEditingModel(model);
    setModalMode("edit");
  }

  function closeModal() {
    setModalMode(null);
    setEditingModel(null);
  }

  async function handleSaveModel(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const credentials = sessionStorage.getItem("adminCredentials");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(credentials ? { Authorization: `Basic ${credentials}` } : {}),
    };

    try {
      const payload: Record<string, unknown> = {
        display_name: formData.display_name,
        api_provider: formData.api_provider,
        api_model_id: formData.api_model_id || undefined,
        supports_batch_pricing: formData.supports_batch_pricing,
      };

      // Add pricing if provided
      if (formData.pricing_input && formData.pricing_output) {
        payload.pricing = {
          input: parseFloat(formData.pricing_input),
          output: parseFloat(formData.pricing_output),
        };
      }

      // Add context length if provided
      if (formData.context_length) {
        payload.context_length = parseInt(formData.context_length, 10);
      }

      if (modalMode === "add") {
        payload.id = formData.id;
        payload.family = formData.family;

        const res = await fetch(`${apiUrl}/api/admin/models`, {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error || "Failed to create model");
        }
      } else {
        const res = await fetch(`${apiUrl}/api/admin/models/${encodeURIComponent(formData.id)}`, {
          method: "PATCH",
          headers,
          credentials: "include",
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error || "Failed to update model");
        }
      }

      await loadData();
      closeModal();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save model");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteModel(modelId: string) {
    if (!confirm(`Delete model ${modelId}? This cannot be undone.`)) return;

    setDeleting(modelId);
    const credentials = sessionStorage.getItem("adminCredentials");
    const headers: Record<string, string> = credentials
      ? { Authorization: `Basic ${credentials}` }
      : {};

    try {
      const res = await fetch(`${apiUrl}/api/admin/models/${encodeURIComponent(modelId)}`, {
        method: "DELETE",
        headers,
        credentials: "include",
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || "Failed to delete model");
      }

      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete model");
    } finally {
      setDeleting(null);
    }
  }

  // Get key status color
  function getKeyStatusColor(provider: string): string {
    // Map api_provider to key provider name
    const providerMap: Record<string, string> = {
      openrouter: "openrouter",
      anthropic: "anthropic",
      google: "google",
      openai: "openai",
    };
    const keyProvider = providerMap[provider] || provider;
    const status = keys[keyProvider]?.status || "unconfigured";

    switch (status) {
      case "active":
        return "text-emerald-500";
      case "error":
        return "text-red-500";
      default:
        return "text-muted-foreground/30";
    }
  }

  function hasActiveKey(provider: string): boolean {
    const providerMap: Record<string, string> = {
      openrouter: "openrouter",
      anthropic: "anthropic",
      google: "google",
      openai: "openai",
    };
    const keyProvider = providerMap[provider] || provider;
    return keys[keyProvider]?.status === "active";
  }

  // Filter models
  const filteredModels = dbModels.filter((m) => {
    if (providerFilter !== "all" && m.api_provider !== providerFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        m.id.toLowerCase().includes(q) ||
        m.display_name.toLowerCase().includes(q) ||
        m.family.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const uniqueProviders = Array.from(new Set(dbModels.map((m) => m.api_provider))).sort();

  function formatPrice(pricePerK: number | undefined): string {
    if (!pricePerK) return "—";
    const pricePerM = pricePerK * 1000;
    if (pricePerM === 0) return "Free";
    if (pricePerM < 0.01) return `$${(pricePerM * 1000).toFixed(3)}/B`;
    if (pricePerM < 1) return `$${pricePerM.toFixed(3)}/M`;
    return `$${pricePerM.toFixed(2)}/M`;
  }

  if (authLoading || loading) {
    return (
      <div className="max-w-6xl mx-auto flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground font-mono">
            {authLoading ? "Checking session..." : "Loading models..."}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
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
          <p className="text-sm text-muted-foreground mt-1">
            Manage AI models and API routing configuration
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openAddModal}
            className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
          >
            <Plus size={14} />
            Add Model
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            Sync OpenRouter
          </button>
        </div>
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
          <div className="text-3xl font-bold tabular-nums tracking-tight">{dbModels.length}</div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">
            <Cloud size={12} />
            OpenRouter
          </div>
          <div className="text-3xl font-bold tabular-nums tracking-tight">{orData?.totalModels || "—"}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">API Keys</div>
          <div className="flex items-center gap-1">
            {["openrouter", "anthropic", "google", "openai"].map((p) => (
              <div
                key={p}
                className={`w-3 h-3 rounded-full ${
                  keys[p]?.status === "active" ? "bg-emerald-500" : "bg-muted-foreground/20"
                }`}
                title={`${p}: ${keys[p]?.status || "unconfigured"}`}
              />
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Last Sync</div>
          <div className="text-sm font-medium text-muted-foreground">
            {orData?.cachedAt ? new Date(orData.cachedAt).toLocaleString() : "Never"}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-muted-foreground" />
          <select
            className="text-sm border rounded px-3 py-1.5 bg-background"
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
          >
            <option value="all">All Providers</option>
            {uniqueProviders.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <input
          type="text"
          placeholder="Search models..."
          className="text-sm border rounded px-3 py-1.5 bg-background w-64"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">
          {filteredModels.length} of {dbModels.length} models
        </span>
      </div>

      {/* Models Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                Model
              </th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                API Route
              </th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                Pricing (In/Out)
              </th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                ELO
              </th>
              <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {filteredModels.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-muted-foreground">
                  No models found. Click "Add Model" or "Sync OpenRouter" to add models.
                </td>
              </tr>
            ) : (
              filteredModels.map((m) => (
                <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <Key size={14} className={getKeyStatusColor(m.api_provider)} />
                      <div>
                        <div className="font-medium">{m.display_name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{m.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-xs px-2 py-0.5 rounded bg-muted inline-block w-fit">
                        {m.api_provider}
                      </span>
                      {m.api_model_id && m.api_model_id !== m.id && (
                        <span className="text-xs text-muted-foreground font-mono truncate max-w-48">
                          {m.api_model_id}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 tabular-nums text-muted-foreground">
                    {m.pricing ? (
                      <span>
                        {formatPrice(m.pricing.inputPer1K)} / {formatPrice(m.pricing.outputPer1K)}
                      </span>
                    ) : (
                      "—"
                    )}
                    {m.supports_batch_pricing && (
                      <span className="ml-1 text-xs text-emerald-600" title="Supports 50% batch discount">
                        B
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 tabular-nums">
                    <span className="font-medium">{m.elo_rating}</span>
                    {m.elo_games_played > 0 && (
                      <span className="text-xs text-muted-foreground ml-1">({m.elo_games_played}g)</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditModal(m)}
                        className="p-2 hover:bg-muted rounded-md transition-colors"
                        title="Edit model"
                      >
                        <Edit2 size={14} className="text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleDeleteModel(m.id)}
                        disabled={deleting === m.id}
                        className="p-2 hover:bg-red-500/10 rounded-md transition-colors disabled:opacity-50"
                        title="Delete model"
                      >
                        {deleting === m.id ? (
                          <Loader2 size={14} className="animate-spin text-muted-foreground" />
                        ) : (
                          <Trash2 size={14} className="text-red-500/70" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border rounded-lg shadow-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">
                {modalMode === "add" ? "Add New Model" : "Edit Model"}
              </h2>
              <button onClick={closeModal} className="p-1 hover:bg-muted rounded">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveModel} className="p-4 space-y-4">
              {/* Model ID - only editable when adding */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Model ID</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 bg-background font-mono text-sm disabled:opacity-50 disabled:bg-muted"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  placeholder="e.g., anthropic/claude-4-opus-20250115"
                  disabled={modalMode === "edit"}
                  required
                />
                {modalMode === "add" && (
                  <p className="text-xs text-muted-foreground">
                    Format: provider/model-name (e.g., anthropic/claude-4-opus)
                  </p>
                )}
              </div>

              {/* Display Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Display Name</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 bg-background"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  placeholder="e.g., Claude 4 Opus"
                  required
                />
              </div>

              {/* Family - only when adding */}
              {modalMode === "add" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Model Family</label>
                  <select
                    className="w-full border rounded px-3 py-2 bg-background"
                    value={formData.family}
                    onChange={(e) => setFormData({ ...formData, family: e.target.value })}
                  >
                    {MODEL_FAMILIES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* API Provider */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">API Provider</label>
                <select
                  className="w-full border rounded px-3 py-2 bg-background"
                  value={formData.api_provider}
                  onChange={(e) => setFormData({ ...formData, api_provider: e.target.value })}
                >
                  {API_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Warning if no key */}
              {!hasActiveKey(formData.api_provider) && (
                <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md text-amber-600 text-sm">
                  <AlertTriangle size={16} />
                  <span>No active API key for {formData.api_provider}</span>
                </div>
              )}

              {/* API Model ID */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">API Model ID (optional)</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 bg-background font-mono text-sm"
                  value={formData.api_model_id}
                  onChange={(e) => setFormData({ ...formData, api_model_id: e.target.value })}
                  placeholder={formData.id || "Leave blank to use Model ID"}
                />
                <p className="text-xs text-muted-foreground">
                  Override the ID sent to the API (use if different from Model ID)
                </p>
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Input Price ($/1M tokens)</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    className="w-full border rounded px-3 py-2 bg-background tabular-nums"
                    value={formData.pricing_input}
                    onChange={(e) => setFormData({ ...formData, pricing_input: e.target.value })}
                    placeholder="e.g., 15.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Output Price ($/1M tokens)</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    className="w-full border rounded px-3 py-2 bg-background tabular-nums"
                    value={formData.pricing_output}
                    onChange={(e) => setFormData({ ...formData, pricing_output: e.target.value })}
                    placeholder="e.g., 75.00"
                  />
                </div>
              </div>

              {/* Context Length */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Context Length (optional)</label>
                <input
                  type="number"
                  min="1"
                  className="w-full border rounded px-3 py-2 bg-background tabular-nums"
                  value={formData.context_length}
                  onChange={(e) => setFormData({ ...formData, context_length: e.target.value })}
                  placeholder="e.g., 200000"
                />
              </div>

              {/* Batch Pricing */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="batch_pricing"
                  checked={formData.supports_batch_pricing}
                  onChange={(e) => setFormData({ ...formData, supports_batch_pricing: e.target.checked })}
                />
                <label htmlFor="batch_pricing" className="text-sm">
                  Supports Batch API Pricing (50% discount)
                </label>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border rounded hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-foreground text-background rounded hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {modalMode === "add" ? "Create Model" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
