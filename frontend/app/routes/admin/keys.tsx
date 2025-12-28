import type { Route } from "./+types/keys";
import { useAuth } from '~/contexts/auth';

export function meta({}: Route.MetaArgs) {
  return [{ title: "API Keys | Mafia Arena" }];
}

export default function AdminKeys() {
  const { user } = useAuth();

  if (!user?.isAdmin) {
    return <div>Access denied</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
      <p className="text-muted-foreground">API key management coming soon...</p>
    </div>
  );
}

