import { useState, useEffect } from "react";
import type { Route } from "./+types/account";
import { useAuth } from "~/contexts/auth";
import { getApiUrl } from "~/lib/utils";
import {
  User,
  Mail,
  Shield,
  Key,
  LogOut,
  Plus,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Server,
  CheckCircle,
  XCircle,
  RefreshCw,
  ExternalLink,
  Copy,
  Zap,
} from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Account | Mafia Arena" }];
}

const SUPPORTED_PROVIDERS = [
  { id: "openai", name: "OpenAI", placeholder: "sk-proj-..." },
  { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-..." },
  { id: "google", name: "Google AI", placeholder: "AIza..." },
  { id: "openrouter", name: "OpenRouter", placeholder: "sk-or-..." },
  { id: "xai", name: "xAI (Grok)", placeholder: "xai-..." },
  { id: "deepseek", name: "DeepSeek", placeholder: "sk-..." },
  { id: "mistral", name: "Mistral AI", placeholder: "..." },
  { id: "cohere", name: "Cohere", placeholder: "..." },
  { id: "ai21", name: "AI21 Labs", placeholder: "..." },
  { id: "together", name: "Together AI", placeholder: "..." },
  { id: "groq", name: "Groq", placeholder: "gsk_..." },
  { id: "cerebras", name: "Cerebras", placeholder: "csk-..." },
  { id: "fireworks", name: "Fireworks", placeholder: "fw_..." },
  { id: "minimax", name: "MiniMax", placeholder: "..." },
];

interface ApiKey {
  provider: string;
  fingerprint: string;
}

interface ExternalWorker {
  id: string;
  name: string;
  workerUrl: string;
  authTokenFingerprint: string;
  status: "pending" | "verified" | "failed";
  supportedProviders: string[];
  lastHealthCheck: number | null;
  lastError: string | null;
  createdAt: number;
}

interface VerificationStats {
  trustScore: number;
  totalGames: number;
  verificationPasses: number;
  verificationFailures: number;
  lastVerification: number | null;
}

function getProviderName(providerId: string): string {
  const provider = SUPPORTED_PROVIDERS.find((p) => p.id === providerId);
  return provider ? provider.name : providerId;
}

export default function Account() {
  const { authenticated, user, loading: authLoading, logout, apiUrl } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [keysUnavailable, setKeysUnavailable] = useState(false);

  // Add key modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [addKeyError, setAddKeyError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete account modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // External workers state
  const [workers, setWorkers] = useState<ExternalWorker[]>([]);
  const [workersLoading, setWorkersLoading] = useState(true);
  const [workersError, setWorkersError] = useState<string | null>(null);
  const [verificationStats, setVerificationStats] = useState<VerificationStats | null>(null);

  // Add worker modal state
  const [showAddWorkerModal, setShowAddWorkerModal] = useState(false);
  const [workerName, setWorkerName] = useState("My Worker");
  const [workerUrl, setWorkerUrl] = useState("");
  const [workerAuthToken, setWorkerAuthToken] = useState("");
  const [addWorkerError, setAddWorkerError] = useState<string | null>(null);
  const [savingWorker, setSavingWorker] = useState(false);
  const [verifyingWorker, setVerifyingWorker] = useState<string | null>(null);

  const effectiveApiUrl = apiUrl || getApiUrl();

  // Load API keys and external workers when authenticated
  useEffect(() => {
    if (authenticated && user) {
      loadKeys();
      loadWorkers();
      loadVerificationStats();
    }
  }, [authenticated, user]);

  async function loadKeys() {
    setKeysLoading(true);
    setKeysError(null);
    setKeysUnavailable(false);

    try {
      const res = await fetch(`${effectiveApiUrl}/api/auth/keys`, {
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 503) {
          setKeysUnavailable(true);
          return;
        }
        throw new Error("Failed to load keys");
      }

      const data = await res.json() as { keys?: ApiKey[] };
      setKeys(data.keys || []);
    } catch (e) {
      setKeysError("Failed to load API keys. Please try again.");
    } finally {
      setKeysLoading(false);
    }
  }

  async function handleAddKey() {
    if (!selectedProvider) {
      setAddKeyError("Please select a provider");
      return;
    }

    if (!apiKeyInput || apiKeyInput.length < 10) {
      setAddKeyError("Please enter a valid API key");
      return;
    }

    setSaving(true);
    setAddKeyError(null);

    try {
      const res = await fetch(`${effectiveApiUrl}/api/auth/keys`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selectedProvider, apiKey: apiKeyInput }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: { message?: string } };
        throw new Error(data.error?.message || "Failed to save key");
      }

      setShowAddModal(false);
      setSelectedProvider("");
      setApiKeyInput("");
      await loadKeys();
    } catch (e) {
      setAddKeyError(e instanceof Error ? e.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteKey(provider: string) {
    if (!confirm(`Are you sure you want to delete your ${getProviderName(provider)} API key?`)) {
      return;
    }

    try {
      const res = await fetch(`${effectiveApiUrl}/api/auth/keys/${provider}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to delete key");
      }

      await loadKeys();
    } catch (e) {
      alert("Failed to delete API key. Please try again.");
    }
  }

  async function loadWorkers() {
    setWorkersLoading(true);
    setWorkersError(null);

    try {
      const res = await fetch(`${effectiveApiUrl}/api/auth/external-workers`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to load workers");
      }

      const data = (await res.json()) as { workers?: ExternalWorker[] };
      setWorkers(data.workers || []);
    } catch (e) {
      setWorkersError("Failed to load external workers.");
    } finally {
      setWorkersLoading(false);
    }
  }

  async function loadVerificationStats() {
    try {
      const res = await fetch(`${effectiveApiUrl}/api/auth/external-workers/verification/stats`, {
        credentials: "include",
      });

      if (res.ok) {
        const data = (await res.json()) as { stats?: VerificationStats };
        setVerificationStats(data.stats || null);
      }
    } catch {
      // Stats are optional, ignore errors
    }
  }

  async function handleAddWorker() {
    if (!workerUrl) {
      setAddWorkerError("Please enter a worker URL");
      return;
    }

    if (!workerAuthToken || workerAuthToken.length < 32) {
      setAddWorkerError("Auth token must be at least 32 characters");
      return;
    }

    setSavingWorker(true);
    setAddWorkerError(null);

    try {
      const res = await fetch(`${effectiveApiUrl}/api/auth/external-workers`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: workerName,
          workerUrl,
          authToken: workerAuthToken,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } };
        throw new Error(data.error?.message || "Failed to register worker");
      }

      setShowAddWorkerModal(false);
      setWorkerName("My Worker");
      setWorkerUrl("");
      setWorkerAuthToken("");
      await loadWorkers();
    } catch (e) {
      setAddWorkerError(e instanceof Error ? e.message : "An error occurred");
    } finally {
      setSavingWorker(false);
    }
  }

  async function handleVerifyWorker(workerId: string, authToken: string) {
    setVerifyingWorker(workerId);

    try {
      const res = await fetch(`${effectiveApiUrl}/api/auth/external-workers/${workerId}/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken }),
      });

      if (!res.ok) {
        throw new Error("Verification failed");
      }

      await loadWorkers();
    } catch (e) {
      alert("Failed to verify worker. Please check your auth token.");
    } finally {
      setVerifyingWorker(null);
    }
  }

  async function handleDeleteWorker(workerId: string, workerName: string) {
    if (!confirm(`Are you sure you want to remove "${workerName}"?`)) {
      return;
    }

    try {
      const res = await fetch(`${effectiveApiUrl}/api/auth/external-workers/${workerId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to delete worker");
      }

      await loadWorkers();
    } catch (e) {
      alert("Failed to delete worker. Please try again.");
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  function getStatusBadge(status: ExternalWorker["status"]) {
    switch (status) {
      case "verified":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/10 border border-green-500/20 rounded-full text-xs font-medium text-green-600 dark:text-green-400">
            <CheckCircle className="h-3 w-3" />
            Verified
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded-full text-xs font-medium text-red-600 dark:text-red-400">
            <XCircle className="h-3 w-3" />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs font-medium text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-3 w-3" />
            Pending
          </span>
        );
    }
  }

  async function handleSignOut() {
    try {
      await fetch(`${effectiveApiUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (e) {}

    localStorage.removeItem("adminUnlocked");
    logout();
    window.location.href = "/";
  }

  async function handleDeleteAccount() {
    if (confirmEmail.toLowerCase() !== user?.email?.toLowerCase()) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`${effectiveApiUrl}/api/auth/account`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || "Failed to delete account");
      }

      localStorage.removeItem("adminUnlocked");
      window.location.href = "/?deleted=true";
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "An error occurred");
      setDeleting(false);
    }
  }

  const selectedProviderData = SUPPORTED_PROVIDERS.find((p) => p.id === selectedProvider);

  // Loading state
  if (authLoading) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading account...</span>
        </div>
      </div>
    );
  }

  // Not authenticated state
  if (!authenticated || !user) {
    // Use effectiveApiUrl which returns empty string in dev (goes through Vite proxy for cookies)
    const signInUrl = `${effectiveApiUrl}/api/auth/google?redirect=/account`;

    return (
      <div className="max-w-2xl mx-auto text-center py-16 space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
          <User className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Sign in required</h2>
          <p className="text-sm text-muted-foreground">Please sign in to view your account</p>
        </div>
        <a
          href={signInUrl}
          className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:bg-foreground/90 transition-colors"
        >
          Sign in with Google
        </a>
      </div>
    );
  }

  // Authenticated state
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        <p className="text-muted-foreground">Manage your profile and API keys</p>
      </div>

      {/* Profile Card */}
      <div className="border rounded-lg p-6 space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Profile
        </h2>

        <div className="flex items-center gap-4">
          {user.picture ? (
            <img
              src={user.picture}
              alt={user.name}
              className="w-16 h-16 rounded-full bg-muted object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <User className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <div className="space-y-1">
            <p className="text-lg font-semibold">{user.name}</p>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              <span>{user.email}</span>
            </p>
          </div>
        </div>

        {/* Admin badge */}
        {user.isAdmin && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs font-medium text-amber-600 dark:text-amber-400">
            <Shield className="h-3 w-3" />
            Administrator (uses system keys)
          </span>
        )}

        {/* User badge */}
        {!user.isAdmin && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-xs font-medium text-blue-600 dark:text-blue-400">
            <Key className="h-3 w-3" />
            Using personal API keys
          </span>
        )}
      </div>

      {/* API Keys Section */}
      <div className="border rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            API Keys
          </h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="text-xs px-3 py-1.5 bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors flex items-center gap-1.5"
          >
            <Plus className="h-3 w-3" />
            Add Key
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          Add your own API keys to run games using your own provider quota. Keys are encrypted and
          stored securely.
        </p>

        {/* Admin notice */}
        {user.isAdmin && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              As an admin, you can use system API keys. Adding personal keys is optional.
            </p>
          </div>
        )}

        {/* Keys list */}
        <div className="space-y-2">
          {keysLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading keys...</div>
          ) : keysUnavailable ? (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Key management is not yet configured. Please contact the administrator.
              </p>
            </div>
          ) : keysError ? (
            <div className="text-center py-8 text-red-500 text-sm">{keysError}</div>
          ) : keys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
              <p>No API keys configured yet.</p>
              <p className="mt-1">Add a key to run games using your own provider quota.</p>
            </div>
          ) : (
            keys.map((key) => (
              <div
                key={key.provider}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-foreground/10 flex items-center justify-center">
                    <Key className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{getProviderName(key.provider)}</p>
                    <p className="text-xs text-muted-foreground font-mono">{key.fingerprint}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteKey(key.provider)}
                  className="p-2 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                  title="Delete key"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* External Workers Section */}
      <div className="border rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            External Workers
          </h2>
          <button
            onClick={() => setShowAddWorkerModal(true)}
            className="text-xs px-3 py-1.5 bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors flex items-center gap-1.5"
          >
            <Plus className="h-3 w-3" />
            Add Worker
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          Deploy your own Cloudflare Worker to hold your API keys. This provides complete cryptographic
          isolation - your keys never touch our servers.
        </p>

        {/* Info box with template link */}
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-sm text-blue-600 dark:text-blue-400 flex items-start gap-2">
            <Zap className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Get started by deploying the{" "}
              <a
                href="https://github.com/mohsen1/mafia-arena/tree/main/external-worker-template"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline inline-flex items-center gap-1"
              >
                external worker template
                <ExternalLink className="h-3 w-3" />
              </a>
            </span>
          </p>
        </div>

        {/* Verification stats */}
        {verificationStats && (verificationStats.verificationPasses > 0 || verificationStats.verificationFailures > 0) && (
          <div className="p-3 bg-muted/30 border rounded-lg">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Verification Status
            </p>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1">
                <span className="font-medium">{Math.round(verificationStats.trustScore * 100)}%</span>
                <span className="text-muted-foreground">trust score</span>
              </span>
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <CheckCircle className="h-3 w-3" />
                {verificationStats.verificationPasses} passed
              </span>
              {verificationStats.verificationFailures > 0 && (
                <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                  <XCircle className="h-3 w-3" />
                  {verificationStats.verificationFailures} failed
                </span>
              )}
            </div>
          </div>
        )}

        {/* Workers list */}
        <div className="space-y-2">
          {workersLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading workers...</div>
          ) : workersError ? (
            <div className="text-center py-8 text-red-500 text-sm">{workersError}</div>
          ) : workers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
              <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No external workers configured yet.</p>
              <p className="mt-1">Deploy your own worker for complete API key isolation.</p>
            </div>
          ) : (
            workers.map((worker) => (
              <div
                key={worker.id}
                className="p-4 bg-muted/30 rounded-lg border space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded bg-foreground/10 flex items-center justify-center">
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{worker.name}</p>
                        {getStatusBadge(worker.status)}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5 flex items-center gap-1">
                        {worker.workerUrl}
                        <button
                          onClick={() => copyToClipboard(worker.workerUrl)}
                          className="p-0.5 hover:bg-muted rounded"
                          title="Copy URL"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        const token = prompt("Enter your auth token to re-verify:");
                        if (token && token.length >= 32) {
                          handleVerifyWorker(worker.id, token);
                        }
                      }}
                      disabled={verifyingWorker === worker.id}
                      className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-50"
                      title="Re-verify worker"
                    >
                      {verifyingWorker === worker.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteWorker(worker.id, worker.name)}
                      className="p-2 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                      title="Remove worker"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Worker details */}
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="text-muted-foreground">
                    Token: <span className="font-mono">{worker.authTokenFingerprint}</span>
                  </span>
                  {worker.supportedProviders.length > 0 && (
                    <span className="text-muted-foreground">
                      Providers: {worker.supportedProviders.map(getProviderName).join(", ")}
                    </span>
                  )}
                  {worker.lastHealthCheck && (
                    <span className="text-muted-foreground">
                      Last checked: {new Date(worker.lastHealthCheck).toLocaleString()}
                    </span>
                  )}
                </div>

                {/* Error message */}
                {worker.lastError && (
                  <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-600 dark:text-red-400">
                    {worker.lastError}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Session */}
      <div className="border rounded-lg p-6 space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Session
        </h2>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 border border-red-500/20 rounded-md hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>

      {/* Danger Zone */}
      <div className="border border-red-500/30 rounded-lg p-6 space-y-4 bg-red-500/5">
        <h2 className="text-sm font-medium uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Danger Zone
        </h2>

        <p className="text-sm text-muted-foreground">
          Permanently delete your account and all associated data.
        </p>

        <button
          onClick={() => setShowDeleteModal(true)}
          className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 transition-colors"
        >
          Delete Account
        </button>
      </div>

      {/* Add Key Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}
        >
          <div className="bg-background border rounded-lg p-6 w-full max-w-md mx-4 space-y-4">
            <h3 className="text-lg font-semibold">Add API Key</h3>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="provider-select" className="text-sm font-medium">
                  Provider
                </label>
                <select
                  id="provider-select"
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select a provider...</option>
                  {SUPPORTED_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="api-key-input" className="text-sm font-medium">
                  API Key
                </label>
                <input
                  type="password"
                  id="api-key-input"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={selectedProviderData?.placeholder || "Enter your API key..."}
                  className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Your key will be encrypted before storage.
                </p>
              </div>
            </div>

            {addKeyError && (
              <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-600 dark:text-red-400">
                {addKeyError}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setAddKeyError(null);
                }}
                className="px-4 py-2 border rounded-md text-sm hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddKey}
                disabled={saving}
                className="px-4 py-2 bg-foreground text-background rounded-md text-sm hover:bg-foreground/90 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Key"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Worker Modal */}
      {showAddWorkerModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => e.target === e.currentTarget && setShowAddWorkerModal(false)}
        >
          <div className="bg-background border rounded-lg p-6 w-full max-w-md mx-4 space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Server className="h-5 w-5" />
              Add External Worker
            </h3>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="worker-name-input" className="text-sm font-medium">
                  Name
                </label>
                <input
                  type="text"
                  id="worker-name-input"
                  value={workerName}
                  onChange={(e) => setWorkerName(e.target.value)}
                  placeholder="My Worker"
                  className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="worker-url-input" className="text-sm font-medium">
                  Worker URL
                </label>
                <input
                  type="url"
                  id="worker-url-input"
                  value={workerUrl}
                  onChange={(e) => setWorkerUrl(e.target.value)}
                  placeholder="https://my-mafia-keys.username.workers.dev"
                  className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Must be a Cloudflare Workers URL (*.workers.dev)
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="worker-auth-token-input" className="text-sm font-medium">
                  Auth Token
                </label>
                <input
                  type="password"
                  id="worker-auth-token-input"
                  value={workerAuthToken}
                  onChange={(e) => setWorkerAuthToken(e.target.value)}
                  placeholder="Your AUTH_TOKEN secret (32+ characters)"
                  className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  The AUTH_TOKEN you set in your worker's secrets. Must be 32+ characters.
                </p>
              </div>
            </div>

            {addWorkerError && (
              <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-600 dark:text-red-400">
                {addWorkerError}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowAddWorkerModal(false);
                  setAddWorkerError(null);
                }}
                className="px-4 py-2 border rounded-md text-sm hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddWorker}
                disabled={savingWorker}
                className="px-4 py-2 bg-foreground text-background rounded-md text-sm hover:bg-foreground/90 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {savingWorker ? "Registering..." : "Register Worker"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => e.target === e.currentTarget && setShowDeleteModal(false)}
        >
          <div className="bg-background border border-red-500/30 rounded-lg p-6 w-full max-w-md mx-4 space-y-4">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-lg font-semibold">Delete Account</h3>
            </div>

            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete your account? This will permanently remove:
            </p>

            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 ml-2">
              <li>Your user profile</li>
              <li>All saved API keys</li>
              <li>Your session data</li>
            </ul>

            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              This action cannot be undone.
            </p>

            <div className="space-y-2">
              <label htmlFor="confirm-email" className="text-sm font-medium">
                Type your email to confirm:{" "}
                <span className="text-muted-foreground font-mono">{user.email}</span>
              </label>
              <input
                type="email"
                id="confirm-email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder="Enter your email..."
                className="w-full px-3 py-2 border border-red-500/30 rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
              />
            </div>

            {deleteError && (
              <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-600 dark:text-red-400">
                {deleteError}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setConfirmEmail("");
                  setDeleteError(null);
                }}
                className="px-4 py-2 border rounded-md text-sm hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={
                  deleting || confirmEmail.toLowerCase() !== user.email?.toLowerCase()
                }
                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? "Deleting..." : "Delete Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
