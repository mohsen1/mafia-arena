import { useState, useEffect } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/new";
import { useAuth } from "~/contexts/auth";
import { getApiUrl } from "~/lib/utils";
import ProviderModelSelector from "~/components/ui/ProviderModelSelector";
import { ArrowLeft, Users, Shield, Key, Shuffle, AlertCircle, Loader2 } from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Launch New Game | Mafia Arena" }];
}

interface UserKey {
  provider: string;
  fingerprint: string;
}

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

  const apiUrl = authApiUrl || getApiUrl();
  const isAdmin = user?.isAdmin || false;

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
      alert("You need to add at least one API key in your Account settings before launching games.");
      return;
    }

    if (missingKeys.length > 0) {
      alert("Please add the required API keys in your Account settings before launching a game.");
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

  if (authLoading) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
        <Link to="/games" className="hover:underline inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Games
        </Link>
        <span>/</span>
        <span>New Game</span>
      </div>

      <div>
      <h1 className="text-2xl font-bold tracking-tight">New Game</h1>
        <p className="text-sm text-muted-foreground mt-1">Pit AI models against each other in a game of Mafia</p>
      </div>

      {/* Auth required notice (shown when not logged in) */}
      {!authenticated && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-600 dark:text-amber-400">Sign in required</p>
              <p className="text-muted-foreground mt-1">
                You need to sign in to launch games. You'll also need to add your own API keys.
              </p>
              <a
                href={signInUrl}
                className="inline-flex items-center gap-1 mt-2 text-amber-600 dark:text-amber-400 hover:underline font-medium"
              >
                Sign in with Google →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* User status banners */}
      {authenticated && (
        <>
          {/* Admin banner */}
          {isAdmin && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-3">
              <Shield className="h-5 w-5 text-emerald-500 shrink-0" />
              <div className="text-sm">
                <span className="font-medium text-emerald-600 dark:text-emerald-400">Admin Mode:</span>
                <span className="text-muted-foreground"> Using system API keys. You can run any model.</span>
              </div>
            </div>
          )}

          {/* User banner */}
          {!isAdmin && userKeys.length > 0 && (
            <div className="p-3 bg-muted/50 border rounded-lg">
              <div className="flex items-center gap-3">
                <Key className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="text-sm">
                  <span className="font-medium">Your API Keys:</span>
                  <span className="text-muted-foreground"> Games will use your configured keys.</span>
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {keysLoading ? (
                  "Loading your configured keys..."
                ) : (
                  <>
                    <span className="text-emerald-600 dark:text-emerald-400">✓ Configured:</span>{" "}
                    {userKeys.map((k) => k.provider).join(", ")}
                  </>
                )}
              </div>
            </div>
          )}

          {/* No API keys error (for non-admin users with zero keys) */}
          {!isAdmin && !keysLoading && userKeys.length === 0 && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-red-600 dark:text-red-400">No API Keys Configured</p>
                  <p className="text-muted-foreground mt-1">
                    You need to add at least one API key before you can launch games. Games use your own API keys to call
                    AI models.
                  </p>
                  <Link
                    to="/account"
                    className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-600 dark:text-red-400 rounded-md font-medium transition-colors"
                  >
                    <Key className="h-4 w-4" /> Add API Keys
                  </Link>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Missing keys warning (for specific models) */}
      {missingKeys.length > 0 && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-600 dark:text-amber-400">Missing API Keys for Selected Models</p>
              <p className="text-muted-foreground mt-1">
                Missing keys for: {missingKeys.join(", ")}. Add them in your Account settings.
              </p>
              <Link
                to="/account"
                className="inline-flex items-center gap-1 mt-2 text-amber-600 dark:text-amber-400 hover:underline"
              >
                <Key className="h-3.5 w-3.5" /> Add keys in Account settings
              </Link>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users size={16} className="text-muted-foreground" />
            Team Configuration
          </div>

          <div className="px-3 py-2 border rounded-md bg-muted/50 text-sm text-muted-foreground">
            11 players — <span className="text-red-500 font-medium">2 mafia</span> vs{" "}
            <span className="text-blue-500 font-medium">9 town</span>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <ProviderModelSelector team="mafia" placeholder="Select mafia model..." inputId="modelA" />
            <ProviderModelSelector team="town" placeholder="Select town model..." inputId="modelB" />
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
        </section>

        {statusText && (
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm">{statusText}</span>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="flex-1 px-4 py-3 bg-foreground text-background rounded-lg font-medium hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Starting..." : "Launch Game"}
          </button>
          <Link to="/games" className="px-4 py-3 border rounded-lg hover:bg-muted transition-colors flex items-center">
            Cancel
          </Link>
        </div>
      </form>

      {/* Info section */}
      <section className="border-t pt-6 mt-6">
        <h2 className="text-sm font-medium mb-3">How it works</h2>
        <div className="grid gap-3 text-sm text-muted-foreground">
          <div className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-muted text-foreground flex items-center justify-center text-xs font-medium">
              1
            </span>
            <p>Select AI models for each team. The mafia team tries to eliminate townspeople while staying hidden.</p>
          </div>
          <div className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-muted text-foreground flex items-center justify-center text-xs font-medium">
              2
            </span>
            <p>The game runs automatically with day/night cycles. Watch AI models discuss, vote, and strategize in real-time.</p>
          </div>
          <div className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-muted text-foreground flex items-center justify-center text-xs font-medium">
              3
            </span>
            <p>
              Games use your API keys. Add keys for providers you want to use in{" "}
              <Link to="/account" className="underline hover:text-foreground">
                Account settings
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
