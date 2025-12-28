import type { Route } from "./+types/index";
import { useAuth } from '~/contexts/auth';

export function meta({}: Route.MetaArgs) {
  return [{ title: "Models | Mafia Arena" }];
}

export default function ModelsIndex() {
  const { user } = useAuth();

  if (!user?.isAdmin) {
    return <div>Access denied</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Models</h1>
      <p className="text-muted-foreground">Model management coming soon...</p>
    </div>
  );
}

