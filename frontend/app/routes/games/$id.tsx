import { useState } from "react";
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/$id";
import { getApiUrl } from "~/lib/utils";
import {
  Trophy,
  Clock,
  Zap,
  Users,
  ChevronDown,
  ChevronRight,
  Moon,
  Sun,
  MessageSquare,
  Vote,
  Skull,
  Sparkles,
  ArrowLeft,
  Swords,
  MessagesSquare,
  Crosshair,
  Feather,
  Scroll,
  Building2,
} from "lucide-react";

export function meta({ data }: Route.MetaArgs) {
  const game = data?.game;
  return [{ title: game ? `Game ${game.id.slice(-8)} | Mafia Arena` : "Game Not Found | Mafia Arena" }];
}

interface GameDetail {
  id: string;
  winner: string | null;
  rounds: number;
  duration_ms: number;
  total_tokens: number;
  created_at: number;
  persona_theme?: string;
  cost_usd?: number;
}

interface TranscriptEvent {
  type: string;
  phase?: string;
  round?: number;
  playerId?: string;
  playerName?: string;
  team?: string;
  modelId?: string;
  response?: { raw?: string };
  persona?: { name: string; background: string; personality: string };
  winner?: string;
  roundRangeSummarized?: [number, number];
  tokensSaved?: number;
}

interface PlayerInfo {
  playerId: string;
  personaName: string;
  team: "mafia" | "town";
  modelId: string;
  isAlive: boolean;
}

interface TranscriptData {
  events: TranscriptEvent[];
}

export async function loader({ params }: Route.LoaderArgs) {
  const apiUrl = getApiUrl();
  const id = params.id;

  try {
    const [gameRes, transcriptRes] = await Promise.all([
      fetch(`${apiUrl}/api/games/${id}`),
      fetch(`${apiUrl}/api/games/${id}/transcript`),
    ]);

    if (!gameRes.ok) {
      return { error: "Game not found", game: null as GameDetail | null, transcript: { events: [] } as TranscriptData };
    }

    const game = (await gameRes.json()) as GameDetail;
    const transcript: TranscriptData = transcriptRes.ok ? await transcriptRes.json() : { events: [] };

    return { game, transcript, error: null as string | null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to load game", game: null as GameDetail | null, transcript: { events: [] } as TranscriptData };
  }
}

function formatDuration(ms: number): string {
  if (!ms) return "—";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function getShortModelName(modelId: string): string {
  let name = modelId.split("/").pop() || modelId;
  if (name.includes(": ")) {
    name = name.split(": ").slice(1).join(": ");
  }
  return name.replace(/-\d{4}-\d{2}-\d{2}$/, "").replace(/@.*$/, "");
}

function formatDisplayModelName(name: string): string {
  return name
    .split("-")
    .map((part) => {
      if (part.match(/^\d/)) return part;
      if (part === "gpt" || part === "o1" || part === "o3") return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function parseResponse(raw: string): { type: string; content: any } {
  if (!raw) return { type: "raw", content: "" };
  try {
    const parsed = JSON.parse(raw);
    if (parsed.message) return { type: "message", content: parsed.message };
    if (parsed.vote !== undefined) return { type: "vote", content: parsed };
    if (parsed.action && parsed.target) return { type: "action", content: parsed };
    if (parsed.name && parsed.background) return { type: "persona", content: parsed };
    return { type: "raw", content: raw };
  } catch {
    return { type: "raw", content: raw?.replace(/^["']|["']$/g, "").trim() || "" };
  }
}

const THEME_CONFIG: Record<string, { label: string; iconType: string; classes: string }> = {
  noir: { label: "Noir", iconType: "feather", classes: "bg-zinc-500/10 border-zinc-500/20 text-zinc-700 dark:text-zinc-300" },
  victorian: { label: "Victorian", iconType: "scroll", classes: "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400" },
  modern: { label: "Modern", iconType: "building", classes: "bg-cyan-500/10 border-cyan-500/20 text-cyan-700 dark:text-cyan-400" },
  fantasy: { label: "Fantasy", iconType: "sparkles", classes: "bg-purple-500/10 border-purple-500/20 text-purple-700 dark:text-purple-400" },
};

const PHASE_CONFIG: Record<string, { label: string; iconType: string }> = {
  introduction: { label: "Intro", iconType: "message" },
  night: { label: "Night", iconType: "moon" },
  mafia_chat: { label: "Mafia", iconType: "swords" },
  day_discussion: { label: "Discussion", iconType: "sun" },
  day_vote: { label: "Vote", iconType: "vote" },
  system: { label: "System", iconType: "zap" },
};

function PhaseIcon({ type, size = 12 }: { type: string; size?: number }) {
  switch (type) {
    case "moon":
      return <Moon size={size} />;
    case "sun":
      return <Sun size={size} />;
    case "swords":
      return <Swords size={size} />;
    case "vote":
      return <Vote size={size} />;
    case "message":
      return <MessagesSquare size={size} />;
    case "zap":
      return <Zap size={size} />;
    default:
      return <MessageSquare size={size} />;
  }
}

function ThemeIcon({ type }: { type: string }) {
  switch (type) {
    case "feather":
      return <Feather size={10} />;
    case "scroll":
      return <Scroll size={10} />;
    case "building":
      return <Building2 size={10} />;
    case "sparkles":
      return <Sparkles size={10} />;
    default:
      return null;
  }
}

export default function GameDetail() {
  const { game, transcript, error } = useLoaderData<typeof loader>();
  const [openRounds, setOpenRounds] = useState<Set<number>>(new Set());

  if (error || !game) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Skull size={40} className="mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground text-sm">Game not found</p>
          <Link to="/games" className="text-xs font-medium hover:underline inline-flex items-center gap-1">
            <ArrowLeft size={12} /> Back to games
          </Link>
        </div>
      </div>
    );
  }

  const events: TranscriptEvent[] = transcript?.events || [];

  // Build player map
  const playerMap: Record<string, PlayerInfo> = {};
  const eliminatedPlayers = new Set<string>();

  for (const event of events) {
    if (event.type === "ai_call" && event.playerId && !playerMap[event.playerId]) {
      playerMap[event.playerId] = {
        playerId: event.playerId,
        personaName: event.playerName || event.playerId,
        team: (event.team as "mafia" | "town") || "town",
        modelId: event.modelId || "",
        isAlive: true,
      };
    }
    if (event.type === "persona_generation" && event.playerId && playerMap[event.playerId]) {
      playerMap[event.playerId].personaName = event.persona?.name || event.playerName || event.playerId;
    }
    if (event.type === "elimination" && event.playerId) {
      eliminatedPlayers.add(event.playerId);
      if (playerMap[event.playerId]) {
        playerMap[event.playerId].isAlive = false;
      }
    }
  }

  const players = Object.values(playerMap);
  const mafiaPlayers = players.filter((p) => p.team === "mafia");
  const townPlayers = players.filter((p) => p.team === "town");

  const mafiaModels = [...new Set(mafiaPlayers.map((p) => getShortModelName(p.modelId)))];
  const townModels = [...new Set(townPlayers.map((p) => getShortModelName(p.modelId)))];
  const mafiaDisplayName = mafiaModels.map(formatDisplayModelName).join(", ") || "AI";
  const townDisplayName = townModels.map(formatDisplayModelName).join(", ") || "AI";

  // Group events by round and phase
  const groupedEvents: Record<number, Record<string, TranscriptEvent[]>> = {};
  for (const event of events) {
    if (event.type === "persona_generation" || event.type === "game_end") continue;
    if (event.type === "summarization") {
      const round = event.round || 1;
      if (!groupedEvents[round]) groupedEvents[round] = {};
      if (!groupedEvents[round]["system"]) groupedEvents[round]["system"] = [];
      groupedEvents[round]["system"].push(event);
      continue;
    }
    if (!event.phase || event.phase === "other") continue;
    const round = event.round || 1;
    const phase = event.phase;
    if (!groupedEvents[round]) groupedEvents[round] = {};
    if (!groupedEvents[round][phase]) groupedEvents[round][phase] = [];
    groupedEvents[round][phase].push(event);
  }

  const gameEndEvent = events.find((e) => e.type === "game_end");
  const rounds = Object.keys(groupedEvents)
    .map(Number)
    .sort((a, b) => a - b);

  // Initialize last round as open
  if (rounds.length > 0 && openRounds.size === 0) {
    setOpenRounds(new Set([rounds[rounds.length - 1]]));
  }

  const toggleRound = (round: number) => {
    const newOpen = new Set(openRounds);
    if (newOpen.has(round)) {
      newOpen.delete(round);
    } else {
      newOpen.add(round);
    }
    setOpenRounds(newOpen);
  };

  const timestamp = game.created_at > 9999999999 ? game.created_at : game.created_at * 1000;
  const date = new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const theme = THEME_CONFIG[game.persona_theme || "noir"] || THEME_CONFIG.noir;

  const getPersonaName = (playerId: string) => playerMap[playerId]?.personaName || playerId;

  return (
    <div className="space-y-5 pb-8">
      {/* Back Link */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/games" className="hover:text-foreground inline-flex items-center gap-1 transition-colors">
          <ArrowLeft size={12} /> Games
        </Link>
        <span className="opacity-30">/</span>
        <code className="font-mono opacity-50">{game.id.slice(-12)}</code>
      </div>

      {/* Broadcast HUD Header */}
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
        {/* Status Bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                game.winner
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${game.winner ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`}></span>
              {game.winner ? "COMPLETED" : "RUNNING"}
            </div>

            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-medium ${theme.classes}`}>
              <ThemeIcon type={theme.iconType} />
              {theme.label}
            </div>
          </div>
          <div className="text-muted-foreground/60 text-[10px]">{date}</div>
        </div>

        {/* Main Matchup Display */}
        <div className="px-4 py-5 bg-gradient-to-b from-background to-muted/20">
          <div className="flex items-center justify-center gap-4 sm:gap-8">
            {/* Mafia Side */}
            <div className={`flex-1 text-right ${game.winner === "mafia" ? "" : "opacity-70"}`}>
              <div className="flex flex-col items-end gap-1">
                {game.winner === "mafia" && (
                  <div className="flex items-center gap-1.5 text-amber-500 text-[10px] font-bold uppercase tracking-wider">
                    <Trophy size={12} />
                    <span>Winner</span>
                  </div>
                )}
                <span className="text-rose-500 font-black text-lg sm:text-xl tracking-tight">MAFIA</span>
                <div className="font-mono text-sm sm:text-base font-semibold text-foreground/90 truncate max-w-[140px] sm:max-w-[200px]">
                  {mafiaDisplayName}
                </div>
              </div>
            </div>

            {/* VS Divider */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-border bg-muted/50 flex items-center justify-center">
                <Swords size={18} className="text-muted-foreground sm:w-5 sm:h-5" />
              </div>
              <span className="text-[10px] font-black text-muted-foreground/60 tracking-widest">VS</span>
            </div>

            {/* Town Side */}
            <div className={`flex-1 text-left ${game.winner === "town" ? "" : "opacity-70"}`}>
              <div className="flex flex-col items-start gap-1">
                {game.winner === "town" && (
                  <div className="flex items-center gap-1.5 text-amber-500 text-[10px] font-bold uppercase tracking-wider">
                    <Trophy size={12} />
                    <span>Winner</span>
                  </div>
                )}
                <span className="text-indigo-500 font-black text-lg sm:text-xl tracking-tight">TOWN</span>
                <div className="font-mono text-sm sm:text-base font-semibold text-foreground/90 truncate max-w-[140px] sm:max-w-[200px]">
                  {townDisplayName}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Telemetry Strip */}
        <div className="grid grid-cols-4 divide-x divide-border border-t bg-muted/20 text-[10px] uppercase tracking-wider">
          <div className="p-2.5 flex flex-col items-center justify-center gap-0.5">
            <span className="text-muted-foreground text-[9px]">Round</span>
            <span className="font-mono font-bold text-base leading-none">{game.rounds}</span>
          </div>
          <div className="p-2.5 flex flex-col items-center justify-center gap-0.5">
            <span className="text-muted-foreground text-[9px]">Duration</span>
            <span className="font-mono font-medium text-[11px]">{formatDuration(game.duration_ms || 0)}</span>
          </div>
          <div className="p-2.5 flex flex-col items-center justify-center gap-0.5">
            <span className="text-muted-foreground text-[9px]">Tokens</span>
            <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-500 text-[11px]">
              <Zap size={10} />
              <span className="font-mono font-bold tabular-nums">{(game.total_tokens || 0).toLocaleString()}</span>
            </div>
          </div>
          <div className="p-2.5 flex flex-col items-center justify-center gap-0.5">
            <span className="text-muted-foreground text-[9px]">Players</span>
            <span className="font-mono font-bold text-base leading-none">{players.length}</span>
          </div>
        </div>
      </div>

      {/* Players */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Users size={14} />
            Players
          </h2>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              Mafia ({mafiaPlayers.length})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              Town ({townPlayers.length})
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {players.map((player) => {
            const isMafia = player.team === "mafia";
            return (
              <div
                key={player.playerId}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs ${
                  isMafia ? "border-rose-500/20 bg-rose-500/5" : "border-indigo-500/20 bg-indigo-500/5"
                } ${!player.isAlive ? "opacity-40" : ""}`}
              >
                {!player.isAlive && <Skull size={10} className="text-muted-foreground" />}
                {player.team === game.winner && player.isAlive && <Trophy size={10} className="text-amber-500" />}
                <span className={`w-1.5 h-1.5 rounded-full ${isMafia ? "bg-rose-500" : "bg-indigo-500"}`}></span>
                <span className={`font-medium ${isMafia ? "text-rose-600 dark:text-rose-400" : "text-indigo-600 dark:text-indigo-400"}`}>
                  {player.personaName}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Game Transcript */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <MessageSquare size={14} />
          Transcript
        </h2>

        {rounds.length === 0 ? (
          <div className="border rounded-md p-6 text-center text-muted-foreground text-sm">No events recorded</div>
        ) : (
          <div className="space-y-1.5" id="transcript">
            {rounds.map((round) => {
              const isOpen = openRounds.has(round);
              return (
                <div key={round} className="border rounded-md overflow-hidden">
                  <button
                    onClick={() => toggleRound(round)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-xs text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-[10px] font-bold">
                        {round}
                      </span>
                      <span className="font-medium">Round {round}</span>
                      <div className="flex items-center gap-0.5 ml-1 text-muted-foreground">
                        {Object.keys(groupedEvents[round] || {}).map((phase) => {
                          const config = PHASE_CONFIG[phase] || { label: phase, iconType: "message" };
                          return <PhaseIcon key={phase} type={config.iconType} size={12} />;
                        })}
                      </div>
                    </div>
                    <ChevronDown size={14} className={`text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isOpen && (
                    <div className="divide-y divide-border/50">
                      {Object.entries(groupedEvents[round] || {}).map(([phase, phaseEvents]) => {
                        const phaseConfig = PHASE_CONFIG[phase] || { label: phase, iconType: "message" };
                        const isNightPhase = phase === "night" || phase === "mafia_chat";
                        return (
                          <div key={phase} className={`px-3 py-2 space-y-1.5 ${isNightPhase ? "bg-rose-500/3" : ""}`}>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <PhaseIcon type={phaseConfig.iconType} size={10} />
                              <span className="font-medium uppercase tracking-wide">{phaseConfig.label}</span>
                              <span className="opacity-50">·</span>
                              <span className="opacity-50">{phaseEvents.length}</span>
                            </div>

                            <div className="space-y-1">
                              {phaseEvents.map((event, idx) => {
                                const player = playerMap[event.playerId || ""];
                                const team = event.team || player?.team || "town";
                                const isMafia = team === "mafia";

                                if (event.type === "ai_call") {
                                  const parsed = parseResponse(event.response?.raw || "");
                                  if (parsed.type === "persona") return null;

                                  return (
                                    <div key={idx} className="py-1.5">
                                      <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isMafia ? "bg-rose-500" : "bg-indigo-500"}`}></span>
                                        <span className={`font-medium text-xs ${isMafia ? "text-rose-600 dark:text-rose-400" : "text-indigo-600 dark:text-indigo-400"}`}>
                                          {event.playerName}
                                        </span>
                                        <span className="text-[9px] text-muted-foreground/40">{event.modelId?.split("/").pop()}</span>
                                      </div>
                                      {parsed.type === "message" ? (
                                        <p className="text-xs text-foreground/90 leading-relaxed pl-3">{parsed.content}</p>
                                      ) : parsed.type === "vote" ? (
                                        <div className="text-xs pl-3">
                                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                                            <Vote size={10} />
                                            <span>Voted for</span>
                                            <span className={`font-semibold ${playerMap[parsed.content.vote]?.team === "mafia" ? "text-rose-500" : "text-indigo-500"}`}>
                                              {getPersonaName(parsed.content.vote)}
                                            </span>
                                          </span>
                                        </div>
                                      ) : parsed.type === "action" ? (
                                        <div className="text-xs pl-3">
                                          <span className="inline-flex items-center gap-1">
                                            <Crosshair size={10} className={parsed.content.action === "kill" ? "text-rose-500" : "text-muted-foreground"} />
                                            <span className="text-muted-foreground">{parsed.content.action}</span>
                                            <span className={`font-semibold ${playerMap[parsed.content.target]?.team === "mafia" ? "text-rose-500" : "text-indigo-500"}`}>
                                              {getPersonaName(parsed.content.target)}
                                            </span>
                                          </span>
                                        </div>
                                      ) : (
                                        <p className="text-xs text-foreground/90 leading-relaxed pl-3">{parsed.content}</p>
                                      )}
                                    </div>
                                  );
                                }

                                if (event.type === "elimination") {
                                  return (
                                    <div
                                      key={idx}
                                      className={`flex items-center gap-2 py-1.5 px-2 rounded text-xs ${
                                        event.team === "mafia" ? "bg-rose-500/10 border border-rose-500/20" : "bg-indigo-500/10 border border-indigo-500/20"
                                      }`}
                                    >
                                      <Skull size={12} className={event.team === "mafia" ? "text-rose-500" : "text-indigo-500"} />
                                      <span className={`font-medium ${event.team === "mafia" ? "text-rose-600 dark:text-rose-400" : "text-indigo-600 dark:text-indigo-400"}`}>
                                        {event.playerName || getPersonaName(event.playerId || "")}
                                      </span>
                                      <span className="text-muted-foreground">eliminated</span>
                                      <span
                                        className={`ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                          event.team === "mafia" ? "bg-rose-500/20 text-rose-600 dark:text-rose-400" : "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                                        }`}
                                      >
                                        {event.team}
                                      </span>
                                    </div>
                                  );
                                }

                                if (event.type === "summarization") {
                                  const [roundStart, roundEnd] = event.roundRangeSummarized || [1, 1];
                                  return (
                                    <div key={idx} className="flex items-center gap-2 py-1.5 px-2 rounded text-xs bg-amber-500/10 border border-amber-500/20">
                                      <Zap size={12} className="text-amber-500" />
                                      <span className="text-amber-600 dark:text-amber-400">
                                        Rounds {roundStart}-{roundEnd} summarized
                                      </span>
                                      <span className="text-muted-foreground text-[10px]">({event.tokensSaved?.toLocaleString() || 0} tokens saved)</span>
                                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">
                                        context optimization
                                      </span>
                                    </div>
                                  );
                                }

                                return null;
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Game End */}
            {gameEndEvent && (
              <div
                className={`text-center py-4 rounded-md border ${
                  gameEndEvent.winner === "mafia" ? "bg-rose-500/10 border-rose-500/30" : "bg-indigo-500/10 border-indigo-500/30"
                }`}
              >
                <Trophy size={20} className={`mx-auto mb-1 ${gameEndEvent.winner === "mafia" ? "text-rose-500" : "text-indigo-500"}`} />
                <div className={`text-sm font-bold ${gameEndEvent.winner === "mafia" ? "text-rose-500" : "text-indigo-500"}`}>
                  {gameEndEvent.winner === "mafia" ? "Mafia" : "Town"} Wins
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Footer Stats */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t pt-3">
        <span>{game.total_tokens?.toLocaleString() || 0} tokens</span>
        <span>{events.filter((e) => e.type !== "persona_generation").length} events</span>
      </div>
    </div>
  );
}
