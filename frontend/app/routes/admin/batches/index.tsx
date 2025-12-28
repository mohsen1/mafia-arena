import type { Route } from "./+types/index";
import { Link } from 'react-router';
import { useAuth } from '~/contexts/auth';
import { Plus } from 'lucide-react';

export function meta({}: Route.MetaArgs) {
  return [{ title: "Batches | Mafia Arena" }];
}

export default function BatchesIndex() {
  const { user } = useAuth();

  if (!user?.isAdmin) {
    return <div>Access denied</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Batches</h1>
        <Link 
          to="/admin/batches/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90"
        >
          <Plus size={16} />
          New Batch
        </Link>
      </div>
      <p className="text-muted-foreground">Batch list coming soon...</p>
    </div>
  );
}

