import { useState, useEffect, useRef } from "react";
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/$id";
import { getApiUrl } from "~/lib/utils";
import {
  Trophy,
  ChevronDown,
  Moon,
  Sun,
  MessageSquare,
  Vote,
  Skull,
  ArrowLeft,
  Swords,
  MessagesSquare,
  Crosshair,
  Zap,
} from "lucide-react";
import { GameHeader, GameLayout, TranscriptContainer } from "~/components/GameHeader";

export function meta({ data }: Route.MetaArgs) {
  const game = data?.game;
  return [{ title: game ? `Game ${game.id.slice(-8)} | Mafia Arena` : "Game Not Found | Mafia Arena" }];
}

interface Participant {
  model_id: string;
  model_name: string;
  team: 'mafia' | 'town';
  player_count: number;
  won: boolean;
}

interface GameDetail {
  id: string;
  winner: string | null;
  rounds: number;
  durationMs: number;
  totalTokens: number;
  createdAt: number;
  personaTheme?: string;
  costUsd?: number;
  status?: string;
  participants?: Participant[];
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
      return { error: "Game not found", game: null as GameDetail | null, transcript: { events: [] } as TranscriptData, transcriptError: null as string | null };
    }

    const game = (await gameRes.json()) as GameDetail;
    
    let transcript: TranscriptData = { events: [] };
    let transcriptError: string | null = null;
    
    if (transcriptRes.ok) {
      transcript = await transcriptRes.json();
    } else if (transcriptRes.status === 404) {
      transcriptError = "Transcript not available for this game";
    } else {
      transcriptError = `Failed to load transcript (${transcriptRes.status})`;
    }

    return { game, transcript, error: null as string | null, transcriptError };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to load game", game: null as GameDetail | null, transcript: { events: [] } as TranscriptData, transcriptError: null as string | null };
  }
}

function formatDuration(ms: number): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
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

const PHASE_CONFIG: Record<string, { label: string; iconType: string }> = {
  introduction: { label: "Intro", iconType: "message" },
  night: { label: "Night", iconType: "moon" },
  mafia_chat: { label: "Mafia", iconType: "swords" },
  day_discussion: { label: "Discussion", iconType: "sun" },
  day_vote: { label: "Vote", iconType: "vote" },
  system: { label: "System", iconType: "zap" },
};

function PhaseIcon({ type, size = 10 }: { type: string; size?: number }) {
  switch (type) {
    case "moon": return <Moon size={size} />;
    case "sun": return <Sun size={size} />;
    case "swords": return <Swords size={size} />;
    case "vote": return <Vote size={size} />;
    case "message": return <MessagesSquare size={size} />;
    case "zap": return <Zap size={size} />;
    default: return <MessageSquare size={size} />;
  }
}

export default function GameDetail() {
  const { game, transcript, error, transcriptError } = useLoaderData<typeof loader>();
  const [openRounds, setOpenRounds] = useState<Set<number>>(new Set());
  const transcriptRef = useRef<HTMLDivElement>(null);

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

  // Use participants from game detail as fallback when transcript is missing
  let mafiaDisplayName = "AI";
  let townDisplayName = "AI";
  
  if (mafiaPlayers.length > 0 || townPlayers.length > 0) {
    const mafiaModels = [...new Set(mafiaPlayers.map((p) => getShortModelName(p.modelId)))];
    const townModels = [...new Set(townPlayers.map((p) => getShortModelName(p.modelId)))];
    mafiaDisplayName = mafiaModels.map(formatDisplayModelName).join(", ") || "AI";
    townDisplayName = townModels.map(formatDisplayModelName).join(", ") || "AI";
  } else if (game.participants && game.participants.length > 0) {
    const mafiaParticipants = game.participants.filter(p => p.team === 'mafia');
    const townParticipants = game.participants.filter(p => p.team === 'town');
    mafiaDisplayName = [...new Set(mafiaParticipants.map(p => p.model_name))].join(", ") || "AI";
    townDisplayName = [...new Set(townParticipants.map(p => p.model_name))].join(", ") || "AI";
  }

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
  const rounds = Object.keys(groupedEvents).map(Number).sort((a, b) => a - b);

  // Initialize last round as open
  useEffect(() => {
    if (rounds.length > 0 && openRounds.size === 0) {
      setOpenRounds(new Set([rounds[rounds.length - 1]]));
    }
  }, [rounds.length]);

  // Scroll to bottom on mount
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, []);

  const toggleRound = (round: number) => {
    const newOpen = new Set(openRounds);
    if (newOpen.has(round)) {
      newOpen.delete(round);
    } else {
      newOpen.add(round);
    }
    setOpenRounds(newOpen);
  };

  const getPersonaName = (playerId: string) => playerMap[playerId]?.personaName || playerId;

  // Get current phase from last event
  const lastPhaseEvent = [...events].reverse().find(e => e.phase && e.phase !== 'other');
  const currentPhase = lastPhaseEvent?.phase || 'completed';
  const phaseConfig = PHASE_CONFIG[currentPhase] || { label: 'Completed', iconType: 'message' };

  return (
    <GameLayout>
      <GameHeader
        status={game.winner ? 'completed' : 'running'}
        theme={game.personaTheme || 'noir'}
        mafiaModels={mafiaDisplayName}
        townModels={townDisplayName}
        winner={game.winner as 'mafia' | 'town' | null}
        round={game.rounds}
        phase={phaseConfig.label}
        duration={formatDuration(game.durationMs || 0)}
        tokens={game.totalTokens || 0}
        connectionStatus={
          <div className="flex items-center gap-2">
            {players.map((player) => {
              const isMafia = player.team === "mafia";
              return (
                <div
                  key={player.playerId}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] ${
                    isMafia ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                  } ${!player.isAlive ? "opacity-40" : ""}`}
                >
                  {!player.isAlive && <Skull size={8} />}
                  {player.team === game.winner && player.isAlive && <Trophy size={8} className="text-amber-500" />}
                  <span className={`w-1 h-1 rounded-full ${isMafia ? "bg-rose-500" : "bg-indigo-500"}`}></span>
                  <span className="font-medium truncate max-w-[60px]">{player.personaName}</span>
                </div>
              );
            })}
          </div>
        }
      />

      <div className="flex-1 min-h-0 relative px-4 pb-4">
        <div ref={transcriptRef} className="absolute inset-x-4 top-0 bottom-4 rounded-lg text-xs overflow-y-auto bg-muted/30">
          {transcriptError ? (
            <div className="px-3 py-8 text-center text-muted-foreground">{transcriptError}</div>
          ) : rounds.length === 0 ? (
            <div className="px-3 py-8 text-center text-muted-foreground">No events recorded</div>
          ) : (
            <div className="space-y-0">
              {rounds.map((round) => {
                const isOpen = openRounds.has(round);
                return (
                  <details key={round} open={isOpen} className="group">
                    <summary
                      onClick={(e) => { e.preventDefault(); toggleRound(round); }}
                      className="flex items-center justify-between px-2 py-1.5 bg-muted cursor-pointer hover:bg-muted/80 transition-colors sticky top-0 z-10"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs">Round {round}</span>
                        <div className="flex items-center gap-0.5 text-muted-foreground">
                          {Object.keys(groupedEvents[round] || {}).map((phase) => {
                            const config = PHASE_CONFIG[phase] || { label: phase, iconType: "message" };
                            return <span key={phase} className="inline-flex items-center"><PhaseIcon type={config.iconType} size={10} /></span>;
                          })}
                        </div>
                      </div>
                      <ChevronDown size={14} className={`text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                    </summary>

                    {isOpen && (
                      <div>
                        {Object.entries(groupedEvents[round] || {}).map(([phase, phaseEvents]) => {
                          const config = PHASE_CONFIG[phase] || { label: phase, iconType: "message" };
                          const isNightPhase = phase === "night" || phase === "mafia_chat";
                          return (
                            <div key={phase} className={`px-2 py-1.5 space-y-1 ${isNightPhase ? "bg-rose-500/5" : ""}`}>
                              <div className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
                                <span className="inline-flex items-center"><PhaseIcon type={config.iconType} size={10} /></span>
                                <span className="font-medium uppercase tracking-wide">{config.label}</span>
                                <span className="opacity-40">·</span>
                                <span className="opacity-40">{phaseEvents.length}</span>
                              </div>

                              <div className="space-y-0.5">
                                {phaseEvents.map((event, idx) => {
                                  const player = playerMap[event.playerId || ""];
                                  const team = event.team || player?.team || "town";
                                  const isMafia = team === "mafia";

                                  if (event.type === "ai_call") {
                                    const parsed = parseResponse(event.response?.raw || "");
                                    if (parsed.type === "persona") return null;

                                    let content;
                                    if (parsed.type === "message") {
                                      content = <p className="text-[11px] text-foreground/90 leading-snug">{parsed.content}</p>;
                                    } else if (parsed.type === "vote") {
                                      const targetTeam = playerMap[parsed.content.vote]?.team || 'town';
                                      content = (
                                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                          <Vote size={10} />
                                          <span className={`font-medium ${targetTeam === 'mafia' ? 'text-rose-500' : 'text-indigo-500'}`}>
                                            {getPersonaName(parsed.content.vote)}
                                          </span>
                                        </span>
                                      );
                                    } else if (parsed.type === "action") {
                                      const targetTeam = playerMap[parsed.content.target]?.team || 'town';
                                      content = (
                                        <span className="inline-flex items-center gap-1 text-[10px]">
                                          <Crosshair size={10} className={parsed.content.action === 'kill' ? 'text-rose-500' : 'text-muted-foreground'} />
                                          <span className={`font-medium ${targetTeam === 'mafia' ? 'text-rose-500' : 'text-indigo-500'}`}>
                                            {getPersonaName(parsed.content.target)}
                                          </span>
                                        </span>
                                      );
                                    } else {
                                      content = <p className="text-[11px] text-foreground/90 leading-snug">{parsed.content}</p>;
                                    }

                                    return (
                                      <div key={idx} className="py-0.5">
                                        <div className="flex items-start gap-1">
                                          <span className={`w-1 h-1 rounded-full shrink-0 mt-1.5 ${isMafia ? "bg-rose-500" : "bg-indigo-500"}`}></span>
                                          <div className="min-w-0 flex-1">
                                            <span className={`font-semibold text-[10px] ${isMafia ? "text-rose-600 dark:text-rose-400" : "text-indigo-600 dark:text-indigo-400"}`}>
                                              {event.playerName}
                                            </span>
                                            <span className="text-[8px] text-muted-foreground/30 ml-1">{getShortModelName(event.modelId || '')}</span>
                                            <div className="mt-0.5">{content}</div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }

                                  if (event.type === "elimination") {
                                    const elimTeam = event.team || 'town';
                                    const isElimMafia = elimTeam === 'mafia';
                                    return (
                                      <div key={idx} className={`flex items-center gap-1.5 py-1 px-1.5 rounded text-[10px] ${isElimMafia ? 'bg-rose-500/10' : 'bg-indigo-500/10'}`}>
                                        <Skull size={12} className={isElimMafia ? "text-rose-500" : "text-indigo-500"} />
                                        <span className={`font-medium ${isElimMafia ? "text-rose-600 dark:text-rose-400" : "text-indigo-600 dark:text-indigo-400"}`}>
                                          {event.playerName || getPersonaName(event.playerId || "")}
                                        </span>
                                        <span className="text-muted-foreground/60">eliminated</span>
                                      </div>
                                    );
                                  }

                                  if (event.type === "summarization") {
                                    const [roundStart, roundEnd] = event.roundRangeSummarized || [1, 1];
                                    return (
                                      <div key={idx} className="flex items-center gap-1.5 py-1 px-1.5 rounded text-[10px] bg-amber-500/10">
                                        <Zap size={12} className="text-amber-500" />
                                        <span className="text-amber-600 dark:text-amber-400">R{roundStart}-{roundEnd} summarized</span>
                                        <span className="text-muted-foreground/60">({event.tokensSaved?.toLocaleString() || 0} tok)</span>
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
                  </details>
                );
              })}

              {/* Game End */}
              {gameEndEvent && (
                <div className={`text-center py-3 ${gameEndEvent.winner === "mafia" ? "bg-rose-500/10" : "bg-indigo-500/10"}`}>
                  <Trophy size={16} className={`mx-auto mb-1 ${gameEndEvent.winner === "mafia" ? "text-rose-500" : "text-indigo-500"}`} />
                  <div className={`text-xs font-bold ${gameEndEvent.winner === "mafia" ? "text-rose-500" : "text-indigo-500"}`}>
                    {gameEndEvent.winner === "mafia" ? "Mafia" : "Town"} Wins
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </GameLayout>
  );
}
