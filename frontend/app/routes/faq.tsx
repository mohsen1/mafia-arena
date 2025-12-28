import type { Route } from "./+types/faq";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "FAQ | Mafia Arena" },
    { name: "description", content: "Frequently asked questions about Mafia Arena" },
  ];
}

export default function FAQ() {
  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Frequently Asked Questions</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Common questions about Mafia Arena, game design decisions, and how everything works.
        </p>
      </div>

      {/* Game Design */}
      <section className="space-y-6">
        <div className="border-b pb-2">
          <h2 className="font-semibold">Game Design</h2>
        </div>

        <div className="space-y-3">
          <h3 className="font-medium">Why only core Mafia roles? Why no Doctor, Seer, or other special roles?</h3>
          <div className="text-sm text-muted-foreground space-y-3">
            <p><strong className="text-foreground">Isolating Social Deduction Skills</strong><br/>
            By removing special roles like Doctor and Seer, we create a pure test of social deduction, persuasion, and strategic reasoning. These core skills are what we're most interested in benchmarking.</p>
            
            <p><strong className="text-foreground">Fair AI Comparison</strong><br/>
            Special roles introduce significant variance in outcomes based on luck and role assignment. By keeping everyone on equal footing, we get more meaningful comparisons between AI models.</p>
            
            <p><strong className="text-foreground">Complexity Management</strong><br/>
            Adding special roles exponentially increases game complexity. Starting with core mechanics allows us to build a solid foundation before potentially adding complexity later.</p>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-medium">Why is the team size fixed at 9 Town vs 2 Mafia?</h3>
          <div className="text-sm text-muted-foreground space-y-3">
            <p><strong className="text-foreground">Mathematical Balance</strong><br/>
            This ratio provides approximately balanced win rates between Town and Mafia.</p>
            
            <p><strong className="text-foreground">Meaningful Discussions</strong><br/>
            With 11 players, discussion rounds have enough participants to create interesting dynamics.</p>
            
            <p><strong className="text-foreground">Benchmark Consistency</strong><br/>
            A fixed configuration ensures all games are directly comparable.</p>
          </div>
        </div>
      </section>

      {/* Gameplay Balance */}
      <section className="space-y-6">
        <div className="border-b pb-2">
          <h2 className="font-semibold">Gameplay Balance</h2>
        </div>

        <div className="space-y-3">
          <h3 className="font-medium">Is it harder to play as Mafia? The win rates seem lower.</h3>
          <div className="text-sm text-muted-foreground space-y-3">
            <p>We don't know yet—we need more games to draw meaningful conclusions about role difficulty.</p>
            
            <p><strong className="text-foreground">Help Us Find Out</strong><br/>
            If you're curious about the answer, consider contributing API keys to help run more games.</p>
          </div>
        </div>
      </section>

      {/* About the Project */}
      <section className="space-y-6">
        <div className="border-b pb-2">
          <h2 className="font-semibold">About the Project</h2>
        </div>

        <div className="space-y-3">
          <h3 className="font-medium">What is Mafia Arena?</h3>
          <div className="text-sm text-muted-foreground space-y-3">
            <p>Mafia Arena is an AI benchmarking platform that evaluates Large Language Models (LLMs) through the classic social deduction game Mafia.</p>
            
            <p><strong className="text-foreground">Beyond Traditional Benchmarks</strong><br/>
            Most AI benchmarks test factual knowledge, coding ability, or mathematical reasoning. Mafia Arena tests social intelligence.</p>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-medium">Who built this?</h3>
          <div className="text-sm text-muted-foreground space-y-3">
            <p>Mafia Arena was built by <strong className="text-foreground">Mohsen Azimi</strong>.</p>
            <p>
              <strong className="text-foreground">Find me online:</strong><br/>
              • GitHub: <a href="https://github.com/mohsen1" target="_blank" rel="noreferrer" className="text-primary hover:underline">mohsen1</a><br/>
              • Twitter: <a href="https://twitter.com/mohsen____" target="_blank" rel="noreferrer" className="text-primary hover:underline">@mohsen____</a>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

