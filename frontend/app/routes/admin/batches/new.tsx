import { useEffect } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/new";
import { Loader2 } from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Redirecting... | Mafia Arena" }];
}

/**
 * Admin batch creation now uses the unified /batches/new page.
 * This page redirects there automatically.
 */
export default function AdminNewBatchRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/batches/new", { replace: true });
  }, [navigate]);

  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground font-mono">
          Redirecting to unified batch creation...
        </span>
      </div>
    </div>
  );
}
