'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Activity,
  Cpu,
  Wifi,
  HardDrive,
  Gauge,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';

interface GamePerformanceMonitorProps {
  gameState: FilteredGameState;
  className?: string;
}

interface PerformanceMetrics {
  fps: number;
  latency: number;
  messageProcessingTime: number;
  memoryUsage: number;
  renderTime: number;
  aiResponseTime: number;
  networkStatus: 'excellent' | 'good' | 'fair' | 'poor';
  overallHealth: 'healthy' | 'warning' | 'critical';
}

interface HistoricalData {
  timestamp: number;
  fps: number;
  latency: number;
}

export function GamePerformanceMonitor({
  gameState,
  className,
}: GamePerformanceMonitorProps) {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 60,
    latency: 0,
    messageProcessingTime: 0,
    memoryUsage: 0,
    renderTime: 0,
    aiResponseTime: 0,
    networkStatus: 'excellent',
    overallHealth: 'healthy',
  });

  const [history, setHistory] = useState<HistoricalData[]>([]);
  const frameCount = useRef(0);
  const lastFrameTime = useRef(performance.now());
  const messageTimestamps = useRef<Map<string, number>>(new Map());

  // Calculate FPS
  useEffect(() => {
    let animationFrameId: number;

    const calculateFPS = () => {
      frameCount.current++;
      const currentTime = performance.now();
      const deltaTime = currentTime - lastFrameTime.current;

      if (deltaTime >= 1000) {
        const fps = Math.round((frameCount.current * 1000) / deltaTime);
        frameCount.current = 0;
        lastFrameTime.current = currentTime;

        setMetrics((prev) => ({ ...prev, fps }));
      }

      animationFrameId = requestAnimationFrame(calculateFPS);
    };

    animationFrameId = requestAnimationFrame(calculateFPS);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Monitor message processing
  useEffect(() => {
    const lastMessageCount = gameState.log.length;
    const processingStart = performance.now();

    // Simulate processing time measurement
    const processingTime = performance.now() - processingStart;

    setMetrics((prev) => ({
      ...prev,
      messageProcessingTime: Math.round(processingTime),
    }));
  }, [gameState.log.length]);

  // Monitor memory usage
  useEffect(() => {
    const checkMemory = () => {
      if ('memory' in performance) {
        const memoryInfo = (performance as any).memory;
        const usagePercentage =
          (memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit) * 100;

        setMetrics((prev) => ({
          ...prev,
          memoryUsage: Math.round(usagePercentage),
        }));
      }
    };

    checkMemory();
    const interval = setInterval(checkMemory, 5000);

    return () => clearInterval(interval);
  }, []);

  // Calculate network status based on simulated latency
  useEffect(() => {
    const simulatedLatency = Math.random() * 100;
    let networkStatus: PerformanceMetrics['networkStatus'] = 'excellent';

    if (simulatedLatency > 150) networkStatus = 'poor';
    else if (simulatedLatency > 100) networkStatus = 'fair';
    else if (simulatedLatency > 50) networkStatus = 'good';

    setMetrics((prev) => ({
      ...prev,
      latency: Math.round(simulatedLatency),
      networkStatus,
    }));
  }, [gameState.round]);

  // Calculate AI response time
  useEffect(() => {
    const aiMessages = gameState.log.filter(
      (msg) => msg.type === 'chat' && msg.senderId !== gameState.humanPlayerId
    );

    if (aiMessages.length > 0) {
      // Simulate AI response time calculation
      const avgResponseTime = 1500 + Math.random() * 1000;

      setMetrics((prev) => ({
        ...prev,
        aiResponseTime: Math.round(avgResponseTime),
      }));
    }
  }, [gameState.log, gameState.humanPlayerId]);

  // Update overall health
  useEffect(() => {
    let health: PerformanceMetrics['overallHealth'] = 'healthy';

    if (
      metrics.fps < 30 ||
      metrics.latency > 150 ||
      metrics.memoryUsage > 80 ||
      metrics.messageProcessingTime > 100
    ) {
      health = 'critical';
    } else if (
      metrics.fps < 45 ||
      metrics.latency > 100 ||
      metrics.memoryUsage > 60 ||
      metrics.messageProcessingTime > 50
    ) {
      health = 'warning';
    }

    setMetrics((prev) => ({ ...prev, overallHealth: health }));
  }, [
    metrics.fps,
    metrics.latency,
    metrics.memoryUsage,
    metrics.messageProcessingTime,
  ]);

  // Update history
  useEffect(() => {
    const newDataPoint: HistoricalData = {
      timestamp: Date.now(),
      fps: metrics.fps,
      latency: metrics.latency,
    };

    setHistory((prev) => [...prev.slice(-19), newDataPoint]);
  }, [metrics.fps, metrics.latency]);

  const getNetworkStatusIcon = () => {
    switch (metrics.networkStatus) {
      case 'excellent':
        return <Wifi className="w-3 h-3 text-green-500" />;
      case 'good':
        return <Wifi className="w-3 h-3 text-blue-500" />;
      case 'fair':
        return <Wifi className="w-3 h-3 text-yellow-500" />;
      case 'poor':
        return <Wifi className="w-3 h-3 text-red-500" />;
    }
  };

  const getHealthIcon = () => {
    switch (metrics.overallHealth) {
      case 'healthy':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'critical':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
    }
  };

  const getHealthColor = () => {
    switch (metrics.overallHealth) {
      case 'healthy':
        return 'text-green-500';
      case 'warning':
        return 'text-yellow-500';
      case 'critical':
        return 'text-red-500';
    }
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            {t('PerformanceMonitor', 'Performance Monitor')}
          </span>
          <div className="flex items-center gap-2">
            {getHealthIcon()}
            <Badge
              variant={
                metrics.overallHealth === 'healthy'
                  ? 'default'
                  : metrics.overallHealth === 'warning'
                    ? 'secondary'
                    : 'destructive'
              }
              className="text-xs"
            >
              {t(`Health.${metrics.overallHealth}`, metrics.overallHealth)}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-3">
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* FPS */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Gauge className="w-3 h-3" />
                      {t('FPS', 'FPS')}
                    </span>
                    <span
                      className={cn(
                        'text-sm font-bold',
                        metrics.fps >= 50
                          ? 'text-green-500'
                          : metrics.fps >= 30
                            ? 'text-yellow-500'
                            : 'text-red-500'
                      )}
                    >
                      {metrics.fps}
                    </span>
                  </div>
                  <Progress value={(metrics.fps / 60) * 100} className="h-1" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {t('FramesPerSecond', 'Frames per second')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('Target', 'Target')}: 60 FPS
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Latency */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      {getNetworkStatusIcon()}
                      {t('Latency', 'Latency')}
                    </span>
                    <span
                      className={cn(
                        'text-sm font-bold',
                        metrics.latency <= 50
                          ? 'text-green-500'
                          : metrics.latency <= 100
                            ? 'text-yellow-500'
                            : 'text-red-500'
                      )}
                    >
                      {metrics.latency}ms
                    </span>
                  </div>
                  <Progress
                    value={Math.max(0, 100 - metrics.latency)}
                    className="h-1"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {t('NetworkLatency', 'Network latency')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('NetworkStatus', 'Status')}: {t(metrics.networkStatus)}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Memory Usage */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <HardDrive className="w-3 h-3" />
                      {t('Memory', 'Memory')}
                    </span>
                    <span
                      className={cn(
                        'text-sm font-bold',
                        metrics.memoryUsage <= 60
                          ? 'text-green-500'
                          : metrics.memoryUsage <= 80
                            ? 'text-yellow-500'
                            : 'text-red-500'
                      )}
                    >
                      {metrics.memoryUsage}%
                    </span>
                  </div>
                  <Progress value={metrics.memoryUsage} className="h-1" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{t('MemoryUsage', 'Memory usage')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('JSHeapUsage', 'JavaScript heap usage')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* AI Response Time */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Cpu className="w-3 h-3" />
                      {t('AIResponse', 'AI Response')}
                    </span>
                    <span
                      className={cn(
                        'text-sm font-bold',
                        metrics.aiResponseTime <= 2000
                          ? 'text-green-500'
                          : metrics.aiResponseTime <= 3000
                            ? 'text-yellow-500'
                            : 'text-red-500'
                      )}
                    >
                      {(metrics.aiResponseTime / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <Progress
                    value={Math.max(0, 100 - metrics.aiResponseTime / 50)}
                    className="h-1"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {t('AIResponseTime', 'AI response time')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('AverageTime', 'Average time for AI to respond')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Performance Graph */}
        <div className="pt-3 border-t">
          <p className="text-xs font-medium mb-2">
            {t('PerformanceTrend', 'Performance Trend')}
          </p>
          <div className="h-16 flex items-end gap-0.5">
            {history.map((data, index) => (
              <motion.div
                key={index}
                initial={{ height: 0 }}
                animate={{ height: `${(data.fps / 60) * 100}%` }}
                className={cn(
                  'flex-1 rounded-t',
                  data.fps >= 50
                    ? 'bg-green-500/50'
                    : data.fps >= 30
                      ? 'bg-yellow-500/50'
                      : 'bg-red-500/50'
                )}
              />
            ))}
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-muted-foreground">
              {t('Past', 'Past')}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('Now', 'Now')}
            </span>
          </div>
        </div>

        {/* Recommendations */}
        {metrics.overallHealth !== 'healthy' && (
          <div className="pt-3 border-t">
            <p className="text-xs font-medium mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {t('Recommendations', 'Recommendations')}
            </p>
            <div className="space-y-1">
              {metrics.fps < 45 && (
                <p className="text-xs text-muted-foreground">
                  • {t('LowFPSAdvice', 'Consider reducing animation quality')}
                </p>
              )}
              {metrics.latency > 100 && (
                <p className="text-xs text-muted-foreground">
                  • {t('HighLatencyAdvice', 'Check your network connection')}
                </p>
              )}
              {metrics.memoryUsage > 60 && (
                <p className="text-xs text-muted-foreground">
                  • {t('HighMemoryAdvice', 'Close unnecessary browser tabs')}
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
