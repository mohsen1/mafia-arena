/**
 * Live game client-side script.
 * Handles WebSocket connection, polling fallback, and real-time game state updates.
 */

// =============================================================================
// Types
// =============================================================================

export interface LiveGameConfig {
  gameId: string;
  apiUrl: string;
}

interface GameEvent {
  type: string;
  phase?: string;
  round?: number;
  playerId?: string;
  playerName?: string;
  modelId?: string;
  team?: 'mafia' | 'town';
  winner?: 'mafia' | 'town';
  response?: {
    raw?: string;
    parsed?: unknown;
    usage?: { total_tokens?: number };
  };
  tokensUsed?: { input: number; output: number };
  latencyMs?: number;
  rawResponse?: string;
  persona?: { name?: string; background?: string };
  roundRangeSummarized?: [number, number];
  tokensSaved?: number;
}

interface PlayerInfo {
  playerId: string;
  playerName: string;
  modelId: string;
  team: 'mafia' | 'town';
  isAlive: boolean;
  persona?: { name?: string; background?: string };
}

interface WsMessage {
  type: 'SYNC' | 'EVENT' | 'STATUS' | 'ERROR';
  events?: GameEvent[];
  event?: GameEvent;
  status?: 'idle' | 'running' | 'completed' | 'failed';
  error?: string;
  gameId?: string;
  startedAt?: number;
  durationMs?: number;
  /** Current suspense reason - which model/player game is waiting for */
  suspenseReason?: string | null;
  /** When game started waiting for current AI call */
  suspenseStartedAt?: number | null;
  /** AI progress info for UI */
  aiProgress?: {
    cachedResponses: number;
    expectedPlayers: number | null;
    progressText: string;
  };
}

interface HealthCheckResponse {
  healthStatus: 'healthy' | 'warning' | 'critical' | 'idle' | 'completed';
  healthMessage: string;
  aiProgress?: {
    cachedResponses: number;
    expectedPlayers: number | null;
    progressText: string;
  };
  execution?: {
    currentPhase: string | null;
    currentRound: number | null;
    startedAt: number | null;
    durationMs: number | null;
  };
  /** Human-readable reason for why game is suspended (waiting for which model/player) */
  suspenseReason?: string | null;
  /** Recommended action for stuck games */
  recommendedAction?: 'none' | 'punt' | 'fail';
}

type PhaseType = 'introduction' | 'night' | 'mafia_chat' | 'day_discussion' | 'day_vote';

// =============================================================================
// Constants
// =============================================================================

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_POLL_DELAY = 1500;
const MAX_POLL_DELAY = 15000;
const HEALTH_CHECK_INTERVAL = 30000;
const HEALTH_CHECK_INTERVAL_STUCK = 10000; // More frequent when 0 events (likely stuck)

// Icons as inline SVG strings (required for non-module bundling)
const ICONS: Record<string, string> = {
  moon: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  sun: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  swords: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/></svg>',
  vote: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 12 2 2 4-4"/><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"/><path d="M22 19H2"/></svg>',
  message: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
  skull: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M8 20v2h8v-2"/><path d="m12.5 17-.5-1-.5 1h1z"/><path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20"/></svg>',
  trophy: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
  chevronRight: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  chevronDown: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  crosshair: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/></svg>',
  zap: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>',
};

// =============================================================================
// State
// =============================================================================

class LiveGameState {
  ws: WebSocket | null = null;
  events: GameEvent[] = [];
  playerMap: Record<string, PlayerInfo> = {};
  eliminatedPlayers = new Set<string>();
  reconnectAttempts = 0;
  startTime: number | null = null;
  durationInterval: ReturnType<typeof setInterval> | null = null;
  pollInterval: ReturnType<typeof setTimeout> | null = null;
  lastPollEventCount = 0;
  currentPollDelay = BASE_POLL_DELAY;
  consecutivePollErrors = 0;
  lastHealthCheck = 0;
  gameHealthy = true;
  totalTokens = 0;
  pendingNewMessages = 0;
  /** Last known health status for change detection */
  lastHealthStatus: HealthCheckResponse['healthStatus'] | null = null;
  /** Whether we're showing the stuck/critical warning banner */
  showingCriticalWarning = false;

  constructor(public config: LiveGameConfig) {}

  cleanup(): void {
    if (this.ws) this.ws.close(1000);
    if (this.pollInterval) clearTimeout(this.pollInterval);
    if (this.durationInterval) clearInterval(this.durationInterval);
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

function escapeHtml(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'string' ? val : String(val);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/`/g, '&#96;');
}

function getPhaseConfig(phase: string | undefined): { label: string; icon: string; color: string } {
  const configs: Record<PhaseType, { label: string; icon: string; color: string }> = {
    introduction: { label: 'Intro', icon: ICONS.message, color: 'text-foreground' },
    night: { label: 'Night', icon: ICONS.moon, color: 'text-indigo-400' },
    mafia_chat: { label: 'Mafia Chat', icon: ICONS.swords, color: 'text-rose-500' },
    day_discussion: { label: 'Discussion', icon: ICONS.sun, color: 'text-amber-500' },
    day_vote: { label: 'Vote', icon: ICONS.vote, color: 'text-emerald-500' },
  };
  if (!phase) return { label: 'Starting', icon: ICONS.message, color: 'text-muted-foreground' };
  return configs[phase as PhaseType] || { label: phase, icon: ICONS.message, color: 'text-foreground' };
}

function getProviderColor(modelId: string | undefined): string {
  if (!modelId) return '#888';
  if (modelId.includes('gpt') || modelId.includes('o1') || modelId.includes('o3')) return '#10a37f';
  if (modelId.includes('claude')) return '#d97706';
  if (modelId.includes('gemini')) return '#4285f4';
  if (modelId.includes('llama') || modelId.includes('deepseek')) return '#6366f1';
  return '#888';
}

function getShortModelName(modelId: string | undefined): string {
  if (!modelId) return '?';
  let name = modelId.split('/').pop() || modelId;
  if (name.includes(': ')) {
    name = name.split(': ').slice(1).join(': ');
  }
  return name.replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/@.*$/, '');
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function getProviderFromModel(modelId: string | undefined): string | null {
  if (!modelId) return null;
  if (modelId.includes('gpt') || modelId.includes('o1') || modelId.includes('o3')) return 'OpenAI';
  if (modelId.includes('claude')) return 'Anthropic';
  if (modelId.includes('gemini')) return 'Google';
  if (modelId.includes('deepseek')) return 'DeepSeek';
  if (modelId.includes('llama')) return 'Meta';
  return null;
}

function getProviderBadgeClass(provider: string): string {
  const classes: Record<string, string> = {
    OpenAI: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    Anthropic: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    Google: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    DeepSeek: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    Meta: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  };
  return classes[provider] || 'bg-muted text-muted-foreground';
}

// =============================================================================
// UI Update Functions
// =============================================================================

function updateConnectionStatus(
  connected: boolean,
  message: string,
  options: { warning?: boolean; polling?: boolean } = {}
): void {
  const el = document.getElementById('connection-status');
  if (!el) return;

  if (connected) {
    if (options.warning) {
      el.innerHTML = `
        <div class="flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <span id="poll-heartbeat" class="relative flex h-2 w-2">
            <span class="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 heartbeat-ping"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
          <span>${message || 'Warning'}</span>
          <span id="poll-event-flash" class="hidden text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 font-medium transition-all duration-300">+1</span>
        </div>`;
    } else if (options.polling) {
      el.innerHTML = `
        <div class="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <span id="poll-heartbeat" class="relative flex h-2 w-2">
            <span class="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 heartbeat-ping"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>${message || 'Polling mode'}</span>
          <span id="poll-event-flash" class="hidden text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500 font-medium transition-all duration-300">+1</span>
        </div>`;
    } else {
      el.innerHTML = `<div class="flex items-center gap-2 text-emerald-600 dark:text-emerald-400"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>${message || 'Connected'}</div>`;
    }
  } else {
    el.innerHTML = `<div class="flex items-center gap-2 text-muted-foreground"><span class="w-3 h-3 animate-spin">${ICONS.message}</span>${message || 'Connecting...'}</div>`;
  }
}

function triggerHeartbeat(): void {
  const heartbeat = document.getElementById('poll-heartbeat');
  if (!heartbeat) return;

  const ping = heartbeat.querySelector('.heartbeat-ping');
  if (ping) {
    ping.classList.remove('heartbeat-ping');
    void (ping as HTMLElement).offsetWidth;
    ping.classList.add('heartbeat-ping');
  }
}

function showEventFlash(state: LiveGameState, count: number): void {
  const flash = document.getElementById('poll-event-flash');
  if (flash) {
    flash.textContent = `+${count}`;
    flash.classList.remove('hidden');
    flash.classList.add('scale-110');

    setTimeout(() => flash.classList.remove('scale-110'), 100);
    setTimeout(() => flash.classList.add('hidden'), 1500);
  }

  state.pendingNewMessages += count;
  showNewMessagesPill(state);
}

function showNewMessagesPill(state: LiveGameState): void {
  const pill = document.getElementById('new-messages-pill');
  const countEl = document.getElementById('new-messages-count');
  if (!pill || !countEl) return;

  if (state.pendingNewMessages > 0) {
    countEl.textContent = String(state.pendingNewMessages);
    pill.classList.remove('hidden');
    pill.classList.add('flex');
  }
}

function hideNewMessagesPill(state: LiveGameState): void {
  const pill = document.getElementById('new-messages-pill');
  if (!pill) return;

  pill.classList.add('hidden');
  pill.classList.remove('flex');
  state.pendingNewMessages = 0;
}

function scrollToLatest(state: LiveGameState): void {
  const container = document.getElementById('transcript-container');
  if (!container) return;

  container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  hideNewMessagesPill(state);
}

function updateLiveBadge(status: string): void {
  const badge = document.getElementById('live-badge');
  if (!badge) return;

  if (status === 'running') {
    badge.className = 'flex items-center gap-2 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-bold tracking-wider uppercase';
    badge.innerHTML = `<span class="relative flex h-2 w-2"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span></span>LIVE`;
  } else if (status === 'completed') {
    badge.className = 'flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold tracking-wider uppercase';
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span>COMPLETED`;
  } else if (status === 'failed') {
    badge.className = 'flex items-center gap-2 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-bold tracking-wider uppercase';
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500"></span>FAILED`;
  } else {
    badge.className = 'flex items-center gap-2 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold tracking-wider uppercase';
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>STARTING`;
  }
}

function updateTelemetry(state: LiveGameState): void {
  let currentPhase: string | null = null;
  let currentRound: number | null = null;
  state.totalTokens = 0;

  state.events.forEach(e => {
    if (e.round) currentRound = e.round;
    if (e.phase) currentPhase = e.phase;

    if (e.type === 'ai_call' && e.response?.usage) {
      state.totalTokens += e.response.usage.total_tokens || 0;
    } else if (e.type === 'ai_call' && e.response?.raw) {
      state.totalTokens += Math.ceil(e.response.raw.length / 4);
    }
  });

  const tokenEl = document.getElementById('token-display');
  if (tokenEl) tokenEl.textContent = state.totalTokens.toLocaleString();

  const roundEl = document.getElementById('round-display');
  if (roundEl) roundEl.textContent = currentRound !== null ? String(currentRound) : '-';

  const phaseEl = document.getElementById('phase-display');
  if (phaseEl) {
    const config = getPhaseConfig(currentPhase ?? undefined);
    phaseEl.innerHTML = `
      <span class="${config.color}">${config.icon}</span>
      <span class="truncate ${config.color}">${config.label}</span>
    `;
  }
}

function updateDuration(state: LiveGameState): void {
  const el = document.getElementById('duration-display');
  if (!el || !state.startTime) return;
  const duration = Date.now() - state.startTime;
  el.textContent = formatDuration(duration);
}

function buildPlayerFromEvent(state: LiveGameState, event: GameEvent): void {
  // Handle game_start event to populate all players immediately
  // This ensures all players (including mafia) are visible from the start
  if (event.type === 'game_start') {
    const gameStartEvent = event as GameEvent & { players?: { id: string; name: string; modelId: string; team: 'mafia' | 'town'; persona?: { name?: string } }[] };
    if (gameStartEvent.players) {
      for (const p of gameStartEvent.players) {
        if (!state.playerMap[p.id]) {
          state.playerMap[p.id] = {
            playerId: p.id,
            playerName: p.persona?.name || p.name || p.id,
            modelId: p.modelId || '',
            team: p.team || 'town',
            isAlive: true,
            persona: p.persona as PlayerInfo['persona'],
          };
        }
      }
    }
    return;
  }

  if (event.type === 'ai_call' && event.playerId) {
    if (!state.playerMap[event.playerId]) {
      state.playerMap[event.playerId] = {
        playerId: event.playerId,
        playerName: event.playerName || event.playerId,
        modelId: event.modelId || '',
        team: event.team || 'town',
        isAlive: true,
      };
    } else {
      // Only update metadata if missing, don't overwrite name if we already have a persona name
      const p = state.playerMap[event.playerId];
      if (!p.modelId) p.modelId = event.modelId || '';
      if (!p.team) p.team = event.team || 'town';
      
      // Only update name if current name looks like a fallback ID and we don't have a persona yet
      const newName = event.playerName;
      const currentIsIdName = p.playerName === event.playerId || p.playerName.startsWith('player_');
      if (newName && currentIsIdName && !p.persona) {
        p.playerName = newName;
      }
    }
  }

  if (event.type === 'persona_generation' && event.playerId) {
    if (!state.playerMap[event.playerId]) {
      state.playerMap[event.playerId] = {
        playerId: event.playerId,
        playerName: event.playerName || event.playerId,
        team: 'town',
        modelId: '',
        isAlive: true,
      };
    }
    state.playerMap[event.playerId].persona = event.persona;
    // Always trust persona name over everything else
    if (event.persona?.name) {
      state.playerMap[event.playerId].playerName = event.persona.name;
    }
  }

  if (event.type === 'elimination' && event.playerId) {
    state.eliminatedPlayers.add(event.playerId);
    if (state.playerMap[event.playerId]) {
      state.playerMap[event.playerId].isAlive = false;
    }
  }
}

function updateTeamsDisplay(state: LiveGameState): void {
  const players = Object.values(state.playerMap);
  if (players.length === 0) return;

  const mafiaPlayers = players.filter(p => p.team === 'mafia');
  const townPlayers = players.filter(p => p.team === 'town');

  const mafiaModels = [...new Set(mafiaPlayers.map(p => getShortModelName(p.modelId)))];
  const townModels = [...new Set(townPlayers.map(p => getShortModelName(p.modelId)))];

  const allModels = players.map(p => p.modelId);
  const providers = [...new Set(allModels.map(getProviderFromModel).filter((p): p is string => p !== null))];

  const mafiaEl = document.getElementById('mafia-models');
  const townEl = document.getElementById('town-models');
  const providersEl = document.getElementById('providers-display');

  function formatModelName(name: string): string {
    return name.split('-').map(part => {
      if (part.match(/^\d/)) return part;
      if (part === 'gpt' || part === 'o1' || part === 'o3') return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join(' ');
  }

  if (mafiaEl) mafiaEl.textContent = mafiaModels.map(formatModelName).join(', ') || '—';
  if (townEl) townEl.textContent = townModels.map(formatModelName).join(', ') || '—';

  if (providersEl && providers.length > 0) {
    providersEl.innerHTML = providers.map(provider =>
      `<span class="text-[10px] px-1.5 py-0.5 rounded font-medium ${getProviderBadgeClass(provider)}">${provider}</span>`
    ).join('');
  }

  const mafiaCountEl = document.getElementById('mafia-count');
  const townCountEl = document.getElementById('town-count');
  if (mafiaCountEl) mafiaCountEl.textContent = String(mafiaPlayers.length);
  if (townCountEl) townCountEl.textContent = String(townPlayers.length);
}

function updatePlayersGrid(state: LiveGameState): void {
  const section = document.getElementById('players-section');
  const grid = document.getElementById('players-grid');
  if (!section || !grid) return;

  const players = Object.values(state.playerMap);
  if (players.length === 0) return;

  section.classList.remove('hidden');

  players.sort((a, b) => {
    if (a.team !== b.team) return a.team === 'mafia' ? -1 : 1;
    return a.isAlive === b.isAlive ? 0 : a.isAlive ? -1 : 1;
  });

  grid.innerHTML = players.map(player => {
    const isMafia = player.team === 'mafia';
    const isAlive = player.isAlive;

    const borderClass = isMafia
      ? (isAlive ? 'border-rose-500/40 bg-rose-500/10' : 'border-rose-500/20 bg-rose-500/5 border-dashed')
      : (isAlive ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-indigo-500/20 bg-indigo-500/5 border-dashed');

    const textClass = isMafia ? 'text-rose-600 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-400';
    const opacityClass = isAlive ? '' : 'opacity-50';

    return `
      <div class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] ${borderClass} ${opacityClass} transition-all">
        ${!isAlive ? `<span class="text-muted-foreground opacity-60">${ICONS.skull}</span>` : `<span class="w-1.5 h-1.5 rounded-full ${isMafia ? 'bg-rose-500' : 'bg-indigo-500'}"></span>`}
        <span class="font-semibold ${textClass} truncate max-w-[120px]">${player.playerName}</span>
      </div>
    `;
  }).join('');
}

function parseResponse(raw: string | undefined): { type: string; content: unknown } {
  if (!raw) return { type: 'raw', content: '' };
  try {
    const parsed = JSON.parse(raw);
    if (parsed.message) return { type: 'message', content: parsed.message };
    if (parsed.vote !== undefined) return { type: 'vote', content: parsed };
    if (parsed.action && parsed.target) return { type: 'action', content: parsed };
    if (parsed.name && parsed.background) return { type: 'persona', content: parsed };
    return { type: 'raw', content: raw };
  } catch {
    return { type: 'raw', content: raw?.replace(/^["']|["']$/g, '').trim() || '' };
  }
}

function getPersonaName(state: LiveGameState, playerId: string): string {
  return state.playerMap[playerId]?.playerName || playerId;
}

function renderEvent(state: LiveGameState, event: GameEvent): string {
  const player = state.playerMap[event.playerId || ''];
  const team = event.team || player?.team || 'town';
  const isMafia = team === 'mafia';

  if (event.type === 'ai_call') {
    const parsed = parseResponse(event.response?.raw);
    if (parsed.type === 'persona') return '';

    const nameClass = isMafia ? 'text-rose-600 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-400';

    let content = '';
    if (parsed.type === 'message') {
      content = `<p class="text-xs text-foreground/90 leading-relaxed mt-0.5">${escapeHtml(parsed.content)}</p>`;
    } else if (parsed.type === 'vote') {
      const voteContent = parsed.content as { vote: string; reasoning?: string };
      const targetTeam = state.playerMap[voteContent.vote]?.team || 'town';
      const targetClass = targetTeam === 'mafia' ? 'text-rose-500' : 'text-indigo-500';
      content = `
        <div class="text-xs mt-0.5">
          <span class="inline-flex items-center gap-1 text-muted-foreground">
            ${ICONS.vote} Voted for <span class="font-semibold ${targetClass}">${escapeHtml(getPersonaName(state, voteContent.vote))}</span>
          </span>
          ${voteContent.reasoning ? `
            <details class="mt-0.5 text-[10px] text-muted-foreground">
              <summary class="cursor-pointer hover:text-foreground transition-colors inline-flex items-center gap-0.5">
                ${ICONS.chevronRight} reason
              </summary>
              <p class="mt-0.5 pl-3 italic opacity-70">"${escapeHtml(voteContent.reasoning)}"</p>
            </details>
          ` : ''}
        </div>
      `;
    } else if (parsed.type === 'action') {
      const actionContent = parsed.content as { action: string; target: string; reasoning?: string };
      const targetTeam = state.playerMap[actionContent.target]?.team || 'town';
      const targetClass = targetTeam === 'mafia' ? 'text-rose-500' : 'text-indigo-500';
      content = `
        <div class="text-xs mt-0.5">
          <span class="inline-flex items-center gap-1">
            <span class="${actionContent.action === 'kill' ? 'text-rose-500' : 'text-muted-foreground'}">${ICONS.crosshair}</span>
            <span class="text-muted-foreground">${escapeHtml(actionContent.action)}</span>
            <span class="font-semibold ${targetClass}">${escapeHtml(getPersonaName(state, actionContent.target))}</span>
          </span>
          ${actionContent.reasoning ? `
            <details class="mt-0.5 text-[10px] text-muted-foreground">
              <summary class="cursor-pointer hover:text-foreground transition-colors inline-flex items-center gap-0.5">
                ${ICONS.chevronRight} reason
              </summary>
              <p class="mt-0.5 pl-3 italic opacity-70">"${escapeHtml(actionContent.reasoning)}"</p>
            </details>
          ` : ''}
        </div>
      `;
    } else {
      content = `<p class="text-xs text-foreground/90 leading-relaxed mt-0.5">${escapeHtml(parsed.content)}</p>`;
    }

    return `
      <div class="group/msg py-1.5">
        <div class="flex items-baseline gap-1.5 mb-0.5">
          <span class="w-1.5 h-1.5 rounded-full shrink-0 ${isMafia ? 'bg-rose-500' : 'bg-indigo-500'}"></span>
          <span class="font-semibold text-xs ${nameClass}">${event.playerName}</span>
          <span class="text-[9px] text-muted-foreground/40 opacity-0 group-hover/msg:opacity-100 transition-opacity flex items-center gap-0.5">
            <span class="w-1 h-1 rounded-full" style="background: ${getProviderColor(event.modelId)}"></span>
            ${getShortModelName(event.modelId)}
          </span>
        </div>
        ${content}
      </div>
    `;
  }

  if (event.type === 'elimination') {
    const elimTeam = event.team || state.playerMap[event.playerId || '']?.team || 'town';
    const isElimMafia = elimTeam === 'mafia';
    const bgClass = isElimMafia ? 'bg-rose-500/10 border-rose-500/20' : 'bg-indigo-500/10 border-indigo-500/20';
    const textClass = isElimMafia ? 'text-rose-600 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-400';
    const badgeClass = isElimMafia ? 'bg-rose-500/20 text-rose-600' : 'bg-indigo-500/20 text-indigo-600';

    return `
      <div class="flex items-center gap-2 py-1.5 px-2 rounded text-xs ${bgClass} border">
        <span class="${textClass}">${ICONS.skull}</span>
        <span class="font-medium ${textClass}">${event.playerName || getPersonaName(state, event.playerId || '')}</span>
        <span class="text-muted-foreground">eliminated</span>
        <span class="ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium ${badgeClass}">${elimTeam}</span>
      </div>
    `;
  }

  if (event.type === 'summarization') {
    const [roundStart, roundEnd] = event.roundRangeSummarized || [1, 1];
    const tokensSaved = event.tokensSaved?.toLocaleString() || '0';
    return `
      <div class="flex items-center gap-2 py-1.5 px-2 rounded text-xs bg-amber-500/10 border border-amber-500/20">
        <span class="text-amber-500">${ICONS.zap}</span>
        <span class="text-amber-600 dark:text-amber-400">
          Rounds ${roundStart}-${roundEnd} summarized
        </span>
        <span class="text-muted-foreground text-[10px]">
          (${tokensSaved} tokens saved)
        </span>
        <span class="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">
          context optimization
        </span>
      </div>
    `;
  }

  return '';
}

function renderTranscript(state: LiveGameState): void {
  const container = document.getElementById('transcript-container');
  if (!container) return;

  const validEvents = state.events.filter(e => e.type !== 'persona_generation' && e.phase && e.phase !== 'other');

  if (validEvents.length === 0) {
    container.innerHTML = '<div class="px-3 py-6 text-center text-muted-foreground">Waiting for events...</div>';
    return;
  }

  const grouped: Record<number, Record<string, GameEvent[]>> = {};
  for (const event of validEvents) {
    if (event.type === 'game_end') continue;
    const round = event.round || 1;
    const phase = event.phase || 'unknown';
    if (!grouped[round]) grouped[round] = {};
    if (!grouped[round][phase]) grouped[round][phase] = [];
    grouped[round][phase].push(event);
  }

  const rounds = Object.keys(grouped).map(Number).sort((a, b) => a - b);
  const lastRound = rounds[rounds.length - 1];

  let html = '<div class="space-y-1.5">';

  for (const round of rounds) {
    const isLastRound = round === lastRound;
    html += `
      <details class="group border-b last:border-0" ${isLastRound ? 'open' : ''}>
        <summary class="flex items-center justify-between px-3 py-2 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
          <div class="flex items-center gap-2">
            <span class="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-[10px] font-bold">${round}</span>
            <span class="font-medium">Round ${round}</span>
            <div class="flex items-center gap-0.5 ml-1 text-muted-foreground">
              ${Object.keys(grouped[round]).map(phase => `<span title="${getPhaseConfig(phase).label}">${getPhaseConfig(phase).icon}</span>`).join('')}
            </div>
          </div>
          <span class="transition-transform duration-200 group-open:rotate-180">${ICONS.chevronDown}</span>
        </summary>
        <div class="divide-y divide-border/50">
    `;

    for (const [phase, phaseEvents] of Object.entries(grouped[round])) {
      const config = getPhaseConfig(phase);
      const isNight = phase === 'night' || phase === 'mafia_chat';

      html += `
        <div class="px-3 py-2 space-y-1.5 ${isNight ? 'bg-rose-500/3' : ''}">
          <div class="flex items-center gap-2 text-[10px] text-muted-foreground">
            ${config.icon}
            <span class="font-medium uppercase tracking-wide">${config.label}</span>
            <span class="opacity-50">·</span>
            <span class="opacity-50">${phaseEvents.length}</span>
          </div>
          <div class="space-y-1">
            ${phaseEvents.map(e => renderEvent(state, e)).join('')}
          </div>
        </div>
      `;
    }

    html += '</div></details>';
  }

  html += '</div>';
  container.innerHTML = html;
}

function showGameEnd(winner: 'mafia' | 'town'): void {
  const el = document.getElementById('game-end');
  if (!el) return;

  const winnerClass = winner === 'mafia' ? 'bg-rose-500/10 border-rose-500/30 text-rose-500' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-500';

  el.className = `text-center py-4 rounded-md border ${winnerClass}`;
  el.innerHTML = `
    <span class="inline-block mb-1">${ICONS.trophy}</span>
    <div class="text-sm font-bold">${winner === 'mafia' ? 'Mafia' : 'Town'} Wins</div>
  `;
  el.classList.remove('hidden');
}

/**
 * Format error message for user display.
 * Categorizes errors and provides helpful context.
 */
function formatErrorForUser(rawError: string): { title: string; message: string; suggestion?: string } {
  const error = rawError.toLowerCase();
  
  // Quota/billing errors
  if (error.includes('quota') || error.includes('billing') || error.includes('limit: 0')) {
    return {
      title: 'Model Not Available',
      message: rawError,
      suggestion: 'Try starting a new game with a different model (e.g., Gemini 2.5 Flash).',
    };
  }
  
  // Authentication errors
  if (error.includes('api key') || error.includes('invalid api') || error.includes('access denied')) {
    return {
      title: 'API Key Issue',
      message: rawError,
      suggestion: 'Check your API key configuration in settings.',
    };
  }
  
  // Model not found
  if (error.includes('not found') || error.includes('unsupported') || error.includes('not supported')) {
    return {
      title: 'Model Unavailable',
      message: rawError,
      suggestion: 'This model may have been deprecated. Try a different model.',
    };
  }
  
  // Timeout
  if (error.includes('timeout') || error.includes('timed out')) {
    return {
      title: 'AI Timeout',
      message: rawError,
      suggestion: 'The AI provider took too long to respond. This is usually temporary.',
    };
  }
  
  // Network errors
  if (error.includes('network') || error.includes('fetch') || error.includes('connection')) {
    return {
      title: 'Connection Error',
      message: rawError,
      suggestion: 'Check your internet connection and try again.',
    };
  }
  
  // Persistence errors (from our fix)
  if (error.includes('persistence failure') || error.includes('checkpoint')) {
    return {
      title: 'Internal Error',
      message: 'Failed to save game state.',
      suggestion: 'This is a temporary infrastructure issue. Please try again.',
    };
  }
  
  // Default
  return {
    title: 'Game Failed',
    message: rawError || 'An unexpected error occurred.',
  };
}

function showError(errorMessage: string): void {
  const banner = document.getElementById('error-banner');
  const messageEl = document.getElementById('error-message');
  if (!banner || !messageEl) return;

  const formatted = formatErrorForUser(errorMessage);
  
  // Update error title if element exists
  const titleEl = banner.querySelector('.error-title');
  if (titleEl) {
    titleEl.textContent = formatted.title;
  }
  
  // Show formatted message with suggestion
  messageEl.innerHTML = `
    <div>${escapeHtml(formatted.message)}</div>
    ${formatted.suggestion ? `<div class="mt-1 text-[11px] opacity-70">${escapeHtml(formatted.suggestion)}</div>` : ''}
  `;
  banner.classList.remove('hidden');

  // Hide warning banner if showing
  const warningBanner = document.getElementById('warning-banner');
  if (warningBanner) warningBanner.classList.add('hidden');

  const connectionStatus = document.getElementById('connection-status');
  if (connectionStatus) {
    connectionStatus.classList.add('hidden');
  }
}

/**
 * Show/hide a warning banner for stuck/slow games (non-fatal).
 * This helps users understand why a game appears frozen.
 */
function showWarningBanner(
  show: boolean, 
  message?: string, 
  details?: { suspenseReason?: string | null; aiProgress?: string }
): void {
  let banner = document.getElementById('warning-banner');
  
  if (!show) {
    if (banner) banner.classList.add('hidden');
    return;
  }
  
  // Create banner if it doesn't exist (inject after connection-status)
  if (!banner) {
    const connectionStatus = document.getElementById('connection-status');
    if (!connectionStatus) return;
    
    banner = document.createElement('div');
    banner.id = 'warning-banner';
    banner.className = 'rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2';
    connectionStatus.parentNode?.insertBefore(banner, connectionStatus.nextSibling);
  }
  
  const suspenseHtml = details?.suspenseReason 
    ? `<div class="text-[11px] text-amber-600/80 dark:text-amber-400/80 font-mono mt-1">${escapeHtml(details.suspenseReason)}</div>` 
    : '';
  
  const progressHtml = details?.aiProgress 
    ? `<div class="text-[11px] text-amber-600/70 dark:text-amber-400/70 mt-0.5">${escapeHtml(details.aiProgress)}</div>` 
    : '';
  
  banner.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="shrink-0 text-amber-500">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>
          <path d="M12 9v4"/><path d="M12 17h.01"/>
        </svg>
      </div>
      <div class="space-y-0.5 min-w-0 flex-1">
        <div class="text-sm font-semibold text-amber-600 dark:text-amber-400">${escapeHtml(message || 'Game may be stuck')}</div>
        ${suspenseHtml}
        ${progressHtml}
      </div>
    </div>
  `;
  banner.classList.remove('hidden');
}

// =============================================================================
// Message Handlers
// =============================================================================

function handleMessage(state: LiveGameState, data: WsMessage): void {
  if (data.type === 'SYNC') {
    state.events = data.events || [];
    state.lastPollEventCount = state.events.length;
    state.events.forEach(e => buildPlayerFromEvent(state, e));
    updateTeamsDisplay(state);
    updatePlayersGrid(state);
    renderTranscript(state);
    updateTelemetry(state);
    updateConnectionStatus(true, `Synced ${state.events.length} events`);

    if (data.startedAt && !state.startTime) {
      state.startTime = data.startedAt;
      updateDuration(state);
    }

    if (data.status === 'completed' || data.status === 'failed') {
      updateLiveBadge(data.status);
      if (state.durationInterval) clearInterval(state.durationInterval);

      if (data.durationMs) {
        const el = document.getElementById('duration-display');
        if (el) el.textContent = formatDuration(data.durationMs);
      }

      if (data.status === 'completed') {
        const gameEnd = state.events.find(e => e.type === 'game_end');
        if (gameEnd?.winner) showGameEnd(gameEnd.winner);
      } else if (data.status === 'failed') {
        showError(data.error || 'Unknown error');
      }
    } else if (data.status === 'idle') {
      updateLiveBadge('idle');
    }
  } else if (data.type === 'EVENT' && data.event) {
    const event = data.event;
    state.events.push(event);
    buildPlayerFromEvent(state, event);
    updateTeamsDisplay(state);
    updatePlayersGrid(state);
    renderTranscript(state);
    updateTelemetry(state);
    updateLiveBadge('running');

    if (event.type === 'game_end' && event.winner) {
      showGameEnd(event.winner);
      updateLiveBadge('completed');
      if (state.durationInterval) clearInterval(state.durationInterval);
    }
  } else if (data.type === 'STATUS') {
    if (data.status) updateLiveBadge(data.status);
    if (data.status === 'failed' && data.error) {
      showError(data.error);
      if (state.durationInterval) clearInterval(state.durationInterval);
    }
    // Show AI progress when game is waiting for AI response
    if (data.status === 'running' && data.suspenseReason) {
      const waitTime = data.suspenseStartedAt 
        ? Math.round((Date.now() - data.suspenseStartedAt) / 1000) 
        : 0;
      const progressText = data.aiProgress?.progressText || '';
      const waitTimeText = waitTime > 0 ? ` (${waitTime}s)` : '';
      updateConnectionStatus(true, `Waiting for AI${waitTimeText}`, { polling: true });
      showWarningBanner(false); // Clear any existing warning
      // Show detailed AI progress in connection status area
      const statusEl = document.getElementById('connection-status');
      if (statusEl && data.aiProgress) {
        statusEl.innerHTML = `
          <div class="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <span id="poll-heartbeat" class="relative flex h-2 w-2">
              <span class="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 heartbeat-ping"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span>${data.aiProgress.progressText}${waitTimeText}</span>
          </div>
          <div class="text-[10px] text-muted-foreground/70 mt-0.5">${escapeHtml(data.suspenseReason)}</div>
        `;
      }
    } else if (data.status === 'running' && !data.suspenseReason) {
      // Game is running but not waiting for AI - show normal status
      updateConnectionStatus(true, 'Connected');
    }
  } else if (data.type === 'ERROR') {
    updateLiveBadge('failed');
    showError(data.error || 'Unknown error');
    if (state.durationInterval) clearInterval(state.durationInterval);
  }
}

// =============================================================================
// Connection Functions
// =============================================================================

function connect(state: LiveGameState): void {
  if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    updateConnectionStatus(false, 'Connection failed. Refresh to retry.');
    return;
  }

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = state.config.apiUrl.replace(/^https?/, wsProtocol) + `/api/games/${state.config.gameId}/live`;

  updateConnectionStatus(false, `Connecting (${state.reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`);

  try {
    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
      state.reconnectAttempts = 0;
      updateConnectionStatus(true, 'Connected');
      if (!state.durationInterval) {
        state.durationInterval = setInterval(() => updateDuration(state), 1000);
      }
    };

    state.ws.onmessage = (event) => {
      try {
        handleMessage(state, JSON.parse(event.data));
      } catch (e) {
        console.error('Parse error:', e);
      }
    };

    state.ws.onclose = (event) => {
      if (event.code !== 1000) {
        state.reconnectAttempts++;
        updateConnectionStatus(false, 'Reconnecting...');
        setTimeout(() => connect(state), Math.min(1000 * Math.pow(2, state.reconnectAttempts), 30000));
      }
    };

    state.ws.onerror = () => {
      fallbackToPolling(state);
    };
  } catch {
    fallbackToPolling(state);
  }
}

function fallbackToPolling(state: LiveGameState): void {
  updateConnectionStatus(true, 'Polling mode', { polling: true });
  if (!state.durationInterval) {
    state.durationInterval = setInterval(() => updateDuration(state), 1000);
  }

  state.currentPollDelay = BASE_POLL_DELAY;
  state.consecutivePollErrors = 0;

  async function poll(): Promise<void> {
    triggerHeartbeat();

    try {
      const res = await fetch(`${state.config.apiUrl}/api/games/${state.config.gameId}/events`);
      if (!res.ok) throw new Error('Failed');

      const data = await res.json() as {
        events?: GameEvent[];
        status?: string;
        startedAt?: number;
        durationMs?: number;
        error?: string;
      };

      state.consecutivePollErrors = 0;
      state.currentPollDelay = BASE_POLL_DELAY;

      if (data.startedAt && !state.startTime) {
        state.startTime = data.startedAt;
        updateDuration(state);
      }

      if (data.events && data.events.length > state.events.length) {
        const newEventCount = data.events.length - state.events.length;
        const isInitialLoad = state.events.length === 0;

        state.events = data.events;
        state.events.forEach(e => buildPlayerFromEvent(state, e));
        updateTeamsDisplay(state);
        updatePlayersGrid(state);
        renderTranscript(state);
        updateTelemetry(state);
        updateLiveBadge('running');

        if (!isInitialLoad && newEventCount > 0 && state.lastPollEventCount !== state.events.length) {
          showEventFlash(state, newEventCount);
          state.lastPollEventCount = state.events.length;
        } else {
          state.lastPollEventCount = state.events.length;
        }
      }

      if (data.status === 'completed' || data.status === 'failed') {
        updateLiveBadge(data.status);

        if (data.durationMs) {
          const el = document.getElementById('duration-display');
          if (el) el.textContent = formatDuration(data.durationMs);
        }

        if (data.status === 'completed') {
          const gameEnd = state.events.find(e => e.type === 'game_end');
          if (gameEnd?.winner) showGameEnd(gameEnd.winner);
        } else if (data.status === 'failed') {
          showError(data.error || 'Unknown error');
        }
        if (state.pollInterval) clearTimeout(state.pollInterval);
        if (state.durationInterval) clearInterval(state.durationInterval);
        return;
      }

      if (data.status === 'running' && Date.now() - state.lastHealthCheck > getHealthCheckInterval(state)) {
        checkGameHealth(state);
      }

      scheduleNextPoll();
    } catch (e) {
      console.error('Poll error:', e);
      state.consecutivePollErrors++;
      state.currentPollDelay = Math.min(state.currentPollDelay * 1.5, MAX_POLL_DELAY);
      updateConnectionStatus(true, `Polling (retry in ${Math.round(state.currentPollDelay / 1000)}s)`, { polling: true });
      scheduleNextPoll();
    }
  }

  function scheduleNextPoll(): void {
    if (state.pollInterval) clearTimeout(state.pollInterval);
    state.pollInterval = setTimeout(() => poll(), state.currentPollDelay);
  }

  poll();
}

async function checkGameHealth(state: LiveGameState): Promise<void> {
  state.lastHealthCheck = Date.now();
  try {
    const res = await fetch(`${state.config.apiUrl}/api/games/${state.config.gameId}/health`);
    const data = await res.json() as HealthCheckResponse;

    let statusMessage = data.healthMessage;
    if (data.aiProgress && data.aiProgress.cachedResponses > 0) {
      statusMessage = `${statusMessage} · ${data.aiProgress.progressText}`;
    }

    // Track health status changes for banner management
    const healthChanged = data.healthStatus !== state.lastHealthStatus;
    state.lastHealthStatus = data.healthStatus;

    if (data.healthStatus === 'critical') {
      state.gameHealthy = false;
      state.showingCriticalWarning = true;
      
      // Show prominent warning banner with details
      showWarningBanner(true, statusMessage, {
        suspenseReason: data.suspenseReason,
        aiProgress: data.aiProgress?.progressText,
      });
      
      updateConnectionStatus(true, 'Game stuck', { polling: true, warning: true });
      console.warn('Game health check failed:', data);
    } else if (data.healthStatus === 'warning') {
      // Show warning in connection status but not the big banner
      updateConnectionStatus(true, statusMessage, { polling: true, warning: true });
      
      // Hide critical banner if we recovered from critical
      if (state.showingCriticalWarning && healthChanged) {
        showWarningBanner(false);
        state.showingCriticalWarning = false;
      }
    } else if (data.aiProgress && data.aiProgress.cachedResponses > 0) {
      updateConnectionStatus(true, `Waiting for AI · ${data.aiProgress.progressText}`, { polling: true });
      
      // Hide critical banner if we recovered
      if (state.showingCriticalWarning) {
        showWarningBanner(false);
        state.showingCriticalWarning = false;
      }
    } else if (!state.gameHealthy || state.showingCriticalWarning) {
      state.gameHealthy = true;
      state.showingCriticalWarning = false;
      showWarningBanner(false);
      updateConnectionStatus(true, 'Polling mode', { polling: true });
    }
  } catch (e) {
    console.warn('Health check error:', e);
  }
}

/**
 * Get appropriate health check interval based on game state.
 * More frequent checks when game appears stuck (0 events).
 */
function getHealthCheckInterval(state: LiveGameState): number {
  // If 0 events and game has been running for > 30s, check more frequently
  if (state.events.length === 0 && state.startTime && Date.now() - state.startTime > 30000) {
    return HEALTH_CHECK_INTERVAL_STUCK;
  }
  return HEALTH_CHECK_INTERVAL;
}

// =============================================================================
// Main Export
// =============================================================================

export function initLiveGame(config: LiveGameConfig): LiveGameState {
  const state = new LiveGameState(config);

  // Setup new messages pill click handler
  const pill = document.getElementById('new-messages-pill');
  if (pill) {
    pill.addEventListener('click', () => scrollToLatest(state));
  }

  // Start connection
  connect(state);

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => state.cleanup());

  return state;
}

