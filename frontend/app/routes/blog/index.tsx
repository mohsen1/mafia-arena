import type { Route } from "./+types/index";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Blog | Mafia Arena" }];
}

export default function Blog() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Blog</h1>
      <p className="text-muted-foreground">Coming soon...</p>
    </div>
  );
}

