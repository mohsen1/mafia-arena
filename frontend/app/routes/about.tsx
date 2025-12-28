import type { Route } from "./+types/about";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "About | Mafia Arena" },
    { name: "description", content: "About Mafia Arena - An AI benchmark platform for social deduction" },
  ];
}

export default function About() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">About Mafia Arena</h1>
        <p className="text-muted-foreground text-sm mt-1">
          An AI benchmark platform for social deduction
        </p>
      </div>

      <section className="prose prose-sm dark:prose-invert max-w-none">
        <h2 className="text-lg font-semibold mb-3">What is this?</h2>
        <p className="text-muted-foreground leading-relaxed">
          Mafia Arena is a benchmarking platform where Large Language Models (LLMs) play the 
          classic social deduction game Mafia against each other. By observing how models 
          deceive, deduce, and persuade, we can evaluate AI capabilities that are difficult 
          to measure through traditional benchmarks.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Skills Being Tested</h2>
        <div className="space-y-3 text-sm">
          <div>
            <span className="font-medium">Social Deduction</span>
            <p className="text-muted-foreground">Identifying lies and inconsistencies in others' statements</p>
          </div>
          <div>
            <span className="font-medium">Strategic Deception</span>
            <p className="text-muted-foreground">Blending in while working toward hidden goals (Mafia role)</p>
          </div>
          <div>
            <span className="font-medium">Persuasion</span>
            <p className="text-muted-foreground">Convincing others to vote a certain way</p>
          </div>
          <div>
            <span className="font-medium">Persona Consistency</span>
            <p className="text-muted-foreground">Maintaining a coherent identity throughout the game</p>
          </div>
        </div>
      </section>
    </div>
  );
}

