"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from './ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, Users, CheckCircle2, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { generateGameCharactersAction, getCharacterGenerationProgressAction, type CharacterGenerationProgress } from '@/app/actions/character-generation.actions';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';

interface CharacterGenerationUIProps {
  gameId: string;
  onComplete: (gameState: FilteredGameState) => void;
  onError: (error: string) => void;
}

export default function CharacterGenerationUI({ gameId, onComplete, onError }: CharacterGenerationUIProps) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<CharacterGenerationProgress>({
    currentStep: 'Initializing...',
    progress: 0,
    totalSteps: 0,
    completedCharacters: 0,
    totalCharacters: 0
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  // ✅ FIXED: Use refs for stable callback references
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  const isGeneratingRef = useRef(false);

  // Update refs when props change
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  // ✅ FIXED: Stable startGeneration callback with state guards
  const startGeneration = useCallback(async () => {
    if (isGeneratingRef.current || isComplete || error) {
      return; // State guard to prevent multiple simultaneous operations
    }

    setIsGenerating(true);
    isGeneratingRef.current = true;
    setError(null);
    
    try {
      const result = await generateGameCharactersAction(gameId);
      if ('error' in result) {
        setError(result.error);
        onErrorRef.current(result.error);
        return;
      }
      
      setIsComplete(true);
      onCompleteRef.current(result);
    } catch (err) {
      console.error('Error generating characters:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate characters';
      setError(errorMessage);
      onErrorRef.current(errorMessage);
    } finally {
      setIsGenerating(false);
      isGeneratingRef.current = false;
    }
  }, [gameId, isComplete, error]); // Only stable dependencies

  // ✅ FIXED: Inline progress checking without unstable callback dependencies
  useEffect(() => {
    if (isComplete || error || isGeneratingRef.current) {
      return; // Don't check progress if complete, error, or already generating
    }

    const checkProgress = async () => {
      try {
        const result = await getCharacterGenerationProgressAction(gameId);
        if ('error' in result) {
          setError(result.error || 'Unknown error occurred');
          return;
        }
        setProgress(result);
        
        // Check if generation is complete
        if (result.progress >= 100 && !isComplete) {
          setIsComplete(true);
        }
      } catch (err) {
        console.error('Error getting progress:', err);
        setError('Failed to get generation progress');
      }
    };

    checkProgress();
  }, [gameId, isComplete, error]); // Only stable dependencies

  // ✅ FIXED: Progress polling with proper cleanup and state guards
  useEffect(() => {
    if (!isGenerating || isComplete || error) {
      return;
    }

    const interval = setInterval(async () => {
      if (isComplete || error || !isGeneratingRef.current) {
        return; // Additional safety check
      }

      try {
        const result = await getCharacterGenerationProgressAction(gameId);
        if ('error' in result) {
          setError(result.error || 'Unknown error occurred');
          return;
        }
        setProgress(result);
        
        if (result.progress >= 100 && !isComplete) {
          setIsComplete(true);
        }
      } catch (err) {
        console.error('Error getting progress:', err);
        setError('Failed to get generation progress');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isGenerating, isComplete, error, gameId]);

  // ✅ FIXED: Auto-start generation with proper state guards
  useEffect(() => {
    if (progress.progress < 100 && !isGenerating && !error && !isComplete && !isGeneratingRef.current) {
      startGeneration();
    }
  }, [progress.progress, isGenerating, error, isComplete, startGeneration]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2 text-destructive">
              <AlertCircle className="w-6 h-6" />
              {t('character-generation.error', 'Generation Error')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-muted-foreground">{error}</p>
            <Button 
              onClick={() => {
                setError(null);
                startGeneration();
              }}
              className="w-full"
            >
              {t('character-generation.retry', 'Try Again')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2 text-success">
              <CheckCircle2 className="w-6 h-6" />
              {t('character-generation.complete', 'Characters Ready!')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground">
              {t('character-generation.starting-game', 'Starting your game...')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <Sparkles className="w-6 h-6 text-primary animate-pulse" />
            {t('character-generation.title', 'Creating Characters')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Users className="w-4 h-4" />
              <span>
                {t('character-generation.progress-text', 'Generated {{completed}} of {{total}} characters', {
                  completed: progress.completedCharacters,
                  total: progress.totalCharacters
                })}
              </span>
            </div>
            
            {progress.currentCharacterName && (
              <p className="text-sm text-primary font-medium">
                {t('character-generation.current-character', 'Creating: {{name}}', {
                  name: progress.currentCharacterName
                })}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{progress.currentStep}</span>
              <span>{progress.progress}%</span>
            </div>
            <Progress value={progress.progress} className="w-full h-2" />
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t('character-generation.please-wait', 'Please wait while we create unique AI characters...')}</span>
          </div>

          <div className="text-center text-xs text-muted-foreground">
            {t('character-generation.description', 'Each character is being given a unique personality, backstory, and appearance to make your game immersive and engaging.')}
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 