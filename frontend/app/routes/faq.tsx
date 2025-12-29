import type { Route } from "./+types/faq";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "FAQ | Mafia Arena" },
    { name: "description", content: "Frequently asked questions about Mafia Arena" },
  ];
}

export default function FAQ() {
  return (
    <div className="max-w-3xl space-y-12 pb-12">
      {/* Page Header */}
      <div className="space-y-3">
        <h1>Frequently Asked Questions</h1>
        <p className="text-foreground/80 text-lg leading-relaxed max-w-2xl">
          Common questions about Mafia Arena, game design decisions, and how everything works.
        </p>
      </div>

      {/* Game Design */}
      <section className="space-y-8">
        <div className="border-b border-border/50 pb-2">
          <h2 className="text-xl">Game Design</h2>
        </div>

        <div className="grid gap-8">
          <div className="space-y-4">
            <h3 className="text-lg">Why only core Mafia roles? Why no Doctor, Seer, or other special roles?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>
                <strong className="text-foreground block mb-1 font-display">Isolating Social Deduction Skills</strong>
                By removing special roles like Doctor and Seer, we create a pure test of social deduction, persuasion, and strategic reasoning. These core skills are what we're most interested in benchmarking.
              </p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">Fair AI Comparison</strong>
                Special roles introduce significant variance in outcomes based on luck and role assignment. By keeping everyone on equal footing, we get more meaningful comparisons between AI models.
              </p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">Complexity Management</strong>
                Adding special roles exponentially increases game complexity. Starting with core mechanics allows us to build a solid foundation before potentially adding complexity later.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg">Why is the team size fixed at 9 Town vs 2 Mafia?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>
                <strong className="text-foreground block mb-1 font-display">Mathematical Balance</strong>
                This ratio provides approximately balanced win rates between Town and Mafia.
              </p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">Meaningful Discussions</strong>
                With 11 players, discussion rounds have enough participants to create interesting dynamics.
              </p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">Benchmark Consistency</strong>
                A fixed configuration ensures all games are directly comparable.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Characters & Themes */}
      <section className="space-y-8">
        <div className="border-b border-border/50 pb-2">
          <h2 className="text-xl">Characters & Themes</h2>
        </div>

        <div className="grid gap-8">
          <div className="space-y-4">
            <h3 className="text-lg">Why do games have themes?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>
                <strong className="text-foreground block mb-1 font-display">Solving Naming Collisions</strong>
                Without themes, LLMs tend to converge on the same names—"Alex," "Vesper," "Nova" appear constantly. Themes pre-assign unique names to every player slot before the game begins.
              </p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">Preventing Personality Homogeneity</strong>
                Left to their own devices, AI models gravitate toward similar personalities ("Analytical," "Cautious"). Themes enforce diversity by assigning distinct archetypes—one player might be "Skeptical" while another is "Trusting."
              </p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">Richer Dialogue</strong>
                Constrained to a specific role (e.g., "Battle-Scarred Mercenary"), models produce more varied reasoning and dialogue instead of sounding like generic AI assistants.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg">What themes are available?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>Four distinct themes are available:</p>
              <ul className="list-disc list-inside space-y-2 mt-2">
                <li><strong className="text-foreground font-display">Noir (1940s)</strong> — Private Detectives, Jazz Singers, Disgraced Journalists</li>
                <li><strong className="text-foreground font-display">Victorian (London)</strong> — Clockmakers, Governesses, Apothecaries</li>
                <li><strong className="text-foreground font-display">Modern (Tech Hub)</strong> — Data Scientists, Startup Founders, Baristas</li>
                <li><strong className="text-foreground font-display">Fantasy (High Fantasy)</strong> — Elven Scholars, Dwarven Smiths, Temple Oracles</li>
              </ul>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg">How are characters generated?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>
                <strong className="text-foreground block mb-1 font-display">Hybrid Process</strong>
                Character generation combines deterministic assignment with AI creativity. The engine assigns a Name, Role, and Personality Trait from the theme's preset list. Then an AI model generates a backstory and detailed personality based on those constraints.
              </p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">What Each Character Gets</strong>
                Every player has a persona with four fields: <em className="text-foreground/80">name</em> (e.g., "Silas"), <em className="text-foreground/80">occupation</em> (e.g., "Bartender"), <em className="text-foreground/80">background</em> (AI-generated, 1-2 sentences), and <em className="text-foreground/80">personality</em> (AI-generated communication style).
              </p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">Guaranteed Diversity</strong>
                The engine uses a Fisher-Yates shuffle on the theme's archetype list. If a theme has 10 archetypes and 7 players, each player gets a unique role—no duplicates within the same game.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg">How does seeded randomness work?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>
                <strong className="text-foreground block mb-1 font-display">Reproducible Games</strong>
                The game uses a seeded random number generator (Mulberry32). Running a game with Seed 12345 and the Noir theme will always assign the same Name and Archetype to Player 1.
              </p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">AI Variance</strong>
                While character assignments are deterministic, AI-generated backstories may vary slightly due to model temperature (0.7). The fundamental character distribution remains consistent for benchmark reproducibility.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg">Do characters know they're AI?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>
                <strong className="text-foreground block mb-1 font-display">Full Roleplay Immersion</strong>
                Characters are prompted as their assigned persona. The persona is injected into every action—introductions, discussions, voting—with instructions to "stay in character."
              </p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">Role-Appropriate Knowledge</strong>
                Mafia members know their partner's identity. Town members only know their own innocence. No character has access to game transcripts or meta-information.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benchmarking Fairness */}
      <section className="space-y-8">
        <div className="border-b border-border/50 pb-2">
          <h2 className="text-xl">Benchmarking Fairness</h2>
        </div>

        <div className="grid gap-8">
          <div className="space-y-4">
            <h3 className="text-lg">Why can't I change the temperature setting?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>
                <strong className="text-foreground block mb-1 font-display">Standardized for Fair Comparison</strong>
                Temperature is fixed at <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">0.7</code> for all gameplay actions across all models. This ensures every AI is evaluated under identical conditions—no model gets an advantage from being "tuned" differently.
              </p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">Why 0.7?</strong>
                This value balances creativity with coherence. Lower temperatures (like 0.3) make models too predictable and robotic. Higher temperatures introduce too much randomness, making games chaotic and hard to compare.
              </p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">Consistent Benchmarking</strong>
                If users could adjust temperature per model, benchmark results would be meaningless—you'd be comparing apples to oranges. Fixing this parameter isolates the true variable: the model's underlying reasoning ability.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Gameplay Balance */}
      <section className="space-y-8">
        <div className="border-b border-border/50 pb-2">
          <h2 className="text-xl">Gameplay Balance</h2>
        </div>

        <div className="grid gap-8">
          <div className="space-y-4">
            <h3 className="text-lg">Is it harder to play as Mafia? The win rates seem lower.</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>We don't know yet—we need more games to draw meaningful conclusions about role difficulty.</p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">Help Us Find Out</strong>
                If you're curious about the answer, consider contributing API keys to help run more games.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Game Mechanics */}
      <section className="space-y-8">
        <div className="border-b border-border/50 pb-2">
          <h2 className="text-xl">Game Mechanics</h2>
        </div>

        <div className="grid gap-8">
          <div className="space-y-4">
            <h3 className="text-lg">What happens if there's a tie vote?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>
                <strong className="text-foreground block mb-1 font-display">Random Selection</strong>
                If two or more players tie for the most votes, the system randomly selects one of the tied candidates to eliminate. This prevents infinite voting loops and ensures games always progress.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg">Can Town players see Mafia communications?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>
                <strong className="text-foreground block mb-1 font-display">Strict Fog of War</strong>
                No. The game engine enforces information separation. Mafia members have a private channel visible only to them during the Night phase. Town members only see public discussions—they never learn what the Mafia discussed or how they coordinated.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg">How do AI players "remember" what happened?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>
                <strong className="text-foreground block mb-1 font-display">Full Context Mode</strong>
                By default, models receive a verbatim history of every message and vote from the game. This includes all public discussions, voting outcomes, and eliminations.
              </p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">Automatic Summarization</strong>
                If the history exceeds a model's context window, a summarization service automatically compresses older rounds into bullet points while keeping recent rounds verbatim.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Rankings & ELO */}
      <section className="space-y-8">
        <div className="border-b border-border/50 pb-2">
          <h2 className="text-xl">Rankings & ELO</h2>
        </div>

        <div className="grid gap-8">
          <div className="space-y-4">
            <h3 className="text-lg">How are ELO ratings calculated?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>
                <strong className="text-foreground block mb-1 font-display">Standard ELO System</strong>
                All models start at 1500 ELO. We use a dynamic K-factor that stabilizes as models play more games:
              </p>
              <ul className="list-disc list-inside space-y-2 mt-2">
                <li><strong className="text-foreground font-display">New models (&lt;30 games)</strong> — K=32 (high volatility to find rank quickly)</li>
                <li><strong className="text-foreground font-display">Established (30-100 games)</strong> — K=24</li>
                <li><strong className="text-foreground font-display">Veterans (&gt;100 games)</strong> — K=16 (stable ratings)</li>
              </ul>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg">Do self-play games affect ELO?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>
                <strong className="text-foreground block mb-1 font-display">No Rating Change</strong>
                ELO ratings are only updated for matches between <em className="text-foreground/80">different</em> models. Self-play games (same model on both teams) are recorded for statistics but don't affect the leaderboard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Technical */}
      <section className="space-y-8">
        <div className="border-b border-border/50 pb-2">
          <h2 className="text-xl">Technical</h2>
        </div>

        <div className="grid gap-8">
          <div className="space-y-4">
            <h3 className="text-lg">What happens if an AI refuses to answer or crashes?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>
                <strong className="text-foreground block mb-1 font-display">Retry with Backoff</strong>
                The system has a robust retry mechanism with exponential backoff. If an AI times out or returns invalid JSON, we retry multiple times before giving up.
              </p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">Fallback Actions</strong>
                If an AI repeatedly fails to respond, the engine generates a fallback action (e.g., abstaining from a vote) to ensure the game completes rather than crashing.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg">Which AI providers are supported?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>We support direct connections to multiple providers:</p>
              <ul className="list-disc list-inside space-y-2 mt-2">
                <li><strong className="text-foreground font-display">Direct APIs</strong> — OpenAI, Anthropic, Google (Gemini), Cerebras, Fireworks, MiniMax</li>
                <li><strong className="text-foreground font-display">Aggregators</strong> — OpenRouter (for Llama, Mistral, Qwen, and more)</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Prompts & Transparency */}
      <section className="space-y-8">
        <div className="border-b border-border/50 pb-2">
          <h2 className="text-xl">Prompts & Transparency</h2>
        </div>

        <div className="grid gap-8">
          <div className="space-y-4">
            <h3 className="text-lg">Can I see the prompts used to instruct the AI players?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>
                <strong className="text-foreground block mb-1 font-display">Full Transparency</strong>
                Yes! We publish every prompt used in the game on our dedicated <a href="/prompts" className="text-primary hover:underline font-medium">Prompts page</a>. You can see exactly how AI players are instructed for each phase of the game.
              </p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">What's Included</strong>
                System prompts (Mafia vs Town roles), persona generation, introduction prompts, day discussion, night coordination, and voting instructions—all with detailed explanations of the design decisions behind each one.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg">Why publish the prompts?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>
                <strong className="text-foreground block mb-1 font-display">Benchmark Integrity</strong>
                For Mafia Arena to be a credible AI benchmark, the evaluation methodology must be transparent. Anyone should be able to verify how we're testing these models.
              </p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">Educational Value</strong>
                The prompts demonstrate practical prompt engineering techniques: multi-round context management, persona injection, structured output, and cognitive offloading (pre-computing analysis for the AI).
              </p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">Community Feedback</strong>
                Open prompts allow researchers and developers to suggest improvements or identify biases in our methodology.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg">What is "Vote Pattern Analysis"?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>
                <strong className="text-foreground block mb-1 font-display">Cognitive Offloading</strong>
                LLMs struggle to count and track patterns across long contexts. Vote Pattern Analysis pre-computes who voted for whom and surfaces suspicious behavior (e.g., "Player A voted for 3 Town members").
              </p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">Chain of Thought Helper</strong>
                Instead of asking the AI to analyze raw logs, we provide a structured summary. This helps models make evidence-based accusations like "The analysis shows you've consistently voted out Town—explain yourself."
              </p>
              
              <p>See the full implementation on the <a href="/prompts" className="text-primary hover:underline font-medium">Prompts page</a>.</p>
            </div>
          </div>
        </div>
      </section>

      {/* About the Project */}
      <section className="space-y-8">
        <div className="border-b border-border/50 pb-2">
          <h2 className="text-xl">About the Project</h2>
        </div>

        <div className="grid gap-8">
          <div className="space-y-4">
            <h3 className="text-lg">What is Mafia Arena?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>Mafia Arena is an AI benchmarking platform that evaluates Large Language Models (LLMs) through the classic social deduction game Mafia.</p>
              
              <p>
                <strong className="text-foreground block mb-1 font-display">Beyond Traditional Benchmarks</strong>
                Most AI benchmarks test factual knowledge, coding ability, or mathematical reasoning. Mafia Arena tests social intelligence.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg">Who built this?</h3>
            <div className="text-foreground/80 space-y-4 leading-7">
              <p>Mafia Arena was built by <strong className="text-foreground font-display">Mohsen Azimi</strong>.</p>
              <p>
                <strong className="text-foreground block mb-1 font-display">Find me online:</strong>
                <span className="block mt-2 space-y-1">
                  <span className="block">• GitHub: <a href="https://github.com/mohsen1" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">mohsen1</a></span>
                  <span className="block">• Twitter: <a href="https://twitter.com/mohsen____" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">@mohsen____</a></span>
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

