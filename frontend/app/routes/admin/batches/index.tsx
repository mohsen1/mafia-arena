import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/index";
import { Loader2 } from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Redirecting... | Mafia Arena" }];
}

/**
 * Admin batches list now uses the unified /batches page.
 * This page redirects there automatically, preserving query params.
 */
export default function AdminBatchesRedirect() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const params = searchParams.toString();
    navigate(`/batches${params ? `?${params}` : ""}`, { replace: true });
  }, [navigate, searchParams]);

  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground font-mono">
          Redirecting to unified batch list...
        </span>
      </div>
    </div>
  );
}
