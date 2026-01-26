import { useState, useEffect, useRef, useMemo } from "react";
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
import { GameLayout } from "~/components/GameHeader";
import { ThemeIcon } from "~/components/ThemeIcon";
import { PlayerPill, PlayerModal, ThemeDialog } from "~/components/game";
import type { PlayerInfo as GamePlayerInfo, ParsedResponse } from "~/lib/game-types";
import { getTheme } from "~/lib/themes";
import { sortPlayers } from "~/lib/game-utils";
import { MarkdownText } from "~/components/ui/MarkdownText";
import type { GameDetail, TranscriptData, TranscriptEvent } from "~/types/games";

const SITE_URL = "https://mafia-arena.com";

export function meta({ data }: Route.MetaArgs) {
  const game = data?.game;
  
  if (!game) {
    return [{ title: "Game Not Found | Mafia Arena" }];
  }
  
  const gameId = game.id.slice(-8);
  const title = `Game ${gameId} | Mafia Arena`;
  
  const participants = game.participants || [];
  const mafia = participants.find((p: Participant) => p.team === 'mafia');
  const town = participants.find((p: Participant) => p.team === 'town');
  const mafiaModel = mafia?.model_name || 'AI';
  const townModel = town?.model_name || 'AI';
  const winnerText = game.winner ? `${game.winner === 'mafia' ? 'Mafia' : 'Town'} wins!` : 'In progress';
  
  const description = `${mafiaModel} vs ${townModel} — ${winnerText} ${game.rounds ? `in ${game.rounds} rounds` : ''}`.trim();
  const url = `${SITE_URL}/games/${game.id}`;
  const ogImage = `${SITE_URL}/og-image.png`;
  
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: ogImage },
    { property: "og:type", content: "article" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: ogImage },
  ];
}

interface Participant {
  model_id: string;
  model_name: string;
  team: 'mafia' | 'town';
  player_count: number;
  won: boolean;
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

function parseResponse(raw: string): ParsedResponse {
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
  const [selectedPlayer, setSelectedPlayer] = useState<GamePlayerInfo | null>(null);
  const [showThemeDialog, setShowThemeDialog] = useState(false);

  if (error || !game) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Skull size={48} className="mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground text-base font-display">Game not found</p>
          <Link to="/games" className="text-sm font-semibold hover:underline inline-flex items-center gap-1.5 text-primary">
            <ArrowLeft size={14} /> Back to games
          </Link>
        </div>
      </div>
    );
  }

  const events: TranscriptEvent[] = transcript?.events || [];

  // Build player map with persona information
  const playerMap: Record<string, GamePlayerInfo> = {};
  const eliminatedPlayers = new Set<string>();

  for (const event of events) {
    if (event.type === "ai_call" && event.playerId && !playerMap[event.playerId]) {
      playerMap[event.playerId] = {
        playerId: event.playerId,
        playerName: event.playerName || event.playerId,
        team: (event.team as "mafia" | "town") || "town",
        modelId: event.modelId || "",
        isAlive: true,
      };
    }
    if (event.type === "persona_generation" && event.playerId) {
      if (playerMap[event.playerId]) {
        playerMap[event.playerId].playerName = event.persona?.name || event.playerName || event.playerId;
        playerMap[event.playerId].persona = event.persona;
      } else {
        playerMap[event.playerId] = {
          playerId: event.playerId,
          playerName: event.persona?.name || event.playerName || event.playerId,
          team: (event.team as "mafia" | "town") || "town",
          modelId: event.modelId || "",
          isAlive: true,
          persona: event.persona,
        };
      }
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
  
  // Sort players for display (mafia first, alive first within teams)
  const sortedPlayers = useMemo(() => sortPlayers(players), [players]);

  // Get theme config
  const theme = getTheme(game.personaTheme);

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
    // Use model_name if available, otherwise fall back to model_id
    mafiaDisplayName = [...new Set(mafiaParticipants.map(p => p.model_name || getShortModelName(p.model_id)))].filter(Boolean).join(", ") || "AI";
    townDisplayName = [...new Set(townParticipants.map(p => p.model_name || getShortModelName(p.model_id)))].filter(Boolean).join(", ") || "AI";
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

  const getPersonaName = (playerId: string) => playerMap[playerId]?.playerName || playerId;

  // Get current phase from last event
  const lastPhaseEvent = [...events].reverse().find(e => e.phase && e.phase !== 'other');
  const currentPhase = lastPhaseEvent?.phase || 'completed';
  const phaseConfig = PHASE_CONFIG[currentPhase] || { label: 'Completed', iconType: 'message' };

  // Determine game status - check both game record and transcript
  const isFailed = game.status === 'failed' || transcript?.status === 'failed';
  const gameError = game.errorMessage || transcript?.error;

  return (
    <GameLayout>
      {/* Error Banner for Failed Games */}
      {isFailed && gameError && (
        <div className="shrink-0 px-4 pt-2">
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
            <Skull size={16} className="text-rose-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-0.5">
                Game Failed
              </div>
              <div className="text-[11px] text-rose-600/80 dark:text-rose-400/80 break-words">
                {gameError}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 px-4 pt-2 pb-1.5 space-y-1.5">
        {/* Row 1: Status + Theme + Matchup */}
        <div className="flex items-center gap-2 text-[10px]">
          {/* Status badge */}
          {isFailed ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[9px] font-bold tracking-widest uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              FAILED
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold tracking-widest uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              DONE
            </div>
          )}

          {/* Clickable Theme Badge */}
          <button
            onClick={() => setShowThemeDialog(true)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium cursor-pointer hover:opacity-80 transition-opacity ${theme.classes}`}
          >
            <ThemeIcon type={theme.iconType} />
            {theme.label}
          </button>

          <div className="h-3 w-px bg-border/40" />

          {/* Matchup */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-[12px] tracking-wide text-red-700 dark:text-red-400 relative">
              MAFIA
              {game.winner === 'mafia' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-700 dark:bg-red-400" />}
            </span>
            <span className="font-mono text-[11px] font-semibold text-foreground truncate max-w-[120px]">
              {mafiaDisplayName}
            </span>
            {game.winner === 'mafia' && <span className="text-red-700 dark:text-red-400 text-[10px] font-bold">won</span>}
            <span className="text-foreground font-medium text-[10px]">vs</span>
            <span className="font-bold text-[12px] tracking-wide text-blue-700 dark:text-blue-400 relative">
              TOWN
              {game.winner === 'town' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-700 dark:bg-blue-400" />}
            </span>
            <span className="font-mono text-[11px] font-semibold text-foreground truncate max-w-[120px]">
              {townDisplayName}
            </span>
            {game.winner === 'town' && <span className="text-blue-700 dark:text-blue-400 text-[10px] font-bold">won</span>}
          </div>

          <div className="flex-1" />

          {/* Stats */}
          <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
            <span>Round <span className="font-mono font-semibold text-foreground">{game.rounds || '-'}</span></span>
            <div className="inline-flex items-center gap-1 font-medium text-foreground">
              <PhaseIcon type={phaseConfig.iconType} />
              {phaseConfig.label}
            </div>
            <span className="font-mono tabular-nums">{formatDuration(game.durationMs || 0)}</span>
            <span className="font-mono tabular-nums">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{(game.totalTokens || 0).toLocaleString()}</span>
              <span className="text-muted-foreground/70 ml-0.5">tok</span>
            </span>
          </div>
        </div>

        {/* Row 2: Players */}
        {sortedPlayers.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {sortedPlayers.map(player => (
              <PlayerPill
                key={player.playerId}
                player={player}
                onClick={() => setSelectedPlayer(player)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 relative px-4 pb-4">
        <div ref={transcriptRef} className="absolute inset-x-4 top-0 bottom-4 rounded-lg text-xs overflow-y-auto overflow-x-hidden bg-muted/30">
          {transcriptError ? (
            <div className="px-4 py-12 text-center text-muted-foreground font-display">{transcriptError}</div>
          ) : rounds.length === 0 ? (
            <div className="px-4 py-12 text-center text-muted-foreground font-display">No events recorded</div>
          ) : (
            <div>
              {rounds.map((round, roundIndex) => {
                const isOpen = openRounds.has(round);
                const isFirst = roundIndex === 0;
                return (
                  <details key={round} open={isOpen} className="group">
                    <summary
                      onClick={(e) => { e.preventDefault(); toggleRound(round); }}
                      className={`flex items-center justify-between px-3 py-2.5 bg-muted cursor-pointer hover:bg-muted/80 transition-colors sticky top-0 z-10 ${isFirst ? 'rounded-t-lg' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm font-display tracking-tight">Round {round}</span>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          {Object.keys(groupedEvents[round] || {}).map((phase) => {
                            const config = PHASE_CONFIG[phase] || { label: phase, iconType: "message" };
                            return <span key={phase} className="inline-flex items-center opacity-60"><PhaseIcon type={config.iconType} size={12} /></span>;
                          })}
                        </div>
                      </div>
                      <ChevronDown size={16} className={`text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                    </summary>

                    {isOpen && (
                      <div>
                        {Object.entries(groupedEvents[round] || {}).map(([phase, phaseEvents]) => {
                          const config = PHASE_CONFIG[phase] || { label: phase, iconType: "message" };
                          const isNightPhase = phase === "night" || phase === "mafia_chat";
                          return (
                            <div key={phase} className={`px-3 py-2 space-y-2 ${isNightPhase ? "bg-rose-500/5" : ""}`}>
                              <div className="inline-flex items-center gap-1.5 text-[10px] text-foreground/60">
                                <span className="inline-flex items-center"><PhaseIcon type={config.iconType} size={12} /></span>
                                <span className="font-semibold uppercase tracking-widest font-display">{config.label}</span>
                                <span className="opacity-50">·</span>
                                <span className="opacity-70 font-mono">{phaseEvents.length}</span>
                              </div>

                              <div className="space-y-1.5">
                                {phaseEvents.map((event, idx) => {
                                  const player = playerMap[(event as any).playerId || ""];
                                  const team = (event as any).team || player?.team || "town";
                                  const isMafia = team === "mafia";

                                  if (event.type === "ai_call") {
                                    const parsed = parseResponse(event.response?.raw || "");
                                    if (parsed.type === "persona") return null;

                                    let content;
                                    if (parsed.type === "message") {
                                      content = <MarkdownText content={parsed.content} className="text-[12px] text-foreground/90" />;
                                    } else if (parsed.type === "vote") {
                                      const targetTeam = playerMap[parsed.content.vote]?.team || 'town';
                                      content = (
                                        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                          <Vote size={12} />
                                          <span className={`font-semibold font-display ${targetTeam === 'mafia' ? 'text-rose-500' : 'text-indigo-500'}`}>
                                            {getPersonaName(parsed.content.vote)}
                                          </span>
                                        </span>
                                      );
                                    } else if (parsed.type === "action") {
                                      const targetTeam = playerMap[parsed.content.target]?.team || 'town';
                                      content = (
                                        <span className="inline-flex items-center gap-1.5 text-[11px]">
                                          <Crosshair size={12} className={parsed.content.action === 'kill' ? 'text-rose-500' : 'text-muted-foreground'} />
                                          <span className={`font-semibold font-display ${targetTeam === 'mafia' ? 'text-rose-500' : 'text-indigo-500'}`}>
                                            {getPersonaName(parsed.content.target)}
                                          </span>
                                        </span>
                                      );
                                    } else {
                                      content = <MarkdownText content={parsed.content} className="text-[12px] text-foreground/90" />;
                                    }

                                    return (
                                      <div key={idx} className="py-1">
                                        <div className="flex items-start gap-1.5">
                                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${isMafia ? "bg-rose-500" : "bg-indigo-500"}`}></span>
                                          <div className="min-w-0 flex-1">
                                            <span className={`font-bold text-[11px] font-display ${isMafia ? "text-rose-600 dark:text-rose-400" : "text-indigo-600 dark:text-indigo-400"}`}>
                                              {event.playerName}
                                            </span>
                                            <span className="text-[9px] text-foreground/50 ml-1.5 font-mono">{getShortModelName(event.modelId || '')}</span>
                                            <div className="mt-1">{content}</div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }

                                  if (event.type === "elimination") {
                                    const elimTeam = event.team || 'town';
                                    const isElimMafia = elimTeam === 'mafia';
                                    return (
                                      <div key={idx} className={`flex items-center gap-2 py-1.5 px-2 rounded text-[11px] ${isElimMafia ? 'bg-rose-500/10' : 'bg-indigo-500/10'}`}>
                                        <Skull size={14} className={isElimMafia ? "text-rose-500" : "text-indigo-500"} />
                                        <span className={`font-bold font-display ${isElimMafia ? "text-rose-600 dark:text-rose-400" : "text-indigo-600 dark:text-indigo-400"}`}>
                                          {event.playerName || getPersonaName(event.playerId || "")}
                                        </span>
                                        <span className="text-muted-foreground/60">eliminated</span>
                                      </div>
                                    );
                                  }

                                  if (event.type === "summarization") {
                                    const [roundStart, roundEnd] = event.roundRangeSummarized || [1, 1];
                                    return (
                                      <div key={idx} className="flex items-center gap-2 py-1.5 px-2 rounded text-[11px] bg-amber-500/10">
                                        <Zap size={14} className="text-amber-500" />
                                        <span className="text-amber-600 dark:text-amber-400 font-semibold font-display">R{roundStart}-{roundEnd} summarized</span>
                                        <span className="text-muted-foreground/60 font-mono">({event.tokensSaved?.toLocaleString() || 0} tok)</span>
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
                <div className={`text-center py-4 ${gameEndEvent.winner === "mafia" ? "bg-rose-500/10" : "bg-indigo-500/10"}`}>
                  <Trophy size={20} className={`mx-auto mb-1.5 ${gameEndEvent.winner === "mafia" ? "text-rose-500" : "text-indigo-500"}`} />
                  <div className={`text-sm font-bold font-display tracking-tight ${gameEndEvent.winner === "mafia" ? "text-rose-500" : "text-indigo-500"}`}>
                    {gameEndEvent.winner === "mafia" ? "Mafia" : "Town"} Wins
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Player Modal */}
      {selectedPlayer && (
        <PlayerModal
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      {/* Theme Dialog */}
      <ThemeDialog
        isOpen={showThemeDialog}
        onClose={() => setShowThemeDialog(false)}
        themeKey={game.personaTheme}
      />
    </GameLayout>
  );
}

