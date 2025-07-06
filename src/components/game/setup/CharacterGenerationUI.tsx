'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  Sparkles,
  Users,
  CheckCircle2,
  AlertCircle,
  User,
  Eye,
  EyeOff,
  Code,
  Clock,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  generateGameCharactersAction,
  getCharacterGenerationProgressAction,
  type CharacterGenerationProgress,
} from '@/app/actions/character-generation.actions';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import { cn } from '@/lib/utils';
import { getPersonaGenerationPrompt } from '@/lib/engine/prompts';

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
    provider?: string;
    model?: string;
  };
  isLoading?: boolean;
  currentProvider?: string;
  currentModel?: string;
}

const CharacterCard: React.FC<CharacterCardProps> = ({
  character,
  isLoading,
  currentProvider,
  currentModel,
}) => {
  const getStatusIcon = () => {
    if (isLoading) {
      return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
    }
    return <CheckCircle2 className="w-5 h-5 text-primary" />;
  };

  return (
    <div
      className={cn(
        'relative bg-card rounded-lg p-4 transition-all duration-300',
        isLoading
          ? 'animate-pulse border-primary/20 border'
          : 'animate-in fade-in-50 zoom-in-95'
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
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-full">
              <Sparkles className="w-5 h-5 animate-pulse text-primary" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {isLoading ? (
            <>
              <div className="h-4 bg-secondary rounded animate-pulse mb-1 w-3/4"></div>
              <div className="h-3 bg-secondary rounded animate-pulse w-1/2"></div>
              {currentProvider && currentModel && (
                <div className="flex items-center gap-1 mt-1">
                  <Sparkles className="w-3 h-3 text-primary animate-pulse" />
                  <span className="text-xs text-muted-foreground">
                    {currentProvider} ({currentModel})
                  </span>
                </div>
              )}
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
              {character.provider && character.model && (
                <div className="flex items-center gap-1 mt-1">
                  <Sparkles className="w-3 h-3 text-primary" />
                  <span className="text-xs text-muted-foreground">
                    {character.provider} ({character.model})
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex-shrink-0">{getStatusIcon()}</div>
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
    currentStep: t('character-generation.initializing', 'Initializing...'),
    progress: 0,
    totalSteps: 0,
    completedCharacters: 0,
    totalCharacters: 0,
    characters: [],
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<string>('');
  const [gameTheme, setGameTheme] = useState<{
    name: string;
    description: string;
  } | null>(null);

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

  // Fetch game theme for prompt display
  useEffect(() => {
    const fetchGameTheme = async () => {
      try {
        // This is a simplified approach - in production, you'd want to get this from the game state
        const response = await fetch(`/api/games/${gameId}/theme`).catch(
          () => null
        );
        if (response && response.ok) {
          const theme = await response.json();
          setGameTheme(theme);
        }
      } catch (error) {
        console.error('Failed to fetch game theme:', error);
      }
    };

    fetchGameTheme();
  }, [gameId]);

  // Update current prompt when progress changes
  useEffect(() => {
    if (progress.currentCharacterName && gameTheme) {
      const existingNames = progress.characters?.map((c) => c.name) || [];
      const prompt = getPersonaGenerationPrompt(
        `${gameTheme.name}: ${gameTheme.description}`,
        'English', // This should come from game state
        existingNames
      );
      setCurrentPrompt(prompt);
    }
  }, [progress.currentCharacterName, progress.characters, gameTheme]);

  if (error) {
    // Parse error to extract specific details
    const errorLines = error.split('\n');
    const isMultiCharacterError = error.includes(
      'Character generation failed for'
    );

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
            <div className="text-center space-y-2">
              {isMultiCharacterError ? (
                <div className="space-y-2">
                  <p className="font-medium text-muted-foreground">
                    {errorLines[0]}
                  </p>
                  {errorLines.slice(1).map(
                    (line, index) =>
                      line.trim() && (
                        <p
                          key={index}
                          className="text-sm text-muted-foreground"
                        >
                          {line}
                        </p>
                      )
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">{error}</p>
              )}

              {/* Show which model failed if available */}
              {progress.currentCharacterProvider &&
                progress.currentCharacterModel && (
                  <div className="mt-2 p-2 bg-secondary/20 rounded-md">
                    <p className="text-xs text-muted-foreground">
                      Failed while using:{' '}
                      <span className="font-medium">
                        {progress.currentCharacterProvider} (
                        {progress.currentCharacterModel})
                      </span>
                    </p>
                  </div>
                )}
            </div>

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
                      {t(
                        'character-generation.suggestions-ollama-running',
                        '• Ensure Ollama is running:'
                      )}{' '}
                      <code className="text-xs bg-secondary px-1 py-0.5 rounded">
                        ollama serve
                      </code>
                    </li>
                    <li>
                      {t(
                        'character-generation.suggestions-check-model',
                        '• Check if the model is installed:'
                      )}{' '}
                      <code className="text-xs bg-secondary px-1 py-0.5 rounded">
                        ollama list
                      </code>
                    </li>
                    <li>
                      {t(
                        'character-generation.suggestions-pull-model',
                        '• Pull the required model:'
                      )}{' '}
                      <code className="text-xs bg-secondary px-1 py-0.5 rounded">
                        ollama pull {progress.currentCharacterModel || 'llama2'}
                      </code>
                    </li>
                  </>
                )}
                {(error.includes('API key') ||
                  error.includes('AUTH_ERROR') ||
                  error.includes('401')) && (
                  <>
                    <li>
                      {t(
                        'character-generation.suggestions-check-api-key',
                        '• Check your API key in the profile settings'
                      )}
                    </li>
                    {progress.currentCharacterProvider && (
                      <li>
                        {t(
                          'character-generation.suggestions-verify-api-key',
                          '• Verify your {{provider}} API key is valid and has credits',
                          {
                            provider: progress.currentCharacterProvider,
                          }
                        )}
                      </li>
                    )}
                    <li>
                      {t(
                        'character-generation.suggestions-different-provider',
                        '• Consider using a different AI provider temporarily'
                      )}
                    </li>
                  </>
                )}
                {(error.includes('Rate limit') ||
                  error.includes('RATE_LIMIT') ||
                  error.includes('429')) && (
                  <>
                    <li>
                      {t(
                        'character-generation.suggestions-wait-rate-limit',
                        '• Wait a moment before trying again (rate limit exceeded)'
                      )}
                    </li>
                    {progress.currentCharacterProvider === 'groq' && (
                      <li>
                        {t(
                          'character-generation.suggestions-groq-limits',
                          '• Groq has strict rate limits - try spacing out requests'
                        )}
                      </li>
                    )}
                    <li>
                      {t(
                        'character-generation.suggestions-higher-limits',
                        '• Consider using a different AI provider with higher limits'
                      )}
                    </li>
                  </>
                )}
                {(error.includes('timeout') || error.includes('TIMEOUT')) && (
                  <>
                    <li>
                      {t(
                        'character-generation.suggestions-ai-busy',
                        '• The AI service is busy, please try again in a moment'
                      )}
                    </li>
                    <li>
                      {t(
                        'character-generation.suggestions-check-connection',
                        '• Check your internet connection'
                      )}
                    </li>
                    <li>
                      {t(
                        'character-generation.suggestions-try-different',
                        '• Try a different model or provider'
                      )}
                    </li>
                  </>
                )}
                {(error.includes('model') ||
                  error.includes('MODEL_NOT_FOUND')) && (
                  <>
                    <li>
                      {t(
                        'character-generation.suggestions-model-unavailable',
                        '• The model "{{model}}" is not available',
                        {
                          model: progress.currentCharacterModel,
                        }
                      )}
                    </li>
                    <li>
                      {t(
                        'character-generation.suggestions-select-different',
                        '• Select a different model in the game setup'
                      )}
                    </li>
                    {progress.currentCharacterProvider === 'ollama' && (
                      <li>
                        {t(
                          'character-generation.suggestions-ollama-pull',
                          '• For Ollama, ensure the model is pulled locally'
                        )}
                      </li>
                    )}
                  </>
                )}
                {(error.includes('quota') ||
                  error.includes('QUOTA_EXCEEDED')) && (
                  <>
                    <li>
                      {t(
                        'character-generation.suggestions-quota-exceeded',
                        '• Your API quota has been exceeded'
                      )}
                    </li>
                    <li>
                      {t(
                        'character-generation.suggestions-check-usage',
                        '• Check your {{provider}} account for usage limits',
                        {
                          provider: progress.currentCharacterProvider,
                        }
                      )}
                    </li>
                    <li>
                      {t(
                        'character-generation.suggestions-upgrade-plan',
                        '• Consider upgrading your plan or using a different provider'
                      )}
                    </li>
                  </>
                )}
                {(error.includes('network') ||
                  error.includes('ECONNREFUSED')) && (
                  <>
                    <li>
                      {t(
                        'character-generation.suggestions-check-internet',
                        '• Check your internet connection'
                      )}
                    </li>
                    <li>
                      {t(
                        'character-generation.suggestions-verify-service',
                        '• Verify the AI service is accessible'
                      )}
                    </li>
                    {progress.currentCharacterProvider === 'ollama' && (
                      <li>
                        {t(
                          'character-generation.suggestions-ollama-port',
                          '• Ensure Ollama is running on the correct port (default: 11434)'
                        )}
                      </li>
                    )}
                  </>
                )}
                {/* Generic suggestions */}
                <li>
                  {t(
                    'character-generation.suggestions-try-provider',
                    '• Try using a different AI model or provider'
                  )}
                </li>
                <li>
                  {t(
                    'character-generation.suggestions-return-setup',
                    '• Return to the game setup to adjust settings'
                  )}
                </li>
                {isMultiCharacterError && (
                  <li>
                    {t(
                      'character-generation.suggestions-reduce-players',
                      '• Consider reducing the number of AI players'
                    )}
                  </li>
                )}
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

            {/* Enhanced backend activity display */}
            {progress.currentCharacterName && (
              <div className="bg-secondary/10 rounded-lg p-3 space-y-2 border border-secondary/20">
                <div className="flex items-center justify-center gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="font-medium text-primary">
                    {t(
                      'character-generation.current-character',
                      'Creating: {{name}} ({{role}})',
                      {
                        name: progress.currentCharacterName,
                        role: progress.currentCharacterModel || 'Character',
                      }
                    )}
                  </span>
                </div>

                {/* Detailed backend process information */}
                <div className="space-y-1 text-xs">
                  {progress.currentCharacterProvider &&
                    progress.currentCharacterModel && (
                      <div className="flex items-center justify-between bg-background/50 rounded px-2 py-1">
                        <span className="text-muted-foreground">
                          {t(
                            'character-generation.ai-provider',
                            'AI Provider:'
                          )}
                        </span>
                        <span className="font-medium">
                          {progress.currentCharacterProvider} -{' '}
                          {progress.currentCharacterModel}
                        </span>
                      </div>
                    )}

                  <div className="flex items-center justify-between bg-background/50 rounded px-2 py-1">
                    <span className="text-muted-foreground">
                      {t(
                        'character-generation.backend-status',
                        'Backend Status:'
                      )}
                    </span>
                    <span className="font-medium text-green-600">
                      {isGenerating
                        ? t(
                            'character-generation.generating-persona',
                            'Generating persona...'
                          )
                        : t('character-generation.processing', 'Processing...')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-background/50 rounded px-2 py-1">
                    <span className="text-muted-foreground">
                      {t('character-generation.current-step', 'Current Step:')}
                    </span>
                    <span className="font-medium">
                      {progress.currentStep ||
                        t(
                          'character-generation.initializing',
                          'Initializing...'
                        )}
                    </span>
                  </div>

                  {progress.totalCharacters > 0 &&
                    progress.completedCharacters < progress.totalCharacters && (
                      <div className="flex items-center justify-between bg-background/50 rounded px-2 py-1">
                        <span className="text-muted-foreground">
                          {t('character-generation.remaining', 'Remaining:')}
                        </span>
                        <span className="font-medium text-blue-600">
                          {progress.totalCharacters -
                            progress.completedCharacters}{' '}
                          characters
                        </span>
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* Unified estimated time display */}
            {progress.totalCharacters > 0 &&
              progress.completedCharacters < progress.totalCharacters && (
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Clock className="w-3 h-3" />
                  {t(
                    'character-generation.estimated-time',
                    'Estimated time: {{minutes}} minutes',
                    {
                      minutes: Math.ceil(
                        (progress.totalCharacters -
                          progress.completedCharacters) *
                          0.5
                      ),
                    }
                  )}
                </div>
              )}
          </div>

          {/* Enhanced progress bar with more details */}
          <div className="space-y-3">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{progress.currentStep}</span>
              <span>{progress.progress}%</span>
            </div>
            <Progress value={progress.progress} className="w-full h-3" />

            {/* Progress milestone indicators */}
            <div className="flex justify-between text-xs text-muted-foreground">
              <span
                className={
                  progress.progress >= 0 ? 'text-primary font-medium' : ''
                }
              >
                {t('character-generation.milestone-start', 'Start')}
              </span>
              <span
                className={
                  progress.progress >= 25 ? 'text-primary font-medium' : ''
                }
              >
                {t('character-generation.milestone-25', '25%')}
              </span>
              <span
                className={
                  progress.progress >= 50 ? 'text-primary font-medium' : ''
                }
              >
                {t('character-generation.milestone-50', '50%')}
              </span>
              <span
                className={
                  progress.progress >= 75 ? 'text-primary font-medium' : ''
                }
              >
                {t('character-generation.milestone-75', '75%')}
              </span>
              <span
                className={
                  progress.progress >= 100 ? 'text-green-600 font-medium' : ''
                }
              >
                {t('character-generation.milestone-complete', 'Complete')}
              </span>
            </div>
          </div>

          {/* Backend API activity log */}
          {(isGenerating || progress.progress > 0) && (
            <Card className="bg-secondary/5 border-secondary/20">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Code className="w-4 h-4" />
                  {t(
                    'character-generation.backend-status-title',
                    'Backend Status'
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="py-3">
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {t(
                        'character-generation.generation-phase',
                        'Generation Phase:'
                      )}
                    </span>
                    <span className="font-medium text-primary">
                      {progress.currentStep === 'Complete'
                        ? t('character-generation.finished', 'Finished')
                        : t('character-generation.active', 'Active')}
                    </span>
                  </div>
                  {progress.currentCharacterProvider && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {t('character-generation.ai-service', 'AI Service:')}
                      </span>
                      <span className="font-medium">
                        {progress.currentCharacterProvider}
                        {t('character-generation.api-suffix', ' API')}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {t('character-generation.progress', 'Progress:')}
                    </span>
                    <span className="font-medium text-green-600">
                      {t(
                        'character-generation.characters-generated',
                        '{{completed}}/{{total}} characters generated',
                        {
                          completed: progress.completedCharacters,
                          total: progress.totalCharacters,
                        }
                      )}
                    </span>
                  </div>
                  {isGenerating && (
                    <div className="flex items-center gap-2 text-primary">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>
                        {t(
                          'character-generation.processing-personas',
                          'Processing character personas...'
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Prompt Display Toggle */}
          {progress.currentCharacterName &&
            progress.currentCharacterProvider && (
              <div className="space-y-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPrompt(!showPrompt)}
                  className="flex items-center gap-2 text-xs"
                >
                  {showPrompt ? (
                    <>
                      <EyeOff className="w-3 h-3" />
                      {t('character-generation.hide-prompt', 'Hide Prompt')}
                    </>
                  ) : (
                    <>
                      <Eye className="w-3 h-3" />
                      {t('character-generation.show-prompt', 'Show Prompt')}
                    </>
                  )}
                </Button>

                {showPrompt && currentPrompt && (
                  <Card className="bg-secondary/10 border-secondary/20">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Code className="w-4 h-4" />
                        {t('character-generation.prompt-title', 'AI Prompt')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-3 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {t(
                          'character-generation.prompt-description',
                          'This is the prompt being sent to {{provider}} ({{model}}) to generate the character:',
                          {
                            provider: progress.currentCharacterProvider,
                            model: progress.currentCharacterModel,
                          }
                        )}
                      </p>
                      <div className="bg-background/50 rounded-md p-3 max-h-40 overflow-y-auto">
                        <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">
                          {currentPrompt}
                        </pre>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <Users className="w-4 h-4" />
              {t('character-generation.characters-list', 'Characters')}
              <span className="text-xs bg-secondary/20 px-2 py-1 rounded">
                {progress.completedCharacters}/{progress.totalCharacters}
              </span>
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
                  currentProvider={progress.currentCharacterProvider}
                  currentModel={progress.currentCharacterModel}
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

          <div className="text-center text-xs text-muted-foreground bg-secondary/10 rounded-lg p-3">
            {t(
              'character-generation.description',
              'Each character is being given a unique personality, backstory, and appearance to make your game immersive and engaging.'
            )}
            <br />
            <span className="text-primary font-medium">
              {t(
                'character-generation.backend-processes',
                'Backend processes are running to create AI personas with detailed characteristics.'
              )}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
