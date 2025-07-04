'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from './ui/progress';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  Sparkles,
  Users,
  CheckCircle2,
  AlertCircle,
  User,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  generateGameCharactersAction,
  getCharacterGenerationProgressAction,
  type CharacterGenerationProgress,
} from '@/app/actions/character-generation.actions';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import { cn } from '@/lib/utils';

interface CharacterGenerationUIProps {
  gameId: string;
  onComplete: (gameState: FilteredGameState) => void;
  onError: (error: string) => void;
}

interface CharacterCardProps {
  character: {
    id: string;
    name: string;
    imageUrl: string | null;
    backstory?: string;
    occupation?: string;
    quirk?: string;
    personalityTraits?: string[];
  };
  isLoading?: boolean;
}

const CharacterCard: React.FC<CharacterCardProps> = ({
  character,
  isLoading,
}) => {
  return (
    <div
      className={cn(
        'relative bg-card rounded-lg p-4 transition-all duration-300',
        isLoading ? 'animate-pulse' : 'animate-in fade-in-50 zoom-in-95'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0">
          {character.imageUrl ? (
            <Image
              src={character.imageUrl}
              alt={character.name}
              width={48}
              height={48}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <User className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {isLoading ? (
            <>
              <div className="h-4 bg-secondary rounded animate-pulse mb-1 w-3/4"></div>
              <div className="h-3 bg-secondary rounded animate-pulse w-1/2"></div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium text-sm truncate">
                  {character.name}
                </h4>
                {character.occupation && (
                  <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded-md">
                    {character.occupation}
                  </span>
                )}
              </div>
              {character.backstory && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-1">
                  {character.backstory}
                </p>
              )}
              {character.quirk && (
                <p className="text-xs text-muted-foreground italic">
                  ✨ {character.quirk}
                </p>
              )}
              {character.personalityTraits &&
                character.personalityTraits.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {character.personalityTraits
                      .slice(0, 3)
                      .map((trait, index) => (
                        <span
                          key={index}
                          className="text-xs px-1.5 py-0.5 bg-secondary text-secondary-foreground rounded-md"
                        >
                          {trait}
                        </span>
                      ))}
                    {character.personalityTraits.length > 3 && (
                      <span className="text-xs text-muted-foreground">
                        +{character.personalityTraits.length - 3}
                      </span>
                    )}
                  </div>
                )}
            </>
          )}
        </div>

        {!isLoading && (
          <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
        )}
      </div>
    </div>
  );
};

export default function CharacterGenerationUI({
  gameId,
  onComplete,
  onError,
}: CharacterGenerationUIProps) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<CharacterGenerationProgress>({
    currentStep: 'Initializing...',
    progress: 0,
    totalSteps: 0,
    completedCharacters: 0,
    totalCharacters: 0,
    characters: [],
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  // ✅ FIXED: Use refs for stable callback references
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  const isGeneratingRef = useRef(false);
  const hasInitiatedGenerationRef = useRef(false); // Track if generation has been initiated

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
    if (
      isGeneratingRef.current ||
      isComplete ||
      error ||
      hasInitiatedGenerationRef.current
    ) {
      return; // State guard to prevent multiple simultaneous operations
    }

    hasInitiatedGenerationRef.current = true; // Mark as initiated
    setIsGenerating(true);
    isGeneratingRef.current = true;
    setError(null);

    try {
      const result = await generateGameCharactersAction(gameId);
      if ('error' in result) {
        // If the error is that generation is already completed, check progress instead
        if (result.error === 'Character generation already completed') {
          const progressResult =
            await getCharacterGenerationProgressAction(gameId);
          if (!('error' in progressResult) && progressResult.progress >= 100) {
            setIsComplete(true);
            // Trigger completion callback without re-running generation
            return;
          }
        }
        setError(result.error);
        onErrorRef.current(result.error);
        hasInitiatedGenerationRef.current = false; // Reset on error
        return;
      }

      setIsComplete(true);
      onCompleteRef.current(result);
    } catch (err) {
      console.error('Error generating characters:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to generate characters';
      setError(errorMessage);
      onErrorRef.current(errorMessage);
      hasInitiatedGenerationRef.current = false; // Reset on error
    } finally {
      setIsGenerating(false);
      isGeneratingRef.current = false;
    }
  }, [gameId, isComplete, error]);

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

    let pollCount = 0;
    let timeoutId: NodeJS.Timeout;

    const pollProgress = async () => {
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
          return;
        }

        // Exponential backoff: start at 1s, max at 5s
        pollCount++;
        const nextDelay = Math.min(1000 * Math.pow(1.5, pollCount - 1), 5000);
        
        timeoutId = setTimeout(pollProgress, nextDelay);
      } catch (err) {
        console.error('Error getting progress:', err);
        setError('Failed to get generation progress');
      }
    };

    // Start polling after initial delay
    timeoutId = setTimeout(pollProgress, 1000);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isGenerating, isComplete, error, gameId]);

  // ✅ FIXED: Auto-start generation with proper state guards
  useEffect(() => {
    if (
      progress.progress < 100 &&
      !isGenerating &&
      !error &&
      !isComplete &&
      !isGeneratingRef.current &&
      !hasInitiatedGenerationRef.current // Check if generation has been initiated
    ) {
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

            {/* Add helpful suggestions based on error type */}
            <div className="bg-secondary/20 rounded-md p-3 space-y-2">
              <p className="text-sm font-medium">
                {t('character-generation.suggestions', 'Suggestions:')}
              </p>
              <ul className="text-sm text-muted-foreground space-y-1">
                {(error.includes('Ollama') ||
                  error.includes('OLLAMA_NOT_RUNNING')) && (
                  <>
                    <li>
                      • Ensure Ollama is running:{' '}
                      <code className="text-xs bg-secondary px-1 py-0.5 rounded">
                        ollama serve
                      </code>
                    </li>
                    <li>
                      • Check if the model is installed:{' '}
                      <code className="text-xs bg-secondary px-1 py-0.5 rounded">
                        ollama list
                      </code>
                    </li>
                  </>
                )}
                {(error.includes('API key') ||
                  error.includes('AUTH_ERROR')) && (
                  <li>• Check your API key in the environment settings</li>
                )}
                {(error.includes('Rate limit') ||
                  error.includes('RATE_LIMIT')) && (
                  <li>
                    • Wait a moment before trying again (rate limit exceeded)
                  </li>
                )}
                {(error.includes('timeout') || error.includes('TIMEOUT')) && (
                  <li>
                    • The AI service is busy, please try again in a moment
                  </li>
                )}
                {(error.includes('model') ||
                  error.includes('MODEL_NOT_FOUND')) && (
                  <li>
                    • The selected AI model is not available, try a different
                    model
                  </li>
                )}
                {(error.includes('quota') ||
                  error.includes('QUOTA_EXCEEDED')) && (
                  <li>
                    • Your API quota has been exceeded, check your account
                    limits
                  </li>
                )}
                <li>• Try using a different AI model or provider</li>
                <li>• Return to the game setup to adjust settings</li>
              </ul>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setError(null);
                  hasInitiatedGenerationRef.current = false;
                  startGeneration();
                }}
                className="flex-1"
              >
                {t('character-generation.retry', 'Try Again')}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  // Navigate back to game setup
                  window.location.href = '/en/new';
                }}
                className="flex-1"
              >
                {t('character-generation.back-to-setup', 'Back to Setup')}
              </Button>
            </div>
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl">
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
                {t(
                  'character-generation.progress-text',
                  'Generated {{completed}} of {{total}} characters',
                  {
                    completed: progress.completedCharacters,
                    total: progress.totalCharacters,
                  }
                )}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{progress.currentStep}</span>
              <span>{progress.progress}%</span>
            </div>
            <Progress value={progress.progress} className="w-full h-2" />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              {t('character-generation.characters-list', 'Characters')}
            </h3>

            <div className="grid gap-2 max-h-60 overflow-y-auto pr-2">
              {/* Show completed characters */}
              {progress.characters?.map((character) => (
                <CharacterCard key={character.id} character={character} />
              ))}

              {/* Show loading card for current character */}
              {progress.currentCharacterName && progress.progress < 100 && (
                <CharacterCard
                  character={{
                    id: 'current',
                    name: progress.currentCharacterName,
                    imageUrl: null,
                  }}
                  isLoading
                />
              )}

              {/* Show placeholder cards for remaining characters */}
              {Array.from({
                length: Math.max(
                  0,
                  progress.totalCharacters -
                    progress.completedCharacters -
                    (progress.currentCharacterName ? 1 : 0)
                ),
              }).map((_, index) => (
                <div
                  key={`placeholder-${index}`}
                  className="bg-secondary/30 rounded-lg p-4 opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-secondary/50"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-secondary/50 rounded w-3/4 mb-1"></div>
                      <div className="h-3 bg-secondary/50 rounded w-1/2"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center text-xs text-muted-foreground">
            {t(
              'character-generation.description',
              'Each character is being given a unique personality, backstory, and appearance to make your game immersive and engaging.'
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
