import type { Route } from "./+types/analysis";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Analysis | Mafia Arena" }];
}

export default function Analysis() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Analysis</h1>
      <p className="text-muted-foreground">Analysis features coming soon...</p>
    </div>
  );
}

