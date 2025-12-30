import { useState, useEffect } from "react";
import { Link } from "react-router";
import { useAuth } from "~/contexts/auth";
import { getApiUrl } from "~/lib/utils";
import ProviderModelSelector from "~/components/ui/ProviderModelSelector";
import { Shuffle, Loader2, KeyRound, AlertCircle, Info, Clock, Server } from "lucide-react";

export function meta() {
  return [
    { title: "New Batch | Mafia Arena" },
    { name: "description", content: "Create a new batch of Mafia games" },
  ];
}

interface Estimate {
  tokensPerGame: number;
  totalTokens: number;
  timeEstimateMinutes: number;
  estimatedCostUsd: number;
  maxGames: number;
}

interface UserKey {
  provider: string;
  fingerprint: string;
}

const USER_MAX_GAMES = 50;
const ADMIN_MAX_GAMES = 10000;

export default function NewUserBatch() {
  const { authenticated, loading: authLoading, user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;
  const maxGames = isAdmin ? ADMIN_MAX_GAMES : USER_MAX_GAMES;

  const [name, setName] = useState("");
  const [totalGames, setTotalGames] = useState(10);
  const [modelA, setModelA] = useState("");
  const [modelB, setModelB] = useState("");
  const [modelAName, setModelAName] = useState("");
  const [modelBName, setModelBName] = useState("");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pickingRandom, setPickingRandom] = useState(false);
  const [userKeys, setUserKeys] = useState<UserKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Admin-only options
  const [useSystemKeys, setUseSystemKeys] = useState(false);
  const [useBatchAPI, setUseBatchAPI] = useState(false);
  const [batchAPIEnabled, setBatchAPIEnabled] = useState(false);

  const apiUrl = getApiUrl();

  // Load user's API keys
  useEffect(() => {
    if (authLoading || !authenticated) return;
    loadUserKeys();
  }, [authLoading, authenticated]);

  async function loadUserKeys() {
    setLoadingKeys(true);
    try {
      const res = await fetch(`${apiUrl}/api/auth/keys`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as { keys: UserKey[] };
        setUserKeys(data.keys);
      }
    } catch (err) {
      console.error("Failed to load API keys:", err);
    } finally {
      setLoadingKeys(false);
    }
  }

  useEffect(() => {
    if (authenticated) {
      updateEstimate();
    }
  }, [totalGames, authenticated, useBatchAPI]);

  // Listen for model changes
  useEffect(() => {
    const handleModelChange = (e: CustomEvent) => {
      const { inputId, modelId, displayName, supportsBatchPricing } = e.detail;
      if (inputId === "modelA") {
        setModelA(modelId);
        setModelAName(displayName || modelId.split("/").pop() || modelId);
        if (supportsBatchPricing) setBatchAPIEnabled(true);
      } else if (inputId === "modelB") {
        setModelB(modelId);
        setModelBName(displayName || modelId.split("/").pop() || modelId);
        if (supportsBatchPricing) setBatchAPIEnabled(true);
      }
    };

    window.addEventListener("modelChanged" as any, handleModelChange);
    return () => window.removeEventListener("modelChanged" as any, handleModelChange);
  }, []);

  async function updateEstimate() {
    try {
      const res = await fetch(`${apiUrl}/api/batches/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          totalGames: Math.min(totalGames, maxGames),
          config: {
            playerCount: 11,
            mafiaCount: 2,
            teams: [
              { modelId: "estimate", team: "mafia", count: 2 },
              { modelId: "estimate", team: "town", count: 9 },
            ],
            discussionEnabled: true,
            contextLevel: "windowed",
          },
          useBatchAPI,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as Estimate;
        setEstimate(data);
      }
    } catch {}
  }

  async function handleRandomFree() {
    setPickingRandom(true);

    try {
      const res = await fetch(`${apiUrl}/api/models/openrouter`);
      if (!res.ok) throw new Error("Failed to fetch models");

      const data = (await res.json()) as {
        providers: string[];
        modelsByProvider: Record<
          string,
          Array<{ id: string; name: string; pricing: { inputPer1M: number; outputPer1M: number } }>
        >;
      };

      // Filter to only providers the user has keys for
      const userProviders = new Set(userKeys.map((k) => k.provider));

      const freeModels: Array<{ id: string; name: string }> = [];
      for (const provider of data.providers) {
        // Only include models from providers the user has keys for
        if (!userProviders.has(provider)) continue;

        const models = data.modelsByProvider[provider] || [];
        for (const model of models) {
          if (model.pricing.inputPer1M === 0 && model.pricing.outputPer1M === 0) {
            freeModels.push({ id: model.id, name: model.name });
          }
        }
      }

      if (freeModels.length < 2) {
        alert("Not enough free models available for your API keys. Try adding more provider keys.");
        return;
      }

      const shuffled = freeModels.sort(() => Math.random() - 0.5);
      const pickedA = shuffled[0];
      const pickedB = shuffled[1];

      window.dispatchEvent(
        new CustomEvent("selectModel", {
          detail: { inputId: "modelA", modelId: pickedA.id, displayName: pickedA.name },
        })
      );
      window.dispatchEvent(
        new CustomEvent("selectModel", {
          detail: { inputId: "modelB", modelId: pickedB.id, displayName: pickedB.name },
        })
      );
    } catch (err) {
      alert("Failed to fetch models");
    } finally {
      setPickingRandom(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!modelA || !modelB) {
      setSubmitError("Please select both models");
      return;
    }

    // Skip key check if admin using system keys
    if (!isAdmin || !useSystemKeys) {
      if (userKeys.length === 0) {
        setSubmitError("You must add API keys before creating batches. Go to Account → API Keys.");
        return;
      }
    }

    setSubmitting(true);

    const batchName = name.trim() || `${modelAName} vs ${modelBName}`;

    try {
      const res = await fetch(`${apiUrl}/api/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: batchName,
          totalGames: Math.min(totalGames, maxGames),
          config: {
            playerCount: 11,
            mafiaCount: 2,
            teams: [
              { modelId: modelA, team: "mafia", count: 2 },
              { modelId: modelB, team: "town", count: 9 },
            ],
            discussionEnabled: true,
            contextLevel: "windowed",
            maxRounds: 10,
            personaConstraints: "moderate",
          },
          useBatchAPI: isAdmin && useBatchAPI,
          useSystemKeys: isAdmin && useSystemKeys,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: { message?: string }; message?: string };
        throw new Error(err.error?.message || err.message || "Failed to create batch");
      }

      const result = (await res.json()) as { batchId: string };
      window.location.href = `/batches/${result.batchId}`;
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create batch");
      setSubmitting(false);
    }
  }

  // Not authenticated
  if (!authLoading && !authenticated) {
    // Use apiUrl which handles dev vs prod
    const signInUrl = `${apiUrl}/api/auth/google?redirect=/batches/new`;

    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
          <KeyRound className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Sign In Required</h1>
          <p className="text-muted-foreground">
            Sign in to create batch games using your own API keys.
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

  // No API keys (but admins can use system keys)
  if (!authLoading && !loadingKeys && userKeys.length === 0 && !isAdmin) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
          <KeyRound className="w-8 h-8 text-amber-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">API Keys Required</h1>
          <p className="text-muted-foreground">
            To run batch games, you need to add your own API keys. Games will use your credits.
          </p>
        </div>
        <Link
          to="/account"
          className="inline-flex items-center gap-2 px-6 py-3 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Add API Keys
        </Link>
        <p className="text-xs text-muted-foreground">
          Supported providers: OpenAI, Anthropic, Google, and more
        </p>
      </div>
    );
  }

  if (authLoading || loadingKeys) {
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
      <div>
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mb-2">
          <Link to="/batches" className="hover:text-foreground transition-colors">
            batches
          </Link>
          <span>/</span>
          <span>new</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Create Batch</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Run up to {maxGames.toLocaleString()} games {isAdmin && useSystemKeys ? "using system API keys" : "using your API keys"}
        </p>
      </div>

      {/* Admin Options */}
      {isAdmin && (
        <div className="space-y-3 p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Server className="w-4 h-4" />
            Admin Options
          </h3>
          
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useSystemKeys}
              onChange={(e) => setUseSystemKeys(e.target.checked)}
              className="mt-1 rounded border-muted-foreground/50"
            />
            <div>
              <span className="text-sm font-medium">Use System API Keys</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                Run games using the platform's configured keys instead of your own.
              </p>
            </div>
          </label>

          <label className={`flex items-start gap-3 ${!batchAPIEnabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
            <input
              type="checkbox"
              checked={useBatchAPI}
              onChange={(e) => setUseBatchAPI(e.target.checked)}
              disabled={!batchAPIEnabled}
              className="mt-1 rounded border-muted-foreground/50 disabled:opacity-50"
            />
            <div>
              <span className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                Batch API (50% cheaper, ~24h delay)
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                {batchAPIEnabled 
                  ? "Use provider batch APIs for significant cost savings. Results may take up to 24 hours."
                  : "Select models that support batch pricing to enable this option."}
              </p>
            </div>
          </label>
        </div>
      )}

      {/* API Keys Info */}
      {(!isAdmin || !useSystemKeys) && userKeys.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border">
          <Info className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-muted-foreground">
              You have API keys for:{" "}
              <span className="text-foreground font-medium">
                {userKeys.map((k) => k.provider).join(", ")}
              </span>
            </p>
            <p className="text-muted-foreground mt-1">
              Games will use your credits. Select models from providers you have keys for.{" "}
              <Link to="/account" className="text-foreground hover:underline">
                Manage keys →
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* System Keys Info */}
      {isAdmin && useSystemKeys && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
          <Server className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-muted-foreground">
              Using <span className="text-foreground font-medium">system API keys</span>.
              Games will be charged to the platform's API accounts.
            </p>
          </div>
        </div>
      )}

      {/* Submit Error */}
      {submitError && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/5 border border-red-500/30">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
        </div>
      )}

      {/* Split Screen Layout */}
      <div className="grid lg:grid-cols-[1fr,360px] gap-8">
        {/* Left: Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Batch Name */}
          <div className="space-y-2">
            <label
              htmlFor="name"
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Batch Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., GPT-4o vs Claude Sonnet"
              className="w-full px-3 py-2.5 border rounded-md bg-background text-sm focus:outline-none focus:ring-1 focus:ring-foreground focus:border-foreground transition-colors"
            />
          </div>

          {/* Game Count */}
          <div className="space-y-2">
            <label
              htmlFor="totalGames"
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Number of Games (max {maxGames.toLocaleString()})
            </label>
            <input
              type="number"
              id="totalGames"
              min={1}
              max={maxGames}
              value={totalGames}
              onChange={(e) => setTotalGames(Math.min(parseInt(e.target.value) || 1, maxGames))}
              className="w-full px-3 py-2.5 border rounded-md bg-background text-sm focus:outline-none focus:ring-1 focus:ring-foreground focus:border-foreground transition-colors tabular-nums"
            />
          </div>

          {/* Team Configuration */}
          <div className="space-y-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Team Configuration
            </h3>

            <div className="px-3 py-2 border rounded-md bg-muted/50 text-sm text-muted-foreground">
              11 players — <span className="text-red-500 font-medium">2 Mafia</span> vs{" "}
              <span className="text-blue-500 font-medium">9 Town</span>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <ProviderModelSelector team="mafia" placeholder="Select model..." inputId="modelA" />
              <ProviderModelSelector team="town" placeholder="Select model..." inputId="modelB" />
            </div>

            <button
              type="button"
              onClick={handleRandomFree}
              disabled={pickingRandom}
              className="w-full px-3 py-2.5 text-sm border border-dashed rounded-md hover:bg-muted/50 transition-colors flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Shuffle size={14} className={pickingRandom ? "animate-spin" : ""} />
              {pickingRandom ? "Picking..." : "Random Free Models (from your providers)"}
            </button>
          </div>

          {/* Submit (Mobile) */}
          <div className="flex gap-3 lg:hidden">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Batch"}
            </button>
            <Link
              to="/batches"
              className="px-4 py-2.5 border rounded-md text-sm hover:bg-muted transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>

        {/* Right: Sticky Cost Receipt */}
        <div className="hidden lg:block">
          <div className="sticky top-20 space-y-4">
            {/* Receipt Panel */}
            <div className="border rounded-lg p-6 space-y-5 bg-card">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Cost Estimate
              </h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Games</span>
                  <span className="font-medium tabular-nums">
                    {Math.min(totalGames, maxGames).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Tokens/Game</span>
                  <span className="font-medium tabular-nums">
                    ~{estimate?.tokensPerGame.toLocaleString() || "300,000"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Tokens</span>
                  <span className="font-medium tabular-nums">
                    ~{estimate?.totalTokens.toLocaleString() || "3,000,000"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Est. Duration</span>
                  <span className="font-medium tabular-nums">~{estimate?.timeEstimateMinutes || 8} min</span>
                </div>
              </div>

              <div className="h-px bg-border"></div>

              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Est. Cost</span>
                <div className="text-3xl font-bold tabular-nums">
                  ${estimate?.estimatedCostUsd.toFixed(2) || "0.00"}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Cost depends on models selected.
                {useBatchAPI && " (50% discount applied)"}
                {useSystemKeys ? " Uses system API keys." : " Uses your API keys."}
              </p>
            </div>

            {/* Submit Button (Desktop) */}
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full px-4 py-3 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Batch"}
            </button>
            <Link
              to="/batches"
              className="block text-center px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

