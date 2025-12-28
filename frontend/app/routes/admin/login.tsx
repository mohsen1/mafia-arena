import type { Route } from "./+types/login";
import { useAuth } from '~/contexts/auth';

export function meta({}: Route.MetaArgs) {
  return [{ title: "Admin Login | Mafia Arena" }];
}

export default function AdminLogin() {
  const { getLoginUrl } = useAuth();

  return (
    <div className="max-w-md mx-auto space-y-6 py-12">
      <h1 className="text-2xl font-bold tracking-tight text-center">Admin Login</h1>
      <p className="text-muted-foreground text-center">
        Sign in with Google to access the admin panel.
      </p>
      <a 
        href={getLoginUrl('/admin')}
        className="block w-full text-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
      >
        Sign in with Google
      </a>
    </div>
  );
}

