import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import type { Route } from "./+types/$id";
import { Loader2 } from "lucide-react";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: "Redirecting... | Mafia Arena" }];
}

/**
 * Admin batch detail page now uses the unified /batches/:id page.
 * This page redirects there automatically.
 */
export default function AdminBatchDetailRedirect() {
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    navigate(`/batches/${id}`, { replace: true });
  }, [navigate, id]);

  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground font-mono">
          Redirecting to unified batch view...
        </span>
      </div>
    </div>
  );
}
