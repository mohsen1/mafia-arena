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

  const effectiveApiUrl = apiUrl || getApiUrl();

  // Load API keys when authenticated
  useEffect(() => {
    if (authenticated && user) {
      loadKeys();
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
    const signInUrl =
      typeof window !== "undefined" && window.location.hostname === "localhost"
        ? `http://localhost:8787/api/auth/google?redirect=/account`
        : `${effectiveApiUrl}/api/auth/google?redirect=/account`;

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
          Add your own API keys to run games with your provider access. Keys are encrypted and
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
              <p className="mt-1">Add a key to run games with your own provider access.</p>
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
