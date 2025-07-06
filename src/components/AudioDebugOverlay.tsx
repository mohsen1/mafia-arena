'use client';

import React from 'react';
import { useSpokenText } from '@/context/SpokenTextContext';

// Breadcrumb tracking for debugging
export const audioBreadcrumbs: Array<{
  timestamp: string;
  action: string;
  details?: any;
}> = [];

export function addAudioBreadcrumb(action: string, details?: any) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  audioBreadcrumbs.push({ timestamp, action, details });

  // Keep only last 20 breadcrumbs
  if (audioBreadcrumbs.length > 20) {
    audioBreadcrumbs.shift();
  }

  console.log(`[AudioBreadcrumb] ${timestamp} 🍞 ${action}`, details || '');
}

export function AudioDebugOverlay() {
  const { currentlySpeakingId, queuedRequests } = useSpokenText();
  const [isVisible, setIsVisible] = React.useState(false);
  const [metrics, setMetrics] = React.useState<any>({});

  React.useEffect(() => {
    // Toggle with Shift+D
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'D') {
        setIsVisible((prev) => !prev);
        addAudioBreadcrumb('Debug overlay toggled', { visible: !isVisible });
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isVisible]);

  React.useEffect(() => {
    // Update metrics every second
    const interval = setInterval(() => {
      // Get audio metrics from window if available
      const audioMetrics = (window as any).__audioMetrics || {};
      setMetrics(audioMetrics);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black/90 text-white p-4 rounded-lg text-xs font-mono max-w-md z-50">
      <div className="mb-2 font-bold text-yellow-400">
        🎵 Audio Debug Overlay
      </div>
      <div className="space-y-1">
        <div>Currently Speaking: {currentlySpeakingId || 'None'}</div>
        <div>
          Active Components:{' '}
          {Object.keys((window as any).__audioRegistry || {}).length}
        </div>
        <div>Queued Requests: {queuedRequests.length}</div>
        {queuedRequests.length > 0 && (
          <div className="mt-1 p-1 bg-yellow-900/30 rounded">
            <div className="font-semibold text-yellow-400 text-[10px]">
              Audio Queue:
            </div>
            {queuedRequests.slice(0, 5).map((id, index) => (
              <div key={id} className="text-[10px] text-yellow-300/80 truncate">
                {index + 1}. {id}
              </div>
            ))}
            {queuedRequests.length > 5 && (
              <div className="text-[10px] text-yellow-300/60">
                ... and {queuedRequests.length - 5} more
              </div>
            )}
          </div>
        )}
        <div className="border-t pt-1 mt-1">
          <div className="font-bold">Metrics:</div>
          <div>Fetch Count: {metrics.fetchCount || 0}</div>
          <div>Success Rate: {metrics.playSuccessRate || 'N/A'}</div>
          <div>Avg Fetch Time: {metrics.avgFetchTime || 'N/A'}</div>
          <div>Skip Count: {metrics.skipCount || 0}</div>
          <div>Completion Rate: {metrics.completionRate || 'N/A'}</div>
        </div>
        <div className="border-t pt-1 mt-1">
          <div className="font-bold">Recent Actions:</div>
          {audioBreadcrumbs.slice(-5).map((crumb, i) => (
            <div key={i} className="text-gray-300">
              {crumb.timestamp} {crumb.action}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 text-gray-400">Press Shift+D to toggle</div>
    </div>
  );
}
