import { Trophy, Feather, Scroll, Building2, Sparkles, Loader2 } from "lucide-react";

// Theme configuration
export const THEME_CONFIG: Record<string, { label: string; iconType: string; classes: string }> = {
  noir: { label: "Noir", iconType: "feather", classes: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400" },
  victorian: { label: "Victorian", iconType: "scroll", classes: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  modern: { label: "Modern", iconType: "building", classes: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400" },
  fantasy: { label: "Fantasy", iconType: "sparkles", classes: "bg-purple-500/10 text-purple-700 dark:text-purple-400" },
};

function ThemeIcon({ type }: { type: string }) {
  switch (type) {
    case "feather": return <Feather size={10} />;
    case "scroll": return <Scroll size={10} />;
    case "building": return <Building2 size={10} />;
    case "sparkles": return <Sparkles size={10} />;
    default: return null;
  }
}

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
  const theme = THEME_CONFIG[themeKey] || THEME_CONFIG.noir;
  
  const statusBadge = () => {
    if (status === 'live' || (status === 'running' && isLive)) {
      return (
        <div id="live-badge" className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[8px] font-bold tracking-wider uppercase">
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
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[8px] font-bold tracking-wider uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          COMPLETED
        </div>
      );
    }
    if (status === 'failed') {
      return (
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[8px] font-bold tracking-wider uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          FAILED
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[8px] font-bold tracking-wider uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
        RUNNING
      </div>
    );
  };

  return (
    <div className="shrink-0 px-4 pt-2 pb-1">
      {/* Status bar + Matchup - all in one row */}
      <div className="flex items-center gap-3 text-[10px]">
        {statusBadge()}
        
        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-medium ${theme.classes}`}>
          <ThemeIcon type={theme.iconType} />
          {theme.label}
        </div>

        <div className="h-3 w-px bg-border/50" />

        {/* Matchup inline */}
        <div id="teams-display" className="flex items-center gap-1.5">
          {winner === 'mafia' && <Trophy size={10} className="text-amber-500" />}
          <span className={`font-bold ${winner === 'town' ? 'opacity-50' : ''} text-rose-500`}>MAFIA</span>
          <span id="mafia-models" className={`font-mono text-foreground/60 truncate max-w-[120px] ${winner === 'town' ? 'opacity-50' : ''}`}>
            {mafiaModels || '—'}
          </span>
          <span className="text-muted-foreground/40 text-[8px]">vs</span>
          {winner === 'town' && <Trophy size={10} className="text-amber-500" />}
          <span className={`font-bold ${winner === 'mafia' ? 'opacity-50' : ''} text-indigo-500`}>TOWN</span>
          <span id="town-models" className={`font-mono text-foreground/60 truncate max-w-[120px] ${winner === 'mafia' ? 'opacity-50' : ''}`}>
            {townModels || '—'}
          </span>
        </div>

        <div className="flex-1" />
        
        {/* Stats */}
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
          <span>Round <span id="round-display" className="font-mono font-bold text-foreground">{round}</span></span>
          <div id="phase-display" className="inline-flex items-center gap-1 font-medium text-foreground">{phase}</div>
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
      <div id="error-banner" className="hidden mt-1 rounded bg-rose-500/10 p-2">
        <div className="error-title text-xs font-semibold text-rose-600 dark:text-rose-400">Game Failed</div>
        <div id="error-message" className="text-[10px] text-rose-600/80 dark:text-rose-400/80 mt-0.5"></div>
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
      className="fixed inset-0 top-14 flex flex-col overflow-hidden bg-background" 
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
          <div className="px-3 py-8 text-center text-muted-foreground">
            {emptyMessage}
          </div>
        )}
      </div>
      
      {/* Floating pill at bottom */}
      <div id="new-messages-pill" className="hidden absolute bottom-6 left-1/2 -translate-x-1/2 items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-[11px] font-medium rounded-full cursor-pointer hover:bg-blue-700 transition-all shadow-lg z-10">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        <span id="new-messages-count">0</span>
        <span>new</span>
      </div>

      {/* Game End overlay */}
      <div id="game-end" className="hidden"></div>
    </div>
  );
}

