import { useState, useEffect } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/new";
import { getApiUrl } from "~/lib/utils";
import ProviderModelSelector from "~/components/ui/ProviderModelSelector";
import { Shuffle } from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Batch | Mafia Arena Admin" }];
}

interface Estimate {
  tokensPerGame: number;
  totalTokens: number;
  timeEstimateMinutes: number;
  estimatedCostUsd: number;
}

export default function NewBatch() {
  const [name, setName] = useState("");
  const [totalGames, setTotalGames] = useState(10);
  const [modelA, setModelA] = useState("");
  const [modelB, setModelB] = useState("");
  const [modelAName, setModelAName] = useState("");
  const [modelBName, setModelBName] = useState("");
  const [useBatchAPI, setUseBatchAPI] = useState(false);
  const [batchAPIEnabled, setBatchAPIEnabled] = useState(false);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pickingRandom, setPickingRandom] = useState(false);

  const apiUrl = getApiUrl();

  useEffect(() => {
    const credentials = sessionStorage.getItem("adminCredentials");
    if (!credentials) {
      window.location.href = "/admin/login?redirect=/admin/batches/new";
    }
  }, []);

  useEffect(() => {
    updateEstimate();
  }, [totalGames, useBatchAPI]);

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
    const credentials = sessionStorage.getItem("adminCredentials");
    const headers: Record<string, string> = credentials
      ? { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" };

    try {
      const res = await fetch(`${apiUrl}/api/admin/estimate`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          totalGames,
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
        modelsByProvider: Record<string, Array<{ id: string; name: string; pricing: { inputPer1M: number; outputPer1M: number } }>>;
      };

      const freeModels: Array<{ id: string; name: string }> = [];
      for (const provider of data.providers) {
        const models = data.modelsByProvider[provider] || [];
        for (const model of models) {
          if (model.pricing.inputPer1M === 0 && model.pricing.outputPer1M === 0) {
            freeModels.push({ id: model.id, name: model.name });
          }
        }
      }

      if (freeModels.length < 2) {
        alert("Not enough free models available");
        return;
      }

      const shuffled = freeModels.sort(() => Math.random() - 0.5);
      const pickedA = shuffled[0];
      const pickedB = shuffled[1];

      window.dispatchEvent(new CustomEvent("selectModel", { detail: { inputId: "modelA", modelId: pickedA.id, displayName: pickedA.name } }));
      window.dispatchEvent(new CustomEvent("selectModel", { detail: { inputId: "modelB", modelId: pickedB.id, displayName: pickedB.name } }));
    } catch (err) {
      alert("Failed to fetch models");
    } finally {
      setPickingRandom(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!modelA || !modelB) {
      alert("Please select both models");
      return;
    }

    setSubmitting(true);

    const credentials = sessionStorage.getItem("adminCredentials");
    const headers: Record<string, string> = credentials
      ? { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" };

    const batchName = name.trim() || `${modelAName} vs ${modelBName}`;

    try {
      const res = await fetch(`${apiUrl}/api/admin/batches`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          name: batchName,
          totalGames,
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
          useBatchAPI,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        throw new Error(err.message || "Failed to create batch");
      }

      const result = (await res.json()) as { batchId: string };
      window.location.href = `/admin/batches/${result.batchId}`;
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create batch");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mb-2">
          <Link to="/admin" className="hover:text-foreground transition-colors">
            admin
          </Link>
          <span>/</span>
          <Link to="/admin/batches" className="hover:text-foreground transition-colors">
            batches
          </Link>
          <span>/</span>
          <span>new</span>
        </div>
      <h1 className="text-2xl font-bold tracking-tight">Create Batch</h1>
        <p className="text-sm text-muted-foreground mt-1">Launch a batch of games (up to 10,000)</p>
      </div>

      {/* Split Screen Layout */}
      <div className="grid lg:grid-cols-[1fr,360px] gap-8">
        {/* Left: Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Batch Name */}
          <div className="space-y-2">
            <label htmlFor="name" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
            <label htmlFor="totalGames" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Number of Games
            </label>
            <input
              type="number"
              id="totalGames"
              min={1}
              max={10000}
              value={totalGames}
              onChange={(e) => setTotalGames(parseInt(e.target.value) || 10)}
              className="w-full px-3 py-2.5 border rounded-md bg-background text-sm focus:outline-none focus:ring-1 focus:ring-foreground focus:border-foreground transition-colors tabular-nums"
            />
          </div>

          {/* Team Configuration */}
          <div className="space-y-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Team Configuration</h3>

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
              {pickingRandom ? "Picking..." : "Random Free Models"}
            </button>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Options</h3>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={useBatchAPI}
                onChange={(e) => setUseBatchAPI(e.target.checked)}
                disabled={!batchAPIEnabled}
                className="rounded border-muted-foreground/50 disabled:opacity-50"
              />
              <span className={`text-sm ${!batchAPIEnabled ? "text-muted-foreground/60" : ""}`}>
                Batch API (50% cheaper, 24h delay)
              </span>
            </label>
            {!batchAPIEnabled && (
              <p className="text-xs text-muted-foreground">
                Select models that support batch pricing to enable this option
              </p>
            )}
          </div>

          {/* Submit (Mobile) */}
          <div className="flex gap-3 lg:hidden">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? "Launching..." : "Launch Batch"}
            </button>
            <Link to="/admin/batches" className="px-4 py-2.5 border rounded-md text-sm hover:bg-muted transition-colors">
              Cancel
            </Link>
          </div>
        </form>

        {/* Right: Sticky Cost Receipt */}
        <div className="hidden lg:block">
          <div className="sticky top-20 space-y-4">
            {/* Receipt Panel */}
            <div className="border rounded-lg p-6 space-y-5 bg-card">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cost Estimate</h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Games</span>
                  <span className="font-medium tabular-nums">{totalGames}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Tokens/Game</span>
                  <span className="font-medium tabular-nums">~{estimate?.tokensPerGame.toLocaleString() || "15,000"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Tokens</span>
                  <span className="font-medium tabular-nums">~{estimate?.totalTokens.toLocaleString() || "150,000"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Est. Duration</span>
                  <span className="font-medium tabular-nums">~{estimate?.timeEstimateMinutes || 8} min</span>
                </div>
              </div>

              <div className="h-px bg-border"></div>

              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <div className="text-3xl font-bold tabular-nums">${estimate?.estimatedCostUsd.toFixed(2) || "0.00"}</div>
              </div>
            </div>

            {/* Submit Button (Desktop) */}
            <button
              type="submit"
              form="batchForm"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full px-4 py-3 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? "Launching..." : "Launch Batch"}
            </button>
            <Link
              to="/admin/batches"
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
