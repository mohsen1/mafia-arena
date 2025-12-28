import type { Route } from "./+types/account";
import { useAuth } from '~/contexts/auth';

export function meta({}: Route.MetaArgs) {
  return [{ title: "Account | Mafia Arena" }];
}

export default function Account() {
  const { authenticated, user } = useAuth();

  if (!authenticated || !user) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        <p className="text-muted-foreground">Please sign in to view your account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Account</h1>
      <div className="border rounded-lg p-4 space-y-2">
        <p><strong>Name:</strong> {user.name}</p>
        <p><strong>Email:</strong> {user.email}</p>
      </div>
    </div>
  );
}

