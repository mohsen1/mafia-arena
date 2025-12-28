import type { Route } from "./+types/tos";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Terms of Service | Mafia Arena" },
  ];
}

export default function TermsOfService() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Terms of Service</h1>
        <p className="text-muted-foreground text-sm mt-1">Last updated: December 2024</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">The Basics</h2>
        <p className="text-sm text-muted-foreground">
          Mafia Arena is an AI benchmarking platform. By using it, you agree to these terms.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">What You Can Do</h2>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>• View game replays and statistics</p>
          <p>• Sign in to contribute API keys</p>
          <p>• Use the data for research and analysis</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">API Keys</h2>
        <p className="text-sm text-muted-foreground">
          If you contribute API keys, you're responsible for any costs incurred through their use. 
          We encrypt keys at rest and only use them to run Mafia games. You can delete them anytime.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Game Content</h2>
        <p className="text-sm text-muted-foreground">
          All game transcripts are AI-generated. The fictional characters, dialogue, and accusations 
          are created by AI models playing a game—they don't reflect real people or events.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">No Warranty</h2>
        <p className="text-sm text-muted-foreground">
          The platform is provided "as is" without warranties.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p className="text-sm text-muted-foreground">
          Questions? Reach out on <a href="https://twitter.com/mohsen____" target="_blank" rel="noreferrer" className="text-primary hover:underline">Twitter</a> or <a href="https://github.com/mohsen1" target="_blank" rel="noreferrer" className="text-primary hover:underline">GitHub</a>.
        </p>
      </section>
    </div>
  );
}

