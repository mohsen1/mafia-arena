/**
 * TranscriptItem - Renders a single game event in the transcript.
 * Handles different event types: ai_call, elimination, summarization, thinking.
 */

import { Skull, Crosshair, Vote, Zap } from 'lucide-react';
import type { GameEvent, PlayersMap } from '~/lib/game-types';
import { parseResponse, getShortModelName } from '~/lib/game-types';
import { MarkdownText } from '~/components/ui/MarkdownText';

interface TranscriptItemProps {
  event: GameEvent;
  players: PlayersMap;
  getPersonaName: (playerId: string) => string;
}

export function TranscriptItem({ event, players, getPersonaName }: TranscriptItemProps) {
  const player = players[event.playerId || ''];
  const team = event.team || player?.team || 'town';
  const isMafia = team === 'mafia';

  // AI Call Event - Main message type
  if (event.type === 'ai_call') {
    const parsed = parseResponse(event.response?.raw);
    if (parsed.type === 'persona') return null; // Don't render persona generation in transcript

    const nameClass = isMafia ? 'text-rose-600 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-400';
    const dotClass = isMafia ? 'bg-rose-500' : 'bg-indigo-500';

    let content: React.ReactNode = null;

    if (parsed.type === 'message') {
      content = <MarkdownText content={parsed.content} className="text-[11px] text-foreground/90" />;
    } else if (parsed.type === 'vote') {
      // TypeScript knows parsed.content is ParsedVote here
      const targetTeam = players[parsed.content.vote]?.team || 'town';
      const targetClass = targetTeam === 'mafia' ? 'text-rose-500' : 'text-indigo-500';
      content = (
        <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Vote size={10} className="text-muted-foreground/50" />
          <span className={`font-semibold ${targetClass}`}>{getPersonaName(parsed.content.vote)}</span>
        </span>
      );
    } else if (parsed.type === 'action') {
      // TypeScript knows parsed.content is ParsedAction here
      const targetTeam = players[parsed.content.target]?.team || 'town';
      const targetClass = targetTeam === 'mafia' ? 'text-rose-500' : 'text-indigo-500';
      content = (
        <span className="inline-flex items-center gap-1 text-[10px]">
          <span className={parsed.content.action === 'kill' ? 'text-rose-500' : 'text-muted-foreground'}>
            <Crosshair size={10} />
          </span>
          <span className={`font-medium ${targetClass}`}>{getPersonaName(parsed.content.target)}</span>
        </span>
      );
    } else if (parsed.type === 'raw') {
      content = <MarkdownText content={parsed.content} className="text-[11px] text-foreground/90" />;
    }

    return (
      <div className="group/msg py-0.5">
        <div className="flex items-start gap-1">
          <span className={`w-1 h-1 rounded-full shrink-0 mt-1.5 ${dotClass}`} />
          <div className="min-w-0 flex-1">
            <span className={`font-semibold text-[10px] ${nameClass}`}>{event.playerName}</span>
            <span className="text-[8px] text-muted-foreground/30 ml-1">{getShortModelName(event.modelId)}</span>
            <div className="mt-0.5">{content}</div>
          </div>
        </div>
      </div>
    );
  }

  // Elimination Event
  if (event.type === 'elimination') {
    const elimTeam = event.team || players[event.playerId || '']?.team || 'town';
    const isElimMafia = elimTeam === 'mafia';
    const bgClass = isElimMafia
      ? 'bg-rose-500/10 border-rose-500/20'
      : 'bg-indigo-500/10 border-indigo-500/20';
    const textClass = isElimMafia
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-indigo-600 dark:text-indigo-400';

    return (
      <div className={`flex items-center gap-1.5 py-1 px-1.5 rounded text-[10px] ${bgClass} border`}>
        <span className={textClass}><Skull size={12} /></span>
        <span className={`font-medium ${textClass}`}>
          {event.playerName || getPersonaName(event.playerId || '')}
        </span>
        <span className="text-muted-foreground/60">eliminated</span>
      </div>
    );
  }

  // Summarization Event
  if (event.type === 'summarization') {
    const [roundStart, roundEnd] = event.roundRangeSummarized || [1, 1];
    const tokensSaved = event.tokensSaved?.toLocaleString() || '0';
    return (
      <div className="flex items-center gap-1.5 py-1 px-1.5 rounded text-[10px] bg-amber-500/10 border border-amber-500/20">
        <span className="text-amber-500"><Zap size={12} /></span>
        <span className="text-amber-600 dark:text-amber-400">R{roundStart}-{roundEnd} summarized</span>
        <span className="text-muted-foreground/60">({tokensSaved} tok)</span>
      </div>
    );
  }

  // Thinking Indicator Event (pseudo-event for currently generating agent)
  if (event.type === 'thinking') {
    const thinkingPlayer = players[event.playerId || ''];
    const thinkingIsMafia = thinkingPlayer?.team === 'mafia';
    const nameClass = thinkingIsMafia ? 'text-rose-600 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-400';
    const dotColor = thinkingIsMafia ? 'bg-rose-400' : 'bg-indigo-400';
    const playerName = thinkingPlayer?.playerName || event.playerId || 'Unknown';
    const modelName = getShortModelName(thinkingPlayer?.modelId);

    return (
      <div className="group/msg py-0.5">
        <div className="flex items-start gap-1 opacity-70">
          <span className={`w-1 h-1 rounded-full shrink-0 mt-1.5 ${thinkingIsMafia ? 'bg-rose-500' : 'bg-indigo-500'} animate-pulse`} />
          <div className="min-w-0 flex-1">
            <span className={`font-semibold text-[10px] ${nameClass}`}>{playerName}</span>
            <span className="text-[8px] text-muted-foreground/50 ml-1">{modelName}</span>
            <div className="mt-0.5 text-[11px] text-muted-foreground italic flex items-center gap-1.5">
              <span>thinking</span>
              <span className="flex gap-0.5">
                <span className={`w-1 h-1 ${dotColor} rounded-full animate-bounce`} style={{ animationDelay: '0s', animationDuration: '0.6s' }} />
                <span className={`w-1 h-1 ${dotColor} rounded-full animate-bounce`} style={{ animationDelay: '0.15s', animationDuration: '0.6s' }} />
                <span className={`w-1 h-1 ${dotColor} rounded-full animate-bounce`} style={{ animationDelay: '0.3s', animationDuration: '0.6s' }} />
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

