import { useState, useEffect } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/index";
import { useAuth } from "~/contexts/auth";
import { getApiUrl } from "~/lib/utils";
import {
  RefreshCw,
  Loader2,
  Search,
  Shield,
  ShieldCheck,
  Key,
  Package,
  Calendar,
  Mail,
  User,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Users | Mafia Arena Admin" }];
}

interface UserStats {
  apiKeysCount: number;
  batchesCount: number;
  batchesCompleted: number;
  lastBatchAt: number | null;
}

interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  isAdmin: boolean;
  createdAt: number;
  updatedAt: number | null;
  stats: UserStats;
}

interface UsersResponse {
  users: User[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}

export default function AdminUsers() {
  const { authenticated, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [togglingAdmin, setTogglingAdmin] = useState<string | null>(null);

  const apiUrl = getApiUrl();

  useEffect(() => {
    if (authLoading) return;

    const credentials = sessionStorage.getItem("adminCredentials");
    if (!credentials && !authenticated) {
      window.location.href = "/admin/login?redirect=/admin/users";
      return;
    }
    loadUsers();
  }, [authLoading, authenticated, offset, searchQuery]);

  async function loadUsers() {
    setLoading(true);
    setError(null);

    const credentials = sessionStorage.getItem("adminCredentials");
    const headers: Record<string, string> = credentials
      ? { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" };

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });
      if (searchQuery) {
        params.append("search", searchQuery);
      }

      const res = await fetch(`${apiUrl}/api/admin/users?${params}`, {
        headers,
        credentials: "include",
      });

      if (res.status === 401) {
        sessionStorage.removeItem("adminCredentials");
        window.location.href = "/admin/login?redirect=/admin/users";
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as UsersResponse;
      setUsers(data.users);
      setTotal(data.total);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(searchInput);
    setOffset(0);
  }

  async function toggleAdmin(userId: string, currentStatus: boolean) {
    if (!confirm(`Are you sure you want to ${currentStatus ? "remove" : "grant"} admin privileges?`)) {
      return;
    }

    setTogglingAdmin(userId);
    const credentials = sessionStorage.getItem("adminCredentials");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(credentials ? { Authorization: `Basic ${credentials}` } : {}),
    };

    try {
      const res = await fetch(`${apiUrl}/api/admin/users/${userId}`, {
        method: "PATCH",
        headers,
        credentials: "include",
        body: JSON.stringify({ isAdmin: !currentStatus }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || "Failed to update user");
      }

      await loadUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setTogglingAdmin(null);
    }
  }

  function formatDate(timestamp: number | null): string {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatDateTime(timestamp: number | null): string {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (authLoading || loading) {
    return (
      <div className="max-w-6xl mx-auto flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground font-mono">
            {authLoading ? "Checking session..." : "Loading users..."}
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
            <span>users</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage users, permissions, and view activity statistics
          </p>
        </div>

        <button
          onClick={loadUsers}
          disabled={loading}
          className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by email or name..."
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-foreground text-background rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Search
        </button>
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              setSearchQuery("");
              setOffset(0);
            }}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}
      </form>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">
            <User size={12} />
            Total Users
          </div>
          <div className="text-3xl font-bold tabular-nums tracking-tight">{total}</div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">
            <ShieldCheck size={12} className="text-amber-500" />
            Admins
          </div>
          <div className="text-3xl font-bold tabular-nums tracking-tight text-amber-600 dark:text-amber-400">
            {users.filter((u) => u.isAdmin).length}
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">
            <Key size={12} />
            With API Keys
          </div>
          <div className="text-3xl font-bold tabular-nums tracking-tight">
            {users.filter((u) => u.stats.apiKeysCount > 0).length}
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">
            <Package size={12} />
            Active Users
          </div>
          <div className="text-3xl font-bold tabular-nums tracking-tight">
            {users.filter((u) => u.stats.batchesCount > 0).length}
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-6 text-center">
          <AlertTriangle size={24} className="mx-auto text-red-500 mb-3" />
          <p className="font-medium text-red-600 dark:text-red-400">Failed to load users</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
          <button
            onClick={loadUsers}
            className="mt-4 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Users Table */}
      {!error && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Stats
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      {searchQuery ? "No users found matching your search" : "No users found"}
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          {user.picture ? (
                            <img
                              src={user.picture}
                              alt={user.name || user.email}
                              className="w-10 h-10 rounded-full"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zinc-400 to-zinc-600 flex items-center justify-center">
                              <User className="w-5 h-5 text-white" />
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-sm">{user.name || "No name"}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Mail size={12} />
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1 text-xs">
                          <div className="flex items-center gap-2">
                            <Key size={12} className="text-muted-foreground" />
                            <span className="text-muted-foreground">
                              {user.stats.apiKeysCount} key{user.stats.apiKeysCount !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Package size={12} className="text-muted-foreground" />
                            <span className="text-muted-foreground">
                              {user.stats.batchesCount} batch{user.stats.batchesCount !== 1 ? "es" : ""} (
                              {user.stats.batchesCompleted} completed)
                            </span>
                          </div>
                          {user.stats.lastBatchAt && (
                            <div className="flex items-center gap-2">
                              <Calendar size={12} className="text-muted-foreground" />
                              <span className="text-muted-foreground">
                                Last: {formatDate(user.stats.lastBatchAt)}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-4">
                        {user.isAdmin ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <ShieldCheck size={12} />
                            Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                            <User size={12} />
                            User
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() => toggleAdmin(user.id, user.isAdmin)}
                          disabled={togglingAdmin === user.id}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${
                            user.isAdmin
                              ? "bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20"
                              : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          }`}
                        >
                          {togglingAdmin === user.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : user.isAdmin ? (
                            <>
                              <Shield size={12} />
                              Remove Admin
                            </>
                          ) : (
                            <>
                              <ShieldCheck size={12} />
                              Make Admin
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {(hasMore || offset > 0) && (
            <div className="px-4 py-3 border-t border-border flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {offset + 1}–{Math.min(offset + limit, total)} of {total} users
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ChevronLeft size={14} />
                  Previous
                </button>
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={!hasMore}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

