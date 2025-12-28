import type { Route } from "./+types/model.$id";
import { useParams } from 'react-router';

export function meta({}: Route.MetaArgs) {
  return [{ title: "Model Analysis | Mafia Arena" }];
}

export default function ModelAnalysis() {
  const params = useParams();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Model Analysis</h1>
      <p className="text-muted-foreground">Model: {params.id}</p>
    </div>
  );
}

