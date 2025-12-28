import type { Route } from "./+types/index";
import { Link } from 'react-router';
import { useAuth } from '~/contexts/auth';
import { Shield, Plus, Database, Key } from 'lucide-react';

export function meta({}: Route.MetaArgs) {
  return [{ title: "Admin | Mafia Arena" }];
}

export default function AdminIndex() {
  const { authenticated, user } = useAuth();

  if (!authenticated || !user?.isAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-6 w-6" />
          Admin
        </h1>
        <div className="border rounded p-8 text-center text-muted-foreground">
          Please sign in as an admin to access this page.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
        <Shield className="h-6 w-6" />
        Admin Panel
      </h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link 
          to="/admin/batches"
          className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
        >
          <Plus className="h-8 w-8 mb-2 text-muted-foreground" />
          <h2 className="font-semibold">Batches</h2>
          <p className="text-sm text-muted-foreground">Manage game batches</p>
        </Link>
        
        <Link 
          to="/admin/models"
          className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
        >
          <Database className="h-8 w-8 mb-2 text-muted-foreground" />
          <h2 className="font-semibold">Models</h2>
          <p className="text-sm text-muted-foreground">Manage AI models</p>
        </Link>
        
        <Link 
          to="/admin/keys"
          className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
        >
          <Key className="h-8 w-8 mb-2 text-muted-foreground" />
          <h2 className="font-semibold">API Keys</h2>
          <p className="text-sm text-muted-foreground">Manage API keys</p>
        </Link>
      </div>
    </div>
  );
}

