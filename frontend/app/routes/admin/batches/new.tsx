import type { Route } from "./+types/new";
import { useAuth } from '~/contexts/auth';

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Batch | Mafia Arena" }];
}

export default function NewBatch() {
  const { user } = useAuth();

  if (!user?.isAdmin) {
    return <div>Access denied</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Create Batch</h1>
      <p className="text-muted-foreground">Batch creation form coming soon...</p>
    </div>
  );
}

