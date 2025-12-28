import type { Route } from "./+types/matchups";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Matchups | Mafia Arena" }];
}

export default function Matchups() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Matchups</h1>
      <p className="text-muted-foreground">Matchups analysis coming soon...</p>
    </div>
  );
}

