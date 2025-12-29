import { useState, useEffect } from "react";
import { Link } from "react-router";
import { useAuth } from "~/contexts/auth";
import { getApiUrl } from "~/lib/utils";
import ProviderModelSelector from "~/components/ui/ProviderModelSelector";
import { Shuffle, Loader2, KeyRound, AlertCircle, Info } from "lucide-react";

export function meta() {
  return [
    { title: "New Batch | Mafia Arena" },
    { name: "description", content: "Create a new batch of Mafia games using your API keys" },
  ];
}

interface Estimate {
  tokensPerGame: number;
  totalTokens: number;
  timeEstimateMinutes: number;
  estimatedCostUsd: number;
  userLimit: number;
}

interface UserKey {
  provider: string;
  fingerprint: string;
}

const MAX_GAMES = 50;

export default function NewUserBatch() {
  const { authenticated, loading: authLoading, user } = useAuth();
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
  }, [totalGames, authenticated]);

  // Listen for model changes
  useEffect(() => {
    const handleModelChange = (e: CustomEvent) => {
      const { inputId, modelId, displayName } = e.detail;
      if (inputId === "modelA") {
        setModelA(modelId);
        setModelAName(displayName || modelId.split("/").pop() || modelId);
      } else if (inputId === "modelB") {
        setModelB(modelId);
        setModelBName(displayName || modelId.split("/").pop() || modelId);
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
          totalGames: Math.min(totalGames, MAX_GAMES),
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

    setSubmitting(true);

    const batchName = name.trim() || `${modelAName} vs ${modelBName}`;

    try {
      const res = await fetch(`${apiUrl}/api/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: batchName,
          totalGames: Math.min(totalGames, MAX_GAMES),
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
        <Link
          to="/api/auth/google?redirect=/batches/new"
          className="inline-flex items-center gap-2 px-6 py-3 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Sign in with Google
        </Link>
      </div>
    );
  }

  // No API keys
  if (!authLoading && !loadingKeys && userKeys.length === 0) {
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
          Run up to {MAX_GAMES} games using your API keys
        </p>
      </div>

      {/* API Keys Info */}
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
              Number of Games (max {MAX_GAMES})
            </label>
            <input
              type="number"
              id="totalGames"
              min={1}
              max={MAX_GAMES}
              value={totalGames}
              onChange={(e) => setTotalGames(Math.min(parseInt(e.target.value) || 1, MAX_GAMES))}
              className="w-full px-3 py-2.5 border rounded-md bg-background text-sm focus:outline-none focus:ring-1 focus:ring-foreground focus:border-foreground transition-colors tabular-nums"
            />
          </div>

          {/* Team Configuration */}
          <div className="space-y-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Team Configuration
            </h3>

            <div className="px-3 py-2 border rounded-md bg-muted/50 text-sm text-muted-foreground">
              11 players — <span className="text-red-500 font-medium">2 mafia</span> vs{" "}
              <span className="text-blue-500 font-medium">9 town</span>
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
                    {Math.min(totalGames, MAX_GAMES)}
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
                Cost depends on models selected. This uses your API keys.
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

