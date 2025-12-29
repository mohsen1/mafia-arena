'use client';

import { useEffect, useRef } from 'react';
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
} from 'chart.js';
import type { EloRanking } from '~/lib/api';
import { getProviderFromModel, getProviderColor } from '~/lib/providers';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

interface Props {
  rankings: EloRanking[];
  maxItems?: number;
}

export function EloBarChart({ rankings, maxItems = 12 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const hasAnimatedRef = useRef(false);

  const data = rankings.slice(0, maxItems);

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const maxElo = Math.max(...data.map((r) => r.elo));
    const minElo = Math.min(...data.map((r) => r.elo));

    // Convert hex to rgba
    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const barColors = data.map((r) => {
      const modelId = r.model_ids?.[0] || r.display_name;
      const provider = getProviderFromModel(modelId);
      return hexToRgba(getProviderColor(provider), 0.85);
    });

    const borderColors = data.map((r) => {
      const modelId = r.model_ids?.[0] || r.display_name;
      const provider = getProviderFromModel(modelId);
      return getProviderColor(provider);
    });

    // Tight baseline for visual impact
    const baseline = Math.floor((minElo - 30) / 10) * 10;

    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map((r) => r.display_name),
        datasets: [
          {
            data: data.map((r) => r.elo),
            backgroundColor: barColors,
            borderColor: borderColors,
            borderWidth: 1.5,
            borderRadius: 3,
            borderSkipped: false,
          },
        ],
      },
      options: {
        indexAxis: 'x', // Vertical bars
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { top: 8, bottom: 0, left: 4, right: 4 },
        },
        scales: {
          y: {
            min: baseline,
            max: maxElo + 20,
            grid: {
              color: 'rgba(161, 161, 170, 0.08)',
            },
            border: { display: false },
            ticks: {
              stepSize: 50,
              font: { size: 9, family: 'ui-monospace, monospace' },
              color: '#71717a',
              padding: 4,
            },
          },
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              font: { size: 9, family: 'system-ui, sans-serif', weight: 500 },
              color: '#a1a1aa',
              maxRotation: 45,
              minRotation: 45,
              padding: 0,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(9, 9, 11, 0.96)',
            titleFont: { size: 11, weight: 'bold' },
            bodyFont: { size: 10, family: 'ui-monospace, monospace' },
            padding: { x: 10, y: 8 },
            cornerRadius: 6,
            displayColors: false,
            borderColor: 'rgba(161, 161, 170, 0.2)',
            borderWidth: 1,
            callbacks: {
              title: (items) => items[0]?.label || '',
              label: (item) => {
                const ranking = data[item.dataIndex];
                return [
                  `ELO ${ranking.elo}`,
                  `${(ranking.win_rate * 100).toFixed(0)}% win rate`,
                  `${ranking.wins}W - ${ranking.losses}L`,
                ];
              },
            },
          },
        },
        animation: hasAnimatedRef.current 
          ? false 
          : { duration: 400, easing: 'easeOutQuart' },
      },
    });

    hasAnimatedRef.current = true;

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">
        No data
      </div>
    );
  }

  return (
    <div className="w-full h-[200px]">
      <canvas ref={canvasRef} />
    </div>
  );
}
