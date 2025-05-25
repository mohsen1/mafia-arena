"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
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

  const updateProgress = useCallback(async () => {
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
  }, [gameId, isComplete]);

  const startGeneration = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    
    try {
      const result = await generateGameCharactersAction(gameId);
      if ('error' in result) {
        setError(result.error);
        onError(result.error);
        return;
      }
      
      setIsComplete(true);
      onComplete(result);
    } catch (err) {
      console.error('Error generating characters:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate characters';
      setError(errorMessage);
      onError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  }, [gameId, onComplete, onError]);

  // Poll progress during generation
  useEffect(() => {
    if (!isGenerating || isComplete) return;

    const interval = setInterval(updateProgress, 1000);
    return () => clearInterval(interval);
  }, [isGenerating, isComplete, updateProgress]);

  // Initial progress check
  useEffect(() => {
    updateProgress();
  }, [updateProgress]);

  // Auto-start generation if not already complete
  useEffect(() => {
    if (progress.progress < 100 && !isGenerating && !error && !isComplete) {
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