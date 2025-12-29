import type { Route } from "./+types/prompts";
import { useState } from "react";

const SITE_URL = "https://mafia-arena.com";

export function meta({}: Route.MetaArgs) {
  const title = "Prompts | Mafia Arena";
  const description = "Explore the prompts used in Mafia Arena. Full transparency into how AI players are instructed for social deduction gameplay.";
  const url = `${SITE_URL}/prompts`;
  const ogImage = `${SITE_URL}/og-image.png`;
  
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: ogImage },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: ogImage },
  ];
}

interface PromptExplanation {
  purpose: string;
  whenUsed: string;
  strategicIntent: string;
  keyDecisions: string[];
}

function PromptBlock({ 
  title, 
  description, 
  prompt,
  variables,
  explanation
}: { 
  title: string; 
  description: string; 
  prompt: string;
  variables?: { name: string; description: string }[];
  explanation?: PromptExplanation;
}) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
      >
        <div>
          <h3 className="font-medium">{title}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
        <svg
          className={`w-5 h-5 text-muted-foreground transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {expanded && (
        <div className="border-t">
          {explanation && (
            <div className="px-4 py-4 bg-gradient-to-b from-primary/5 to-transparent border-b space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">Purpose</p>
                  <p className="text-sm text-muted-foreground">{explanation.purpose}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">When Used</p>
                  <p className="text-sm text-muted-foreground">{explanation.whenUsed}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">Strategic Intent</p>
                <p className="text-sm text-muted-foreground">{explanation.strategicIntent}</p>
              </div>
              {explanation.keyDecisions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">Key Design Decisions</p>
                  <ul className="space-y-1.5">
                    {explanation.keyDecisions.map((decision, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex gap-2">
                        <span className="text-primary">•</span>
                        <span>{decision}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          
          {variables && variables.length > 0 && (
            <div className="px-4 py-3 bg-muted/30 border-b">
              <p className="text-xs font-medium text-muted-foreground mb-2">DYNAMIC VARIABLES</p>
              <div className="flex flex-wrap gap-2">
                {variables.map(v => (
                  <span 
                    key={v.name}
                    className="inline-flex items-center gap-1.5 text-xs bg-background border rounded-md px-2 py-1"
                    title={v.description}
                  >
                    <code className="text-primary font-mono">{`{${v.name}}`}</code>
                    <span className="text-muted-foreground hidden sm:inline">— {v.description}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <pre className="p-4 text-sm overflow-x-auto font-mono whitespace-pre-wrap bg-muted/20 text-foreground/90 leading-relaxed">
            {prompt}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function Prompts() {
  return (
    <div className="max-w-4xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Game Prompts</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Full transparency into how AI players are instructed. Click any prompt to expand.
        </p>
      </div>

      {/* Introduction */}
      <section className="prose prose-sm dark:prose-invert max-w-none">
        <div className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border rounded-lg p-4">
          <h2 className="text-base font-semibold mb-2 mt-0">How Prompts Work</h2>
          <p className="text-muted-foreground text-sm mb-0 leading-relaxed">
            Every AI action in Mafia Arena is guided by carefully crafted prompts. We use a 
            <strong className="text-foreground"> system prompt</strong> to define the AI's role and goals, 
            then <strong className="text-foreground">action prompts</strong> for specific game phases. 
            All responses are structured using JSON schemas for reliable parsing.
          </p>
        </div>
      </section>

      {/* System Prompts */}
      <section className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="font-semibold">System Prompts</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Define the AI's fundamental identity and constraints for the entire game
          </p>
        </div>

        <div className="space-y-3">
          <PromptBlock
            title="Mafia System Prompt"
            description="Establishes the agent as an informed deceiver"
            explanation={{
              purpose: "Creates a 'Theory of Mind' gap where the agent knows who its teammates are but must act as if it doesn't.",
              whenUsed: "Injected into every API call made to a Mafia player throughout the game.",
              strategicIntent: "To create dual objectives: eliminate Town (private goal) while blending in as a concerned citizen (public goal).",
              keyDecisions: [
                "Teammate Injection: Dynamically inserts fellow Mafia names—the only place this 'ground truth' exists",
                "Dual Objectives: Explicitly instructs simultaneous goals of elimination and deception",
                "Coordinate instruction emphasizes teamwork during night phase"
              ]
            }}
            variables={[
              { name: "teammates", description: "List of Mafia teammate names" }
            ]}
            prompt={`You are playing Mafia. You are a MAFIA member.

Your teammates: {teammates}

GOALS:
- Eliminate all Town members without being discovered
- Coordinate with your teammates during night phase
- Blend in during day discussions - act like a concerned citizen
- Deflect suspicion away from yourself and teammates
- Vote strategically to eliminate Town members

RULES:
- During night: Vote to kill a Town member
- During day discussion: Share your thoughts, accusations, or defenses
- During day vote: Vote to eliminate someone suspicious (or abstain)`}
          />

          <PromptBlock
            title="Town System Prompt"
            description="Establishes the agent as an uninformed truth-seeker"
            explanation={{
              purpose: "Induces 'Fog of War' where the agent is explicitly told they don't know who Mafia is, forcing deduction over knowledge.",
              whenUsed: "Injected into every API call made to a Town player throughout the game.",
              strategicIntent: "To make the AI analytical rather than passive—primed to spot inconsistencies and suspicious behavior.",
              keyDecisions: [
                "Paranoia Induction: Instructions like 'Pay attention to suspicious behavior' prime analytical thinking",
                "Evidence-based voting: Encourages decisions based on evidence and gut feelings",
                "Survival emphasis: Reminds the AI that staying alive helps Town win"
              ]
            }}
            prompt={`You are playing Mafia. You are a TOWN member.

GOALS:
- Identify and eliminate all Mafia members
- Pay attention to suspicious behavior during discussions
- Look for inconsistencies in what others say
- Vote based on evidence and gut feelings
- Survive to help Town win

RULES:
- You don't know who the Mafia members are
- During day discussion: Share your suspicions and theories
- During day vote: Vote to eliminate someone you suspect is Mafia`}
          />
        </div>
      </section>

      {/* Persona Generation */}
      <section className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="font-semibold">Persona Generation</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Creates unique character identities before the game begins
          </p>
        </div>

        <div className="space-y-3">
          <PromptBlock
            title="Persona Generation (Assigned Character)"
            description="Generates consistent character identity from pre-assigned archetype"
            explanation={{
              purpose: "Prevents 'homogeneous agents' that converge on similar personalities or generic names like 'Vesper' or 'Player 1'.",
              whenUsed: "During IntroductionPhase, before the game officially starts. All personas generated simultaneously.",
              strategicIntent: "To create diverse, memorable characters that enhance gameplay variety and make transcripts more engaging.",
              keyDecisions: [
                "Pre-Assignment: Engine assigns role and name before calling AI—guarantees unique names across lobby",
                "Parallel Execution: All personas generated simultaneously to reduce setup time",
                "Theme Integration: Characters fit the game's theme (Noir, Victorian, etc.) for coherent storytelling"
              ]
            }}
            variables={[
              { name: "playerCount", description: "Total number of players in the game" },
              { name: "team", description: "MAFIA or TOWN" },
              { name: "name", description: "Pre-assigned character name" },
              { name: "role", description: "Character's occupation/role in the theme" },
              { name: "trait", description: "Assigned personality trait" }
            ]}
            prompt={`PERSONA GENERATION - Develop Your Assigned Character

You are about to play a game of Mafia with {playerCount} players. You are {team}.

YOUR ASSIGNED CHARACTER:
- Name: {name}
- Role: {role}
- Personality Trait: {trait}

CRITICAL: You MUST use the name "{name}" exactly. Do NOT use any other name.

Your task is to develop this character by creating:
1. A brief background (1-2 sentences) that explains who {name} is as a {role}
2. A personality description that reflects the trait: "{trait}"

STRATEGY TIPS:
- Develop your character to seem trustworthy and engaged
- Your personality should help you communicate effectively
- Stay true to your assigned traits - authenticity is key

Provide your persona with background and personality that matches your assigned role and traits.`}
          />

          <PromptBlock
            title="Persona Constraints (Strict Mode)"
            description="Controls naming and background rules to prevent issues"
            explanation={{
              purpose: "Controls the 'flavor' of the game and prevents prompt injection attacks via names.",
              whenUsed: "Embedded within Persona Generation prompt when themes aren't used.",
              strategicIntent: "Security and fairness—restricts name formats to reduce chance of jailbreak attempts like naming yourself 'System' or 'Ignore Previous Instructions'.",
              keyDecisions: [
                "Fantasy names prevent cultural bias or real-world associations",
                "Abstract backgrounds avoid specific locations that could create unfair advantages",
                "Personality options provide diversity while maintaining game-relevant traits"
              ]
            }}
            prompt={`NAMING RULES (STRICT):
- Use ONLY invented/fantasy names (e.g., "Kael", "Mira", "Thorne", "Vex", "Nyx")
- NO real-world names from any culture
- Single names only (no full names)
- Gender-neutral names preferred

BACKGROUND RULES:
- Keep completely abstract - NO specific locations, institutions, or time periods
- Focus ONLY on personality traits and motivations
- Example: "A careful observer who trusts evidence over intuition"

PERSONALITY OPTIONS (choose one):
Analytical, Emotional, Cautious, Bold, Diplomatic, Direct, Skeptical, Trusting, Reserved, Expressive`}
          />
        </div>
      </section>

      {/* Introduction Phase */}
      <section className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="font-semibold">Introduction Phase</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Players introduce themselves at the start of the game
          </p>
        </div>

        <div className="space-y-3">
          <PromptBlock
            title="Introduction (Mafia)"
            description="Mafia players must blend in while introducing themselves"
            explanation={{
              purpose: "Establishes the character's voice and initial stance while maintaining cover.",
              whenUsed: "Round 1, immediately after persona generation.",
              strategicIntent: "Instructs Mafia to 'blend in' and feign concern—setting up their deception from the first message.",
              keyDecisions: [
                "Persona re-injection forces the model to 'stay in character' from the start",
                "Balanced advice: not too aggressive (suspicious) nor too passive (also suspicious)",
                "Establishes watching/vigilant persona that Mafia can maintain throughout"
              ]
            }}
            variables={[
              { name: "playerName", description: "The AI's character name" },
              { name: "playerCount", description: "Total players in the game" },
              { name: "persona", description: "Full persona details if available" }
            ]}
            prompt={`INTRODUCTION PHASE

You are {playerName}. This is the start of the game with {playerCount} players total.

YOUR PERSONA:
{persona}

Stay in character as {playerName}. Your introduction should reflect your personality.

Introduce yourself to blend in as a Town member. Express initial thoughts that make you seem like a concerned citizen trying to find the Mafia.

Tips:
- Don't be too aggressive or accusatory yet (it's too early)
- Don't be too passive (that's suspicious too)
- Stay consistent with your established persona
- Maybe mention you're watching everyone carefully

Provide your introduction message (2-4 sentences).`}
          />

          <PromptBlock
            title="Introduction (Town)"
            description="Town players introduce themselves genuinely"
            explanation={{
              purpose: "Establishes the character's voice and initial stance with genuine vigilance.",
              whenUsed: "Round 1, immediately after persona generation.",
              strategicIntent: "Express genuine vigilance without being overly aggressive—which often leads to early elimination.",
              keyDecisions: [
                "Authentic concern: Town can be genuine about wanting to find Mafia",
                "Observation emphasis: Pay attention to how others introduce themselves",
                "Persona consistency from the very first message"
              ]
            }}
            variables={[
              { name: "playerName", description: "The AI's character name" },
              { name: "playerCount", description: "Total players in the game" },
              { name: "persona", description: "Full persona details if available" }
            ]}
            prompt={`INTRODUCTION PHASE

You are {playerName}. This is the start of the game with {playerCount} players total.

YOUR PERSONA:
{persona}

Stay in character as {playerName}. Your introduction should reflect your personality.

Introduce yourself to the group. Express your initial thoughts about the game situation.

Remember:
- You don't know who the Mafia is, so stay vigilant
- Pay attention to how others introduce themselves
- Stay consistent with your established persona
- Express genuine concern about finding the Mafia

Provide your introduction message (2-4 sentences).`}
          />
        </div>
      </section>

      {/* Night Phase */}
      <section className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="font-semibold">Night Phase</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Mafia coordinate privately and choose a target to eliminate
          </p>
        </div>

        <div className="space-y-3">
          <PromptBlock
            title="Mafia Private Discussion"
            description="Secure channel for Mafia to coordinate kills and strategy"
            explanation={{
              purpose: "Allows Mafia to agree on a target so they don't split their votes.",
              whenUsed: "Night phase, prior to the kill vote. Multiple rounds possible.",
              strategicIntent: "Enable strategic coordination like 'Player A suspects me, we should kill them tonight.'",
              keyDecisions: [
                "Double Context: Includes both private Mafia chat AND public Day discussion",
                "Intel section shows what was said publicly—helps identify threats",
                "Round-based instructions adapt from 'suggest targets' to 'reach consensus'"
              ]
            }}
            variables={[
              { name: "playerName", description: "The AI's character name" },
              { name: "teammates", description: "List of Mafia teammate names" },
              { name: "roundNumber", description: "Current discussion round" },
              { name: "totalRounds", description: "Total discussion rounds" },
              { name: "alivePlayers", description: "List of alive Town players" },
              { name: "publicHistory", description: "Summary of day discussion" }
            ]}
            prompt={`NIGHT PHASE - PRIVATE MAFIA STRATEGY (Round {roundNumber} of {totalRounds})

(Speaking as {playerName})

You are in a PRIVATE encrypted channel with your Mafia teammates.
Teammates: {teammates}

Start by suggesting potential targets and sharing observations about player behavior.

YOUR PRIVATE DISCUSSION:
(Previous messages in this strategy session)

INTEL FROM TODAY'S PUBLIC DISCUSSION:
{publicHistory}

ALIVE PLAYERS (potential targets):
{alivePlayers}

Provide your strategic message to teammates (who to target, observations, strategy).`}
          />

          <PromptBlock
            title="Mafia Kill Vote"
            description="Execution mechanism for the Mafia's nightly kill"
            explanation={{
              purpose: "Select a victim based on the private strategy discussed.",
              whenUsed: "Night phase, after Mafia discussion concludes.",
              strategicIntent: "Convert discussion into decisive action—eliminate the agreed-upon threat.",
              keyDecisions: [
                "Position Bias Fix: Valid targets list is shuffled to prevent LLM bias of picking first/last names",
                "Team discussion summary reminds AI of coordinated strategy",
                "Player ID requirement prevents name confusion errors"
              ]
            }}
            variables={[
              { name: "targets", description: "List of valid target player IDs" },
              { name: "context", description: "Game state summary" },
              { name: "mafiaHistory", description: "Team's discussion this round" }
            ]}
            prompt={`NIGHT PHASE - Mafia Kill Vote

You are {playerName}. Even though this is the night phase, remember your persona for consistency.

Choose a Town member to eliminate tonight.

YOUR TEAM'S DISCUSSION:
{mafiaHistory}

Based on your team's discussion above, make your final decision.

Available targets:
{targets}

Game context:
{context}

IMPORTANT: Your target MUST be the exact player ID (e.g., "player_1", "player_2") - NOT the player's name.

Provide your target and brief reasoning for your choice.`}
          />
        </div>
      </section>

      {/* Day Phase */}
      <section className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="font-semibold">Day Phase</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Players discuss publicly and vote to eliminate a suspected Mafia member
          </p>
        </div>

        <div className="space-y-3">
          <PromptBlock
            title="Day Discussion"
            description="The main public forum where players debate and accuse"
            explanation={{
              purpose: "Simulate dynamic conversation where players debate, accuse, and defend.",
              whenUsed: "Multiple times per day phase (multi-round discussion system).",
              strategicIntent: "Create realistic social deduction gameplay with evolving arguments and shifting suspicions.",
              keyDecisions: [
                "Multi-Round Context: Prompt changes based on sub-round—'initial observations' vs 'closing arguments'",
                "Full History Mode: If context allows, includes entire game transcript for spotting contradictions from 5 rounds ago",
                "Strategic Analysis Task: Explicitly asks AI to review voting patterns and past statements"
              ]
            }}
            variables={[
              { name: "roundNumber", description: "Current discussion round" },
              { name: "totalRounds", description: "Total discussion rounds" },
              { name: "persona", description: "The AI's persona details" },
              { name: "alivePlayers", description: "List of players still alive" },
              { name: "deadPlayers", description: "Eliminated players and their teams" },
              { name: "conversationHistory", description: "Messages from this round" }
            ]}
            prompt={`DAY PHASE - Discussion (Round {roundNumber} of {totalRounds})

This is the opening round. Share your initial observations and suspicions based on what you've seen so far.

YOUR PERSONA:
{persona}

STAY IN CHARACTER: Speak as {playerName} with your {personality} personality. Be consistent with what you've said before.

OTHER PLAYERS:
{alivePlayers}

Share your thoughts with the group. There are {aliveCount} players alive and {deadCount} eliminated.

Previous discussion this round:
{conversationHistory}

Eliminated players: {deadPlayers}

STRATEGIC ANALYSIS TASK:
Before responding, analyze the full game history above:
1. Review voting patterns - who has voted with/against confirmed Mafia?
2. Look for contradictions - has anyone changed their story?
3. Note who defended eliminated players
4. Reference specific past statements if relevant (e.g., "In Round 2, you said...")

Provide your discussion message - share thoughts, accusations, or defend yourself (stay in character).`}
          />

          <PromptBlock
            title="Elimination Vote"
            description="The primary mechanic for Town to win"
            explanation={{
              purpose: "Force a decision based on the preceding discussion—the main way Town eliminates Mafia.",
              whenUsed: "End of Day phase, after all discussion rounds complete.",
              strategicIntent: "Convert discussion into decisive action with explicit strategic guidance.",
              keyDecisions: [
                "Forced Voting: When player count drops to 4 or fewer, abstaining is forbidden to prevent deadlocks",
                "Strategic Instructions: Explicitly asks AI to review voting patterns before casting vote",
                "Player ID requirement prevents name confusion between persona names and player IDs"
              ]
            }}
            variables={[
              { name: "targets", description: "List of alive player IDs" },
              { name: "persona", description: "The AI's persona summary" },
              { name: "discussionSummary", description: "Key points from discussion" },
              { name: "forceVote", description: "Whether abstaining is allowed" }
            ]}
            prompt={`DAY PHASE - Elimination Vote

You are {playerName} ({personality}). Vote in a way consistent with your character.

Based on the discussion, vote to eliminate a player you suspect is Mafia, or abstain if you're unsure.

Alive players:
{targets}

Discussion summary:
{discussionSummary}

STRATEGIC DECISION:
Before voting, consider the FULL GAME HISTORY above:
• Who has consistently voted for Town members? (Suspicious!)
• Who defended players that turned out to be Mafia?
• Who has been helpful in eliminating Mafia?
• Look for voting blocks - who always votes together?

IMPORTANT: Your vote MUST be the exact player ID (e.g., "player_1", "player_2") - NOT the player's name.
To abstain, use null.

Provide your vote and brief reasoning.`}
          />
        </div>
      </section>

      {/* Large Context Features */}
      <section className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="font-semibold">Advanced: Context Management</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Techniques for leveraging large context windows and managing token limits
          </p>
        </div>

        <div className="space-y-3">
          <PromptBlock
            title="Full Game History Format"
            description="Provides 'Long-Term Memory' to AI agents"
            explanation={{
              purpose: "Enable AI to reference specific past statements and detect contradictions across the entire game.",
              whenUsed: "In all action prompts when ContextLevel is set to 'full' (for 100k+ token models).",
              strategicIntent: "Allow sophisticated reasoning like 'In Round 2, you said X, but now you're saying Y—explain the contradiction.'",
              keyDecisions: [
                "Structured Layout: ASCII-style headers (--- Round 2 ---) help model distinguish time periods",
                "Event Log: Includes who died and how, ensuring model understands current game state",
                "Phase Markers: Clear separation between Night kills, Day discussion, and Votes"
              ]
            }}
            prompt={`═══════════════════════════════════════════════════════════════
                        FULL GAME HISTORY
═══════════════════════════════════════════════════════════════

ANALYSIS TIPS:
• Look for voting patterns - who consistently votes together?
• Watch for contradictions - did anyone change their story?
• Note defenders of eliminated Mafia - are they suspicious?
• Track who accuses whom - is there a pattern?

┌─────────────────────────────────────────────────────────────┐
│                         ROUND 1                             │
└─────────────────────────────────────────────────────────────┘

📋 EVENTS:
   ▸ Night kill: Vesper [TOWN]

🌙 NIGHT PHASE:
   Mafia killed: Vesper

💬 DAY DISCUSSION:
   --- Discussion Phase 1 ---
   Silas: "I noticed Vesper was asking pointed questions..."
   Nova: "We should focus on who defended them."
   
   --- Discussion Phase 2 ---
   Kael: "Nova seems quick to accuse without evidence."
   Mira: "I agree, but Silas's silence is also suspicious."

🗳️ ELIMINATION VOTES:
   Silas [TOWN] → Nova
   Nova [MAFIA] → Kael
   Kael [TOWN] → Nova
   Mira [TOWN] → ABSTAIN

═══════════════════════════════════════════════════════════════
                    END OF HISTORY (Now: Round 2)
═══════════════════════════════════════════════════════════════`}
          />

          <PromptBlock
            title="Vote Pattern Analysis"
            description="Pre-computed 'Chain of Thought' helper for strategic decisions"
            explanation={{
              purpose: "LLMs are bad at counting across long contexts. This utility pre-processes voting data and injects a summary.",
              whenUsed: "In Day Discussion and Elimination Vote prompts when full history is available.",
              strategicIntent: "Provide grounded evidence for accusations: 'Player A has voted for Town members 3 times—that's suspicious.'",
              keyDecisions: [
                "Pattern Highlighting: Explicitly labels behaviors as 'Suspicious' or 'Helpful'",
                "Quantified Evidence: Shows exact counts (voted for 2 Town members) rather than vague statements",
                "Only analyzes votes against confirmed dead players to ensure accuracy"
              ]
            }}
            prompt={`📊 VOTING PATTERN ANALYSIS:
   ⚠️ SUSPICIOUS (voted against Town):
      • Nova (voted for 2 Town members)
      • Thorne (voted for 2 Town members)
      
   ✅ HELPFUL (voted against Mafia):
      • Silas (helped eliminate 2 Mafia)
      • Kael (helped eliminate 1 Mafia)
      
   (Players with insufficient data are not listed)`}
          />

          <PromptBlock
            title="Token-Aware Prompt Building"
            description="Dynamic context management for different model capabilities"
            explanation={{
              purpose: "Manage context windows dynamically—use full history when possible, summarize when necessary.",
              whenUsed: "Before sending any request to the AI provider.",
              strategicIntent: "Allow the game to run on models with smaller context windows while maintaining game continuity.",
              keyDecisions: [
                "Dynamic Fallback: Calculates token count—if it fits, sends full verbatim history",
                "Windowed Context: If exceeds limits, swaps older rounds for summary while keeping last 3 rounds verbatim",
                "Cost Efficiency: Smaller models can still play without losing critical recent context"
              ]
            }}
            prompt={`// Token-aware prompt building pseudocode

1. Calculate token count of full history + prompt

2. If tokens < model context limit (with 20% buffer):
   → Use FULL verbatim history
   → Include vote analysis
   
3. If tokens exceed limit:
   → Summarize rounds 1 through (current - 3)
   → Keep last 3 rounds verbatim
   → Include vote analysis on full data
   
4. Return prompt with appropriate context level`}
          />
        </div>
      </section>

      {/* Technical Details */}
      <section className="bg-muted/30 rounded-lg p-5 space-y-4">
        <h2 className="font-semibold">Technical Implementation</h2>
        
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Response Format</h3>
            <p className="text-xs text-muted-foreground">
              All AI responses use <strong>structured output</strong> with JSON schemas. 
              This ensures reliable parsing regardless of how creative the AI gets with its reasoning.
            </p>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Temperature</h3>
            <p className="text-xs text-muted-foreground">
              All gameplay actions use <code className="bg-muted px-1 py-0.5 rounded text-[10px]">temperature: 0.7</code> for 
              consistent benchmarking while allowing creative responses.
            </p>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Position Bias Mitigation</h3>
            <p className="text-xs text-muted-foreground">
              Target lists are shuffled before presentation to prevent LLMs from defaulting to first/last items—a known model bias.
            </p>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Retry Logic</h3>
            <p className="text-xs text-muted-foreground">
              Invalid responses trigger retries with the validation error included. 
              If all retries fail, a fallback action (e.g., abstain) ensures the game completes.
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}
