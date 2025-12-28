import type { Route } from "./+types/$id";
import { useParams } from 'react-router';
import { useAuth } from '~/contexts/auth';

export function meta({}: Route.MetaArgs) {
  return [{ title: "Batch Details | Mafia Arena" }];
}

export default function BatchDetail() {
  const { user } = useAuth();
  const params = useParams();

  if (!user?.isAdmin) {
    return <div>Access denied</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Batch: {params.id}</h1>
      <p className="text-muted-foreground">Batch details coming soon...</p>
    </div>
  );
}

