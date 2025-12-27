/**
 * Batch monitor client-side script.
 * Handles fetching batch data, rendering UI, and auto-refresh for processing batches.
 */

// =============================================================================
// Types
// =============================================================================

interface BatchConfig {
  batchId: string;
  apiUrl: string;
}

interface BatchData {
  name?: string;
  status: BatchStatus;
  totalGames: number;
  completedGames: number;
  failedGames: number;
  progress: number;
  actualCostUsd: number;
  estimatedCostUsd?: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  errorMessage?: string;
  config?: Record<string, unknown>;
  recentGames?: GameInfo[];
}

interface GameInfo {
  id: string;
  status: string;
  winner?: 'mafia' | 'town';
  rounds?: number;
  duration_ms?: number;
  created_at?: number;
}

type BatchStatus = 'queued' | 'processing' | 'completed' | 'cancelled' | 'paused';

// =============================================================================
// Constants
// =============================================================================

const STATUS_COLORS: Record<BatchStatus, { text: string; darkText: string }> = {
  queued: { text: 'color: rgb(217 119 6)', darkText: 'color: rgb(251 191 36)' },
  processing: { text: 'color: rgb(37 99 235)', darkText: 'color: rgb(96 165 250)' },
  completed: { text: 'color: rgb(5 150 105)', darkText: 'color: rgb(52 211 153)' },
  cancelled: { text: 'color: var(--muted-foreground)', darkText: 'color: var(--muted-foreground)' },
  paused: { text: 'color: rgb(217 119 6)', darkText: 'color: rgb(251 191 36)' },
};

// =============================================================================
// Utility Functions
// =============================================================================

function getStatusStyle(status: BatchStatus): string {
  const isDark = document.documentElement.classList.contains('dark');
  const colors = STATUS_COLORS[status] || STATUS_COLORS.cancelled;
  return isDark ? colors.darkText : colors.text;
}

function formatDuration(ms: number): string {
  if (!ms || ms < 1000) return '< 1s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

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

// =============================================================================
// UI Functions
// =============================================================================

function showError(title: string, message: string, debug: { url?: string; status?: number; statusText?: string; body?: unknown } = {}): void {
  document.getElementById('loading')?.classList.add('hidden');
  document.getElementById('content')?.classList.add('hidden');
  document.getElementById('error')?.classList.remove('hidden');

  const errorTitle = document.getElementById('error-title');
  const errorText = document.getElementById('error-text');
  const debugTimestamp = document.getElementById('debug-timestamp');
  const debugUrl = document.getElementById('debug-url');
  const debugStatus = document.getElementById('debug-status');
  const debugBody = document.getElementById('debug-body');

  if (errorTitle) errorTitle.textContent = title || 'Error';
  if (errorText) errorText.textContent = message || 'An unknown error occurred';
  if (debugTimestamp) debugTimestamp.textContent = new Date().toISOString();
  if (debugUrl) debugUrl.textContent = debug.url || '—';
  if (debugStatus) debugStatus.textContent = debug.status !== undefined ? `${debug.status} ${debug.statusText || ''}` : '—';
  if (debugBody) debugBody.textContent = debug.body ? (typeof debug.body === 'string' ? debug.body : JSON.stringify(debug.body, null, 2)) : '—';
}

function renderBatch(batch: BatchData, config: BatchConfig): void {
  const recentGames = batch.recentGames || [];
  const sortedGames = [...recentGames].sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1;
    if (b.status === 'running' && a.status !== 'running') return 1;
    return (b.created_at || 0) - (a.created_at || 0);
  });

  const runningGames = sortedGames.filter(g => g.status === 'running');
  const completedTown = sortedGames.filter(g => g.status === 'completed' && g.winner === 'town').length;
  const completedMafia = sortedGames.filter(g => g.status === 'completed' && g.winner === 'mafia').length;
  const queuedCount = Math.max(0, (batch.totalGames || 0) - (batch.completedGames || 0) - (batch.failedGames || 0) - runningGames.length);

  const contentEl = document.getElementById('content');
  if (!contentEl) return;

  contentEl.innerHTML = buildBatchHTML(batch, config, sortedGames, runningGames, completedTown, completedMafia, queuedCount);

  // Setup cancel button
  setupCancelButton(config);
}

function buildBatchHTML(
  batch: BatchData,
  config: BatchConfig,
  sortedGames: GameInfo[],
  runningGames: GameInfo[],
  completedTown: number,
  completedMafia: number,
  queuedCount: number
): string {
  return `
    <!-- Header -->
    <div class="flex items-start justify-between gap-4 mb-8">
      <div class="min-w-0">
        <div class="flex items-center gap-3 mb-2">
          <h1 class="text-2xl font-bold tracking-tight truncate">${escapeHtml(batch.name || 'Unnamed Batch')}</h1>
          <span class="text-xs font-medium uppercase tracking-wide" style="${getStatusStyle(batch.status)}">${escapeHtml(batch.status)}</span>
          ${runningGames.length > 0 ? `
            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span class="relative flex h-1.5 w-1.5">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              ${runningGames.length} live
            </span>
          ` : ''}
        </div>
      </div>
      ${batch.status === 'processing' ? `
        <button id="cancelBtn" class="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded transition-colors">
          Cancel
        </button>
      ` : ''}
    </div>

    <!-- Progress Section -->
    <div class="mb-8 p-6 rounded-lg border bg-card">
      <div class="flex items-center justify-between mb-4">
        <span class="text-xs uppercase tracking-wider text-muted-foreground font-medium">Progress</span>
        <div class="flex items-baseline gap-1">
          <span class="text-3xl font-bold tabular-nums">${batch.progress}</span>
          <span class="text-lg text-muted-foreground">%</span>
        </div>
      </div>
      
      <div class="h-1.5 rounded-full overflow-hidden bg-muted mb-6">
        <div class="h-full bg-foreground/70 transition-all" style="width: ${batch.progress}%"></div>
      </div>
      
      <div class="grid grid-cols-3 gap-4 text-center">
        <div>
          <div class="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">${batch.completedGames}</div>
          <div class="text-xs text-muted-foreground uppercase tracking-wider mt-1">Completed</div>
        </div>
        <div>
          <div class="text-2xl font-bold tabular-nums ${batch.failedGames > 0 ? 'text-red-500' : 'text-muted-foreground'}">${batch.failedGames}</div>
          <div class="text-xs text-muted-foreground uppercase tracking-wider mt-1">Failed</div>
        </div>
        <div>
          <div class="text-2xl font-bold tabular-nums">${batch.totalGames}</div>
          <div class="text-xs text-muted-foreground uppercase tracking-wider mt-1">Total</div>
        </div>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div class="space-y-1">
        <div class="text-xs uppercase tracking-wider text-muted-foreground font-medium">Cost</div>
        <div class="text-xl font-bold tabular-nums">$${batch.actualCostUsd.toFixed(4)}</div>
        ${batch.estimatedCostUsd ? `<div class="text-xs text-muted-foreground">/ $${batch.estimatedCostUsd.toFixed(2)} est</div>` : ''}
      </div>
      
      <div class="space-y-1">
        <div class="text-xs uppercase tracking-wider text-muted-foreground font-medium">Created</div>
        <div class="text-sm font-medium">${new Date(batch.createdAt * 1000).toLocaleDateString()}</div>
        <div class="text-xs text-muted-foreground">${new Date(batch.createdAt * 1000).toLocaleTimeString()}</div>
      </div>
      
      <div class="space-y-1">
        <div class="text-xs uppercase tracking-wider text-muted-foreground font-medium">Started</div>
        <div class="text-sm font-medium">${batch.startedAt ? new Date(batch.startedAt * 1000).toLocaleDateString() : '—'}</div>
        <div class="text-xs text-muted-foreground">${batch.startedAt ? new Date(batch.startedAt * 1000).toLocaleTimeString() : 'Not started'}</div>
      </div>
      
      <div class="space-y-1">
        <div class="text-xs uppercase tracking-wider text-muted-foreground font-medium">Duration</div>
        <div class="text-sm font-medium">${batch.startedAt && batch.completedAt ? formatDuration((batch.completedAt - batch.startedAt) * 1000) : batch.status === 'processing' ? 'In progress' : '—'}</div>
      </div>
    </div>

    ${batch.errorMessage ? `
      <div class="mb-8 p-4 rounded-lg border border-red-500/30 bg-red-500/5">
        <div class="flex items-center gap-2 text-red-600 dark:text-red-400 mb-1">
          <span class="font-medium text-sm">Error</span>
        </div>
        <p class="text-sm text-muted-foreground">${escapeHtml(batch.errorMessage)}</p>
      </div>
    ` : ''}

    <!-- Games Table -->
    ${buildGamesTableHTML(sortedGames, completedTown, completedMafia, batch.failedGames, queuedCount)}

    <!-- Configuration -->
    <details class="border rounded-lg overflow-hidden">
      <summary class="flex items-center justify-between px-4 py-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors text-sm">
        <span class="font-medium">Configuration</span>
        <span class="text-xs text-muted-foreground">Click to expand</span>
      </summary>
      <div class="p-4">
        <pre class="text-xs font-mono overflow-x-auto whitespace-pre-wrap p-3 bg-muted/30 rounded"><code>${escapeHtml(JSON.stringify(batch.config, null, 2))}</code></pre>
      </div>
    </details>
  `;
}

function buildGamesTableHTML(
  sortedGames: GameInfo[],
  completedTown: number,
  completedMafia: number,
  failedGames: number,
  queuedCount: number
): string {
  const gamesRows = sortedGames.length > 0
    ? sortedGames.map((game, idx) => buildGameRowHTML(game, idx)).join('')
    : `<tr><td colspan="6" class="py-12 text-center text-muted-foreground">${queuedCount > 0 ? `${queuedCount} games queued` : 'No games yet'}</td></tr>`;

  return `
    <section class="mb-8">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-sm font-medium uppercase tracking-wider text-muted-foreground">Games</h2>
        <div class="flex items-center gap-3 text-xs text-muted-foreground">
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-indigo-500"></span>${completedTown} town</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-rose-500"></span>${completedMafia} mafia</span>
          ${failedGames > 0 ? `<span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-500"></span>${failedGames} failed</span>` : ''}
        </div>
      </div>

      <div class="border rounded-lg overflow-hidden">
        <table class="w-full text-sm">
          <thead class="border-b bg-muted/30">
            <tr>
              <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider w-12">#</th>
              <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Game</th>
              <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
              <th class="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Winner</th>
              <th class="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Rounds</th>
              <th class="text-right py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Duration</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border/50">
            ${gamesRows}
          </tbody>
        </table>
        ${queuedCount > 0 && sortedGames.length > 0 ? `
          <div class="px-4 py-2 bg-muted/20 border-t text-xs text-muted-foreground">
            + ${queuedCount} more queued
          </div>
        ` : ''}
      </div>
    </section>
  `;
}

function buildGameRowHTML(game: GameInfo, idx: number): string {
  const isRunning = game.status === 'running';
  const isFailed = game.status === 'failed' || game.status === 'error';
  const href = isRunning ? `/games/${game.id}/live` : `/games/${game.id}`;

  let statusStyle = getStatusStyle(game.status as BatchStatus);
  if (isRunning) statusStyle = 'color: rgb(5 150 105)';
  if (isFailed) statusStyle = 'color: rgb(239 68 68)';

  let winnerBadge = '—';
  if (game.winner === 'mafia') {
    winnerBadge = `<span class="flex items-center gap-1 text-rose-500"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>Mafia</span>`;
  } else if (game.winner === 'town') {
    winnerBadge = `<span class="flex items-center gap-1 text-indigo-500"><span class="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>Town</span>`;
  }

  return `
    <tr class="hover:bg-muted/30 transition-colors ${isRunning ? 'bg-emerald-500/5' : ''} ${isFailed ? 'bg-red-500/5' : ''}">
      <td class="py-3 px-4 text-muted-foreground tabular-nums">${idx + 1}</td>
      <td class="py-3 px-4">
        <a href="${href}" class="font-mono text-xs hover:underline">${escapeHtml(game.id.slice(-12))}</a>
      </td>
      <td class="py-3 px-4">
        <span class="text-xs font-medium uppercase tracking-wide" style="${statusStyle}">
          ${isRunning ? `<span class="inline-flex items-center gap-1.5">
            <span class="relative flex h-1.5 w-1.5">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            running
          </span>` : game.status || 'queued'}
        </span>
      </td>
      <td class="py-3 px-4 font-medium">${winnerBadge}</td>
      <td class="py-3 px-4 text-right tabular-nums text-muted-foreground">${game.rounds || '—'}</td>
      <td class="py-3 px-4 text-right tabular-nums text-muted-foreground">${game.duration_ms ? formatDuration(game.duration_ms) : '—'}</td>
    </tr>
  `;
}

function setupCancelButton(config: BatchConfig): void {
  const cancelBtn = document.getElementById('cancelBtn');
  if (!cancelBtn) return;

  cancelBtn.addEventListener('click', async () => {
    if (!confirm('Cancel this batch?')) return;
    try {
      const credentials = sessionStorage.getItem('adminCredentials');
      const headers: Record<string, string> = {};
      if (credentials) headers['Authorization'] = `Basic ${credentials}`;

      const res = await fetch(`${config.apiUrl}/api/admin/batches/${config.batchId}/cancel`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) throw new Error('Failed');
      window.location.reload();
    } catch {
      alert('Failed to cancel batch');
    }
  });
}

// =============================================================================
// Main Functions
// =============================================================================

async function fetchBatchData(config: BatchConfig): Promise<BatchData> {
  const credentials = sessionStorage.getItem('adminCredentials');
  if (!credentials) {
    window.location.href = `/admin/login?redirect=/admin/batches/${config.batchId}`;
    throw new Error('Not authenticated');
  }

  const headers: Record<string, string> = { Authorization: `Basic ${credentials}` };
  const requestUrl = `${config.apiUrl}/api/admin/batches/${config.batchId}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let res: Response;
  let responseBody: unknown;

  try {
    res = await fetch(requestUrl, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = res.headers.get('content-type') || '';
  responseBody = contentType.includes('application/json') ? await res.json() : await res.text();

  if (res.status === 401) {
    sessionStorage.removeItem('adminCredentials');
    window.location.href = '/admin/login?redirect=' + encodeURIComponent(window.location.pathname);
    throw new Error('Unauthorized');
  }

  if (res.status === 404) {
    showError('Not Found', `Batch "${config.batchId}" not found.`, { url: requestUrl, status: res.status, body: responseBody });
    throw new Error('Not found');
  }

  if (!res.ok) {
    const errorMsg = typeof responseBody === 'object' && responseBody !== null && 'message' in responseBody
      ? (responseBody as { message: string }).message
      : `HTTP ${res.status}`;
    showError('Load Failed', errorMsg, { url: requestUrl, status: res.status, body: responseBody });
    throw new Error(errorMsg);
  }

  return responseBody as BatchData;
}

export async function initBatchMonitor(config: BatchConfig): Promise<void> {
  try {
    const batch = await fetchBatchData(config);

    document.getElementById('loading')?.classList.add('hidden');
    document.getElementById('content')?.classList.remove('hidden');

    renderBatch(batch, config);

    // Auto-refresh for processing batches
    if (batch.status === 'processing') {
      setTimeout(() => window.location.reload(), 5000);
    }
  } catch (error) {
    if (error instanceof Error && (error.message === 'Not authenticated' || error.message === 'Unauthorized')) {
      return;
    }
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    showError('Error', message, {});
  }
}

export function setupRetryButton(config: BatchConfig): void {
  const retryBtn = document.getElementById('retry-btn');
  if (!retryBtn) return;

  retryBtn.addEventListener('click', () => {
    document.getElementById('error')?.classList.add('hidden');
    document.getElementById('loading')?.classList.remove('hidden');
    initBatchMonitor(config);
  });
}

// Export for use in Astro page
export type { BatchConfig };

