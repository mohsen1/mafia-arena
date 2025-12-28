import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import type { Route } from "./+types/login";
import { useAuth } from "~/contexts/auth";
import { getApiUrl } from "~/lib/utils";
import { Terminal, KeyRound, AlertCircle, CheckCircle, Loader2 } from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Login | Mafia Arena Admin" }];
}

const ERROR_MESSAGES: Record<string, string> = {
  oauth_denied: "Google sign-in was cancelled",
  invalid_callback: "Invalid OAuth callback",
  invalid_state: "Session expired, please try again",
  token_exchange_failed: "Failed to complete sign-in",
  user_info_failed: "Could not retrieve your profile",
  email_not_verified: "Please verify your email with Google",
  internal_error: "Something went wrong, please try again",
};

export default function AdminLogin() {
  const [searchParams] = useSearchParams();
  const { authenticated, user, apiUrl: authApiUrl } = useAuth();
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [legacyError, setLegacyError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirect = searchParams.get("redirect") || "/admin";
  const error = searchParams.get("error");
  const authSuccess = searchParams.get("auth") === "success";
  const apiUrl = authApiUrl || getApiUrl();

  useEffect(() => {
    // If we just had a successful auth, redirect immediately
    if (authSuccess) {
      localStorage.setItem("adminUnlocked", "true");
      window.location.href = redirect;
      return;
    }

    // Check if already authenticated as admin
    async function checkAuth() {
      try {
        const res = await fetch(`${apiUrl}/api/auth/me`, { credentials: "include" });
        if (res.ok) {
          const data = (await res.json()) as { authenticated?: boolean; user?: { isAdmin?: boolean } };
          if (data.authenticated && data.user?.isAdmin) {
            localStorage.setItem("adminUnlocked", "true");
            window.location.href = redirect;
            return;
          }
        }
      } catch {}
      setLoading(false);
    }

    checkAuth();
  }, [authSuccess, redirect, apiUrl]);

  async function handleLegacyLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setLegacyError(null);

    const credentials = btoa(`${username}:${password}`);

    try {
      const res = await fetch(`${apiUrl}/api/admin/stats/live`, {
        headers: { Authorization: `Basic ${credentials}` },
      });

      if (res.status === 401) {
        throw new Error("Invalid credentials");
      }

      if (!res.ok) {
        throw new Error("Connection failed");
      }

      sessionStorage.setItem("adminCredentials", credentials);
      localStorage.setItem("adminUnlocked", "true");
      window.location.href = redirect;
    } catch (err) {
      setLegacyError(err instanceof Error ? err.message : "Login failed");
      setSubmitting(false);
    }
  }

  const googleLoginUrl =
    typeof window !== "undefined" && window.location.hostname === "localhost"
      ? `http://localhost:8787/api/auth/google?redirect=${encodeURIComponent(redirect)}`
      : `${apiUrl}/api/auth/google?redirect=${encodeURIComponent(redirect)}`;

  if (loading) {
    return (
      <div className="max-w-sm mx-auto mt-20">
        <div className="flex items-center justify-center py-8">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Checking session...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto mt-20">
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-3 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground font-mono">
            <Terminal size={14} />
            <span>admin/login</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome Back</h1>
          <p className="text-sm text-muted-foreground">Sign in to access the control panel</p>
        </div>

        {/* Success message */}
        {authSuccess && (
          <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-600 dark:text-emerald-400">
            <CheckCircle size={18} />
            <span className="text-sm font-medium">Signed in successfully!</span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 dark:text-red-400">
            <AlertCircle size={18} />
            <span className="text-sm font-medium">{ERROR_MESSAGES[error] || error}</span>
          </div>
        )}

        {/* Login options */}
        <div className="space-y-6">
          {/* Google Sign-In (Primary) */}
          <a
            href={googleLoginUrl}
            className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-border rounded-lg text-foreground font-medium hover:bg-muted/50 transition-colors shadow-sm"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span>Continue with Google</span>
          </a>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or use legacy login</span>
            </div>
          </div>

          {/* Legacy Basic Auth (Collapsible) */}
          <details className="group">
            <summary className="flex items-center justify-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
              <KeyRound size={14} />
              <span>Username & Password</span>
            </summary>

            <form onSubmit={handleLegacyLogin} className="mt-6 space-y-5">
              <div className="space-y-2">
                <label htmlFor="username" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Username
                </label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2.5 border rounded-md bg-background text-sm focus:outline-none focus:ring-1 focus:ring-foreground focus:border-foreground transition-colors"
                  placeholder="Enter username"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border rounded-md bg-background text-sm focus:outline-none focus:ring-1 focus:ring-foreground focus:border-foreground transition-colors"
                  placeholder="Enter password"
                />
              </div>

              {legacyError && (
                <div className="text-sm text-red-600 dark:text-red-400 p-3 bg-red-500/5 border border-red-500/20 rounded-md">
                  {legacyError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-2.5 bg-muted text-foreground rounded-md text-sm font-medium hover:bg-muted/80 transition-colors disabled:opacity-50"
              >
                {submitting ? "Signing in..." : "Sign In"}
              </button>
            </form>
          </details>
        </div>

        <p className="text-xs text-center text-muted-foreground">Session secured with HttpOnly cookies</p>
      </div>
    </div>
  );
}
