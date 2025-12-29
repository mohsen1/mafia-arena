import { useState, useEffect } from "react";
import type { Route } from "./+types/new";
import { useAuth } from "~/contexts/auth";
import { getApiUrl } from "~/lib/utils";
import ProviderModelSelector from "~/components/ui/ProviderModelSelector";
import { Shield, Key, Shuffle, Loader2, Eye, EyeOff, Check, TrendingUp } from "lucide-react";
import { getEloRatings, type EloRanking } from "~/lib/api";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Launch New Game | Mafia Arena" }];
}

interface UserKey {
  provider: string;
  fingerprint: string;
}

const PROVIDER_INFO: Record<string, { name: string; placeholder: string }> = {
  openai: { name: "OpenAI", placeholder: "sk-proj-..." },
  anthropic: { name: "Anthropic", placeholder: "sk-ant-..." },
  google: { name: "Google AI", placeholder: "AIza..." },
  openrouter: { name: "OpenRouter", placeholder: "sk-or-..." },
  xai: { name: "xAI (Grok)", placeholder: "xai-..." },
  deepseek: { name: "DeepSeek", placeholder: "sk-..." },
  mistral: { name: "Mistral AI", placeholder: "..." },
  cohere: { name: "Cohere", placeholder: "..." },
  ai21: { name: "AI21 Labs", placeholder: "..." },
  together: { name: "Together AI", placeholder: "..." },
  groq: { name: "Groq", placeholder: "gsk_..." },
  cerebras: { name: "Cerebras", placeholder: "csk-..." },
  fireworks: { name: "Fireworks", placeholder: "fw_..." },
};

export default function NewGame() {
  const { authenticated, user, loading: authLoading, apiUrl: authApiUrl } = useAuth();
  const [modelA, setModelA] = useState("");
  const [modelB, setModelB] = useState("");
  const [userKeys, setUserKeys] = useState<UserKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [missingKeys, setMissingKeys] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [pickingRandom, setPickingRandom] = useState(false);
  
  // Inline API key entry
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showKeyInputs, setShowKeyInputs] = useState<Record<string, boolean>>({});
  const [keyErrors, setKeyErrors] = useState<Record<string, string>>({});
  
  // ELO data
  const [eloData, setEloData] = useState<EloRanking[]>([]);

  const apiUrl = authApiUrl || getApiUrl();
  const isAdmin = user?.isAdmin || false;

  // Load ELO data on mount
  useEffect(() => {
    getEloRatings()
      .then(data => setEloData(data.rankings))
      .catch(() => {});
  }, []);

  // Load user keys when authenticated
  useEffect(() => {
    if (authenticated && user && !user.isAdmin) {
      loadUserKeys();
    }
  }, [authenticated, user]);

  // Listen for model changes
  useEffect(() => {
    const handleModelChange = (e: CustomEvent) => {
      const { inputId, modelId } = e.detail;
      if (inputId === "modelA") {
        setModelA(modelId);
      } else if (inputId === "modelB") {
        setModelB(modelId);
      }
    };

    window.addEventListener("modelChanged" as any, handleModelChange);
    return () => window.removeEventListener("modelChanged" as any, handleModelChange);
  }, []);

  // Check for missing keys when models change
  useEffect(() => {
    if (isAdmin) {
      setMissingKeys([]);
      return;
    }

    if (!modelA || !modelB) {
      setMissingKeys([]);
      return;
    }

    const required = getRequiredProviders([modelA, modelB]);
    const configured = new Set(userKeys.map((k) => k.provider));
    const missing = [...required].filter((p) => !configured.has(p));
    setMissingKeys(missing);
  }, [modelA, modelB, userKeys, isAdmin]);

  function getRequiredProviders(modelIds: string[]): Set<string> {
    const providers = new Set<string>();

    for (const modelId of modelIds) {
      if (modelId.startsWith("openai/") || modelId.startsWith("gpt-")) {
        providers.add("openai");
      } else if (modelId.startsWith("anthropic/") || modelId.startsWith("claude-")) {
        providers.add("anthropic");
      } else if (modelId.startsWith("google/") || modelId.startsWith("gemini-")) {
        providers.add("google");
      } else if (modelId.startsWith("xai/") || modelId.startsWith("grok-")) {
        providers.add("xai");
      } else if (modelId.startsWith("deepseek/")) {
        providers.add("deepseek");
      } else if (modelId.startsWith("together/")) {
        providers.add("together");
      } else if (modelId.startsWith("groq/")) {
        providers.add("groq");
      } else if (modelId.startsWith("cerebras/")) {
        providers.add("cerebras");
      } else if (modelId.startsWith("fireworks/")) {
        providers.add("fireworks");
      } else if (modelId.startsWith("mistral/")) {
        providers.add("mistral");
      } else if (modelId.startsWith("cohere/")) {
        providers.add("cohere");
      } else if (modelId.startsWith("ai21/")) {
        providers.add("ai21");
      } else {
        providers.add("openrouter");
      }
    }

    return providers;
  }

  async function loadUserKeys() {
    setKeysLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/auth/keys`, { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as { keys: UserKey[] };
        setUserKeys(data.keys || []);
      }
    } catch {}
    setKeysLoading(false);
  }

  async function saveApiKey(provider: string) {
    const key = apiKeyInputs[provider];
    if (!key || key.length < 10) {
      setKeyErrors(prev => ({ ...prev, [provider]: "Please enter a valid API key" }));
      return;
    }

    setSavingKey(provider);
    setKeyErrors(prev => ({ ...prev, [provider]: "" }));

    try {
      const res = await fetch(`${apiUrl}/api/auth/keys`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: key }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } };
        throw new Error(data.error?.message || "Failed to save key");
      }

      // Clear input and reload keys
      setApiKeyInputs(prev => ({ ...prev, [provider]: "" }));
      setShowKeyInputs(prev => ({ ...prev, [provider]: false }));
      await loadUserKeys();
    } catch (e) {
      setKeyErrors(prev => ({ ...prev, [provider]: e instanceof Error ? e.message : "Failed to save" }));
    } finally {
      setSavingKey(null);
    }
  }

  function getModelElo(modelId: string): number | null {
    // Try to find ELO by model ID
    for (const ranking of eloData) {
      if (ranking.model_ids?.includes(modelId)) {
        return ranking.elo;
      }
      // Also try matching by display name
      const displayName = modelId.split('/').pop()?.toLowerCase();
      if (displayName && ranking.display_name.toLowerCase().includes(displayName)) {
        return ranking.elo;
      }
    }
    return null;
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
      window.dispatchEvent(new CustomEvent("selectModel", { detail: { inputId: "modelA", modelId: shuffled[0].id } }));
      window.dispatchEvent(new CustomEvent("selectModel", { detail: { inputId: "modelB", modelId: shuffled[1].id } }));
    } catch {
      alert("Failed to fetch models");
    } finally {
      setPickingRandom(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!authenticated) {
      alert("Please sign in to launch games.");
      return;
    }

    if (!isAdmin && userKeys.length === 0) {
      alert("You need to add at least one API key before launching games.");
      return;
    }

    if (missingKeys.length > 0) {
      alert("Please add the required API keys before launching a game.");
      return;
    }

    if (!modelA || !modelB) {
      alert("Please select both mafia and town models");
      return;
    }

    setSubmitting(true);
    setStatusText("Initializing game...");

    try {
      setStatusText("Contacting server...");

      const res = await fetch(`${apiUrl}/api/games/run-direct`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            playerCount: 11,
            mafiaCount: 2,
            teams: [
              { modelId: modelA, team: "mafia", count: 2 },
              { modelId: modelB, team: "town", count: 9 },
            ],
            maxRounds: 10,
            discussionEnabled: true,
            contextLevel: "windowed",
            personaConstraints: "moderate",
          },
        }),
      });

      if (res.status === 401) {
        window.location.href = `${apiUrl}/api/auth/google?redirect=/games/new`;
        return;
      }

      if (res.status === 403) {
        const err = (await res.json()) as { error?: { message?: string } };
        alert(err.error?.message || "You do not have permission to run this game. Please add the required API keys.");
        setSubmitting(false);
        setStatusText("");
        return;
      }

      if (!res.ok) {
        const err = (await res.json()) as { error?: { message?: string }; message?: string };
        throw new Error(err.error?.message || err.message || "Failed to start game");
      }

      const result = (await res.json()) as { gameId: string };
      setStatusText("Game started! Redirecting to live view...");

      setTimeout(() => {
        window.location.href = `/games/${result.gameId}/live`;
      }, 500);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to start game");
      setSubmitting(false);
      setStatusText("");
    }
  }

  const signInUrl =
    typeof window !== "undefined" && window.location.hostname === "localhost"
      ? `http://localhost:8787/api/auth/google?redirect=/games/new`
      : `${apiUrl}/api/auth/google?redirect=/games/new`;

  const canSubmit = authenticated && (isAdmin || userKeys.length > 0) && missingKeys.length === 0;

  // Get ELO for selected models
  const modelAElo = modelA ? getModelElo(modelA) : null;
  const modelBElo = modelB ? getModelElo(modelB) : null;

  if (authLoading) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Game</h1>
        <p className="text-sm text-muted-foreground mt-1">Pit AI models against each other in a game of Mafia</p>
      </div>

      {/* Auth required notice */}
      {!authenticated && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <a href={signInUrl} className="font-medium text-amber-600 dark:text-amber-400 hover:underline">
              Sign in with Google
            </a>{" "}
            to launch games
          </p>
        </div>
      )}

      {/* Admin badge */}
      {authenticated && isAdmin && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-3">
          <Shield className="h-5 w-5 text-emerald-500 shrink-0" />
          <span className="text-sm text-emerald-600 dark:text-emerald-400">Admin — using system API keys</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Team setup note */}
        <div className="text-sm text-muted-foreground">
          11 players — <span className="text-red-500 font-medium">2 mafia</span> vs{" "}
          <span className="text-blue-500 font-medium">9 town</span>
        </div>

        {/* Model selectors with ELO */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <div className="space-y-2">
            <ProviderModelSelector team="mafia" placeholder="Select mafia model..." inputId="modelA" />
            {modelAElo !== null && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-1">
                <TrendingUp size={12} className="text-rose-400" />
                <span>ELO: <span className="font-mono font-medium text-foreground">{modelAElo}</span></span>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <ProviderModelSelector team="town" placeholder="Select town model..." inputId="modelB" />
            {modelBElo !== null && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-1">
                <TrendingUp size={12} className="text-indigo-400" />
                <span>ELO: <span className="font-mono font-medium text-foreground">{modelBElo}</span></span>
              </div>
            )}
          </div>
        </div>

        {/* Random free models button - only for admins */}
        {isAdmin && (
          <button
            type="button"
            onClick={handleRandomFree}
            disabled={pickingRandom}
            className="w-full px-3 py-2 text-sm border border-dashed rounded-lg hover:bg-muted/50 transition-colors flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Shuffle size={14} className={pickingRandom ? "animate-spin" : ""} />
            {pickingRandom ? "Picking..." : "Pick Two Random Free Models"}
          </button>
        )}

        {/* Missing keys with inline entry */}
        {authenticated && !isAdmin && missingKeys.length > 0 && (
          <div className="space-y-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
            <div className="text-sm text-amber-600 dark:text-amber-400 font-medium">
              Add API key{missingKeys.length > 1 ? "s" : ""} for: {missingKeys.map(k => PROVIDER_INFO[k]?.name || k).join(", ")}
            </div>
            
            {missingKeys.map(provider => {
              const info = PROVIDER_INFO[provider] || { name: provider, placeholder: "..." };
              const existingKey = userKeys.find(k => k.provider === provider);
              
              return (
                <div key={provider} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">{info.name}</label>
                    {existingKey && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <Check size={12} /> {existingKey.fingerprint}
                      </span>
                    )}
                  </div>
                  
                  {!existingKey && (
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showKeyInputs[provider] ? "text" : "password"}
                          value={apiKeyInputs[provider] || ""}
                          onChange={(e) => setApiKeyInputs(prev => ({ ...prev, [provider]: e.target.value }))}
                          placeholder={info.placeholder}
                          className="w-full px-3 py-2 pr-10 border rounded-md bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKeyInputs(prev => ({ ...prev, [provider]: !prev[provider] }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showKeyInputs[provider] ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => saveApiKey(provider)}
                        disabled={savingKey === provider || !apiKeyInputs[provider]}
                        className="px-3 py-2 bg-amber-500 text-white rounded-md text-sm font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
                      >
                        {savingKey === provider ? <Loader2 size={16} className="animate-spin" /> : "Save"}
                      </button>
                    </div>
                  )}
                  
                  {keyErrors[provider] && (
                    <p className="text-xs text-red-500">{keyErrors[provider]}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Configured keys preview */}
        {authenticated && !isAdmin && userKeys.length > 0 && missingKeys.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Key size={12} />
            <span>Using your keys: {userKeys.map(k => PROVIDER_INFO[k.provider]?.name || k.provider).join(", ")}</span>
          </div>
        )}

        {statusText && (
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm">{statusText}</span>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="w-full px-4 py-3 bg-foreground text-background rounded-lg font-medium hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? "Starting..." : "Launch Game"}
        </button>
      </form>
    </div>
  );
}
