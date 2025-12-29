/**
 * LiveTranscript - Virtualized transcript container with auto-scroll.
 * Uses react-virtuoso for high-performance rendering of long game transcripts.
 */

import { useRef, useCallback, useMemo, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { ChevronDown, Moon, Sun, Swords, Vote, MessageCircle } from 'lucide-react';
import type { GameEvent, PlayersMap, ThinkingState } from '~/lib/game-types';
import { getPhaseConfig, getShortModelName } from '~/lib/game-types';
import { TranscriptItem } from './TranscriptItem';

// =============================================================================
// Phase Icon Component
// =============================================================================

function PhaseIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'moon': return <Moon size={10} />;
    case 'sun': return <Sun size={10} />;
    case 'swords': return <Swords size={10} />;
    case 'vote': return <Vote size={10} />;
    case 'message': return <MessageCircle size={10} />;
    default: return <MessageCircle size={10} />;
  }
}

// =============================================================================
// Grouped Transcript Structure
// =============================================================================

interface PhaseGroup {
  phase: string;
  events: GameEvent[];
}

interface RoundGroup {
  round: number;
  phases: PhaseGroup[];
}

function groupEventsByRound(events: GameEvent[], thinkingState: ThinkingState | null): RoundGroup[] {
  const validEvents = events.filter(
    e => e.type !== 'persona_generation' && e.phase && e.phase !== 'other' && e.type !== 'game_end'
  );

  const grouped: Record<number, Record<string, GameEvent[]>> = {};

  for (const event of validEvents) {
    const round = event.round || 1;
    const phase = event.phase || 'unknown';
    if (!grouped[round]) grouped[round] = {};
    if (!grouped[round][phase]) grouped[round][phase] = [];
    grouped[round][phase].push(event);
  }

  // Inject thinking pseudo-event if an agent is currently generating
  if (thinkingState) {
    const { round, phase, playerId } = thinkingState;
    if (!grouped[round]) grouped[round] = {};
    if (!grouped[round][phase]) grouped[round][phase] = [];
    grouped[round][phase].push({
      type: 'thinking',
      playerId,
      round,
      phase,
    });
  }

  const rounds = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => a - b);

  return rounds.map(round => ({
    round,
    phases: Object.entries(grouped[round]).map(([phase, events]) => ({
      phase,
      events,
    })),
  }));
}

// =============================================================================
// Round Section Component (for virtualized list)
// =============================================================================

interface RoundSectionProps {
  roundGroup: RoundGroup;
  isLast: boolean;
  players: PlayersMap;
  getPersonaName: (playerId: string) => string;
}

function RoundSection({ roundGroup, isLast, players, getPersonaName }: RoundSectionProps) {
  const [isOpen, setIsOpen] = useState(isLast);

  return (
    <div className="group">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-2 py-1.5 bg-muted cursor-pointer hover:bg-muted/80 transition-colors sticky top-0 z-10"
      >
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-xs">Round {roundGroup.round}</span>
          <div className="flex items-center gap-0.5 text-muted-foreground">
            {roundGroup.phases.map(({ phase }) => (
              <span key={phase} className="inline-flex items-center" title={getPhaseConfig(phase).label}>
                <PhaseIcon icon={getPhaseConfig(phase).icon} />
              </span>
            ))}
          </div>
        </div>
        <span className={`transition-transform duration-200 text-muted-foreground ${isOpen ? 'rotate-180' : ''}`}>
          <ChevronDown size={14} />
        </span>
      </button>

      {isOpen && (
        <div className="divide-y divide-border/50">
          {roundGroup.phases.map(({ phase, events }) => {
            const config = getPhaseConfig(phase);
            const isNight = phase === 'night' || phase === 'mafia_chat';

            return (
              <div key={phase} className={`px-2 py-1.5 space-y-1 ${isNight ? 'bg-rose-500/5' : ''}`}>
                <div className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
                  <span className={`inline-flex items-center ${config.color}`}>
                    <PhaseIcon icon={config.icon} />
                  </span>
                  <span className="font-medium uppercase tracking-wide">{config.label}</span>
                  <span className="opacity-40">·</span>
                  <span className="opacity-40">{events.length}</span>
                </div>
                <div className="space-y-0.5">
                  {events.map((event, idx) => (
                    <TranscriptItem
                      key={`${event.type}-${event.playerId}-${idx}`}
                      event={event}
                      players={players}
                      getPersonaName={getPersonaName}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Character Generation Progress
// =============================================================================

interface CharacterGenerationProps {
  events: GameEvent[];
  players: PlayersMap;
  totalPlayers: number;
  currentPhase?: string;
}

function CharacterGeneration({ events, players, totalPlayers, currentPhase }: CharacterGenerationProps) {
  const personaEvents = events.filter(e => e.type === 'persona_generation');
  const progressEvent = [...events].reverse().find(e => e.type === 'persona_generation_progress');
  const playerList = Object.values(players);
  
  // Use progress event if available, otherwise count persona events
  const completed = progressEvent?.completed ?? personaEvents.length;
  const total = progressEvent?.total ?? totalPlayers;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  // Determine if we're still generating or moving to introductions
  const isGenerating = completed < total;
  const statusText = isGenerating 
    ? 'Generating characters...' 
    : currentPhase === 'introduction' 
      ? 'Characters ready! Starting introductions...'
      : 'Characters generated';

  return (
    <div className="px-3 py-6 space-y-4">
      <div className="text-center space-y-3">
        <div className="text-sm font-medium text-foreground">{statusText}</div>
        
        {/* Progress bar */}
        <div className="max-w-xs mx-auto">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {completed}/{total} personas created
          </div>
        </div>
      </div>
      
      {/* Player list */}
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {playerList.map(player => {
          const hasPersona = player.persona?.name;
          const isMafia = player.team === 'mafia';

          if (hasPersona) {
            return (
              <div
                key={player.playerId}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all duration-300 ${
                  isMafia 
                    ? 'bg-rose-500/10 border border-rose-500/20' 
                    : 'bg-indigo-500/10 border border-indigo-500/20'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isMafia ? 'bg-rose-500' : 'bg-indigo-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-medium truncate ${isMafia ? 'text-rose-600 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                    {player.persona?.name || player.playerName}
                  </div>
                  {player.persona?.occupation && (
                    <div className="text-[10px] text-muted-foreground truncate">{player.persona.occupation}</div>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground/50 shrink-0">{getShortModelName(player.modelId)}</span>
              </div>
            );
          }

          return (
            <div
              key={player.playerId}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted/30 border border-border/30"
            >
              <span className="w-2 h-2 rounded-full bg-muted-foreground/30 animate-pulse" />
              <div className="flex-1">
                <div className="text-xs text-muted-foreground/70 italic">Generating...</div>
              </div>
              <span className="text-[10px] text-muted-foreground/30 shrink-0">{getShortModelName(player.modelId)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Main LiveTranscript Component
// =============================================================================

interface LiveTranscriptProps {
  events: GameEvent[];
  players: PlayersMap;
  thinkingState: ThinkingState | null;
  currentPhase?: string | null;
}

export function LiveTranscript({ events, players, thinkingState, currentPhase }: LiveTranscriptProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);

  const getPersonaName = useCallback((playerId: string): string => {
    return players[playerId]?.playerName || playerId;
  }, [players]);

  // Group events by round
  const roundGroups = useMemo(
    () => groupEventsByRound(events, thinkingState),
    [events, thinkingState]
  );

  // Handle scroll state
  const handleAtBottomChange = useCallback((atBottomNow: boolean) => {
    setAtBottom(atBottomNow);
    if (atBottomNow) setNewMessageCount(0);
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: 'LAST',
      behavior: 'smooth',
    });
    setNewMessageCount(0);
  }, []);

  // Check for persona generation events
  const personaStartEvent = events.find(e => e.type === 'persona_generation_start');
  const personaEvents = events.filter(e => e.type === 'persona_generation');
  const personaProgressEvents = events.filter(e => e.type === 'persona_generation_progress');
  const totalPlayers = personaStartEvent?.playerCount || Object.keys(players).length || 11;
  
  // Check for valid gameplay events (excluding persona generation)
  const validEvents = events.filter(
    e => e.type !== 'persona_generation' && 
         e.type !== 'persona_generation_start' && 
         e.type !== 'persona_generation_progress' &&
         e.phase && e.phase !== 'other'
  );
  
  // Determine if we're in persona generation phase
  const isGeneratingPersonas = personaStartEvent && personaEvents.length < totalPlayers;
  const hasPersonaEvents = personaEvents.length > 0 || personaProgressEvents.length > 0;
  
  // Show character generation progress during intro phase while personas are being generated
  // or when we have persona events but no gameplay events yet
  if ((isGeneratingPersonas || (hasPersonaEvents && validEvents.length === 0)) && currentPhase === 'introduction') {
    return (
      <div className="h-full overflow-y-auto rounded-lg bg-muted/30">
        <CharacterGeneration 
          events={events} 
          players={players} 
          totalPlayers={totalPlayers}
          currentPhase={currentPhase ?? undefined}
        />
      </div>
    );
  }

  // Show waiting message if no events
  if (roundGroups.length === 0) {
    if (thinkingState) {
      const player = players[thinkingState.playerId];
      const playerName = player?.playerName || thinkingState.playerId;
      const modelName = getShortModelName(player?.modelId);

      return (
        <div className="h-full flex items-center justify-center rounded-lg bg-muted/30">
          <div className="inline-flex items-center gap-2 text-muted-foreground">
            <span>{playerName}</span>
            <span className="text-muted-foreground/50 text-xs">{modelName}</span>
            <span className="flex gap-0.5">
              <span className="w-1 h-1 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
              <span className="w-1 h-1 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
              <span className="w-1 h-1 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex items-center justify-center rounded-lg bg-muted/30 text-muted-foreground">
        Waiting for events...
      </div>
    );
  }

  return (
    <div className="h-full relative rounded-lg bg-muted/30">
      <Virtuoso
        ref={virtuosoRef}
        data={roundGroups}
        className="h-full"
        initialTopMostItemIndex={roundGroups.length - 1}
        followOutput="auto"
        atBottomStateChange={handleAtBottomChange}
        itemContent={(index, roundGroup) => (
          <RoundSection
            roundGroup={roundGroup}
            isLast={index === roundGroups.length - 1}
            players={players}
            getPersonaName={getPersonaName}
          />
        )}
      />

      {/* New messages pill */}
      {!atBottom && newMessageCount > 0 && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-[11px] font-medium rounded-full cursor-pointer hover:bg-blue-700 transition-all shadow-lg z-10"
        >
          <ChevronDown size={12} />
          <span>{newMessageCount}</span>
          <span>new</span>
        </button>
      )}
    </div>
  );
}

export default LiveTranscript;

