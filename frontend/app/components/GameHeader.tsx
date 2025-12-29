import { Trophy, Loader2 } from "lucide-react";
import { ThemeIcon } from "~/components/ThemeIcon";
import { getTheme } from "~/lib/themes";

export interface GameHeaderProps {
  status: 'live' | 'completed' | 'running' | 'failed';
  theme: string;
  mafiaModels: string;
  townModels: string;
  winner?: 'mafia' | 'town' | null;
  round?: number | string;
  phase?: string;
  duration?: string;
  tokens?: number | string;
  isLive?: boolean;
  connectionStatus?: React.ReactNode;
}

export function GameHeader({
  status,
  theme: themeKey,
  mafiaModels,
  townModels,
  winner,
  round = '-',
  phase = 'Starting',
  duration = '00:00',
  tokens = 0,
  isLive = false,
  connectionStatus,
}: GameHeaderProps) {
  const theme = getTheme(themeKey);
  
  const statusBadge = () => {
    if (status === 'live' || (status === 'running' && isLive)) {
      return (
        <div id="live-badge" className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[9px] font-bold tracking-widest uppercase font-display">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
          </span>
          LIVE
        </div>
      );
    }
    if (status === 'completed') {
      return (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold tracking-widest uppercase font-display">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          COMPLETED
        </div>
      );
    }
    if (status === 'failed') {
      return (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[9px] font-bold tracking-widest uppercase font-display">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          FAILED
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-bold tracking-widest uppercase font-display">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
        RUNNING
      </div>
    );
  };

  return (
    <div className="shrink-0 px-3 sm:px-4 pt-3 pb-2">
      {/* Status bar + Matchup - wraps on mobile */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-3 text-[11px]">
        {/* Row 1 on mobile: Status + Theme */}
        <div className="flex items-center gap-2">
          {statusBadge()}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-semibold ${theme.classes}`}>
            <ThemeIcon type={theme.iconType} />
            {theme.label}
          </div>
        </div>

        {/* Separator - hidden on mobile */}
        <div className="hidden sm:block h-4 w-px bg-border/30" />

        {/* Matchup - full width on mobile */}
        <div id="teams-display" className="flex items-center gap-2 w-full sm:w-auto order-last sm:order-none">
          {winner === 'mafia' && <Trophy size={12} className="text-amber-500 shrink-0" />}
          <span className={`font-bold font-display tracking-wide ${winner === 'town' ? 'opacity-50' : ''} text-rose-500 shrink-0`}>MAFIA</span>
          <span id="mafia-models" className={`font-mono text-[10px] text-foreground/80 truncate max-w-[80px] sm:max-w-[140px] ${winner === 'town' ? 'opacity-50' : ''}`}>
            {mafiaModels || '—'}
          </span>
          <span className="text-muted-foreground/50 text-[9px] font-display shrink-0">vs</span>
          {winner === 'town' && <Trophy size={12} className="text-amber-500 shrink-0" />}
          <span className={`font-bold font-display tracking-wide ${winner === 'mafia' ? 'opacity-50' : ''} text-indigo-500 shrink-0`}>TOWN</span>
          <span id="town-models" className={`font-mono text-[10px] text-foreground/80 truncate max-w-[80px] sm:max-w-[140px] ${winner === 'mafia' ? 'opacity-50' : ''}`}>
            {townModels || '—'}
          </span>
        </div>

        <div className="flex-1 hidden sm:block" />
        
        {/* Stats - right side on desktop, after status on mobile */}
        <div className="flex items-center gap-2 sm:gap-3 text-[10px] text-muted-foreground ml-auto sm:ml-0">
          <span className="font-display">R<span id="round-display" className="font-mono font-bold text-foreground">{round}</span></span>
          <div id="phase-display" className="hidden sm:inline-flex items-center gap-1 font-semibold text-foreground font-display">{phase}</div>
          <span id="duration-display" className="font-mono tabular-nums">{duration}</span>
          <span id="token-display" className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {typeof tokens === 'number' ? tokens.toLocaleString() : tokens}
          </span>
        </div>
      </div>

      {/* Players slot */}
      <div id="players-section" className="hidden pt-1.5">
        <div id="players-grid" className="flex flex-wrap gap-1"></div>
      </div>

      {/* Connection Status */}
      {connectionStatus !== undefined ? (
        <div id="connection-status" className="text-[9px] text-muted-foreground pt-1">
          {connectionStatus}
        </div>
      ) : isLive ? (
        <div id="connection-status" className="text-[9px] text-muted-foreground pt-1">
          <div className="flex items-center gap-1">
            <Loader2 size={9} className="animate-spin" />
            <span>Connecting...</span>
          </div>
        </div>
      ) : null}

      {/* Error Banner */}
      <div id="error-banner" className="hidden mt-2 rounded-lg bg-rose-500/10 p-3">
        <div className="error-title text-sm font-bold font-display text-rose-600 dark:text-rose-400">Game Failed</div>
        <div id="error-message" className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-1 leading-relaxed"></div>
      </div>
    </div>
  );
}

export interface GameLayoutProps {
  children: React.ReactNode;
  gameId?: string;
  apiUrl?: string;
}

export function GameLayout({ children, gameId, apiUrl }: GameLayoutProps) {
  return (
    <div 
      className="fixed inset-0 top-14 flex flex-col overflow-hidden bg-background h-[calc(100dvh-3.5rem)]" 
      id="live-game-container" 
      data-game-id={gameId} 
      data-api-url={apiUrl}
    >
      <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export interface TranscriptContainerProps {
  children?: React.ReactNode;
  emptyMessage?: string;
}

export function TranscriptContainer({ children, emptyMessage = "Waiting for events..." }: TranscriptContainerProps) {
  return (
    <div className="flex-1 min-h-0 relative px-4 pb-4">
      <div id="transcript-container" className="absolute inset-x-4 top-0 bottom-4 rounded-lg text-xs overflow-y-auto bg-muted/30">
        {children || (
          <div className="px-4 py-12 text-center text-muted-foreground font-display">
            {emptyMessage}
          </div>
        )}
      </div>
      
      {/* Floating pill at bottom */}
      <div id="new-messages-pill" className="hidden absolute bottom-6 left-1/2 -translate-x-1/2 items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-[11px] font-semibold font-display rounded-full cursor-pointer hover:bg-blue-700 transition-all shadow-lg z-10">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        <span id="new-messages-count">0</span>
        <span>new</span>
      </div>

      {/* Game End overlay */}
      <div id="game-end" className="hidden"></div>
    </div>
  );
}

