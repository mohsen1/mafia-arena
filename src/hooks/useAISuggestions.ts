import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameContext } from '@/context/GameContext';
import { getAIResponse } from '@/lib/services/openaiService';
import type { FilteredPlayer } from '@/lib/interfaces/gameState.types';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export interface AISuggestion {
  id: string;
  content: string;
}

export function useAISuggestions() {
  const { gameState } = useGameContext();
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRequestRef = useRef<string>('');

  const humanPlayerId = gameState?.humanPlayerId;
  const humanPlayer = gameState?.players?.[humanPlayerId || ''] as
    | FilteredPlayer
    | undefined;
  const pendingAction = gameState?.pendingHumanAction;

  const createGameContext = useCallback((): string => {
    if (!gameState || !humanPlayer) return '';

    const isWerewolfChat =
      humanPlayer.role === 'Mafia' && gameState.phase === 'Night';
    const alivePlayersCount = Object.values(gameState.players || {}).filter(
      (p: FilteredPlayer) => p.status === 'Alive'
    ).length;

    let context = `Phase: ${gameState.phase}, Round: ${gameState.round}, Players alive: ${alivePlayersCount}`;

    if (humanPlayer.role) {
      context += `, Your role: ${humanPlayer.role}`;
    }

    if (isWerewolfChat) {
      context += `, This is private werewolf chat`;
    }

    if (gameState.phase === 'Day' && gameState.round === 1) {
      context += `, This is the introduction phase`;
    }

    return context;
  }, [gameState, humanPlayer]);

  useEffect(() => {
    if (
      !gameState ||
      !humanPlayer ||
      !pendingAction ||
      !pendingAction.allowedActions.includes('message') ||
      !humanPlayerId
    ) {
      setSuggestions([]);
      return;
    }

    const requestKey = `${gameState.id}-${gameState.phase}-${gameState.round}-${humanPlayer.role}`;

    // Avoid duplicate requests
    if (lastRequestRef.current === requestKey) {
      return;
    }
    lastRequestRef.current = requestKey;

    const generateSuggestions = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const context = createGameContext();
        const messages: ChatCompletionMessageParam[] = [
          {
            role: 'system',
            content: `You are helping a player in a Werewolf/Mafia game generate appropriate message suggestions. 
            Generate 3 short, contextually appropriate messages that the player might want to send.
            Each message should be 1-2 sentences and reflect the game situation.
            Return only a JSON array of strings, no other text.
            
            Context: ${context}`,
          },
          {
            role: 'user',
            content:
              'Generate 3 appropriate message suggestions for this game situation.',
          },
        ];

        const response = await getAIResponse(
          messages,
          gameState.id,
          humanPlayerId,
          {
            model: 'gpt-3.5-turbo',
            temperature: 0.7,
            max_tokens: 200,
            response_format: { type: 'json_object' },
          }
        );

        // Parse the response as JSON
        const parsed = JSON.parse(response);
        const suggestionsArray = Array.isArray(parsed)
          ? parsed
          : parsed.suggestions || [];

        const formattedSuggestions: AISuggestion[] = suggestionsArray
          .slice(0, 3)
          .map((content: string, index: number) => ({
            id: `suggestion-${Date.now()}-${index}`,
            content: content.trim(),
          }));

        setSuggestions(formattedSuggestions);
      } catch (err) {
        console.error('Error generating AI suggestions:', err);
        setError('Failed to generate suggestions');
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    };

    generateSuggestions();
  }, [gameState, humanPlayer, pendingAction, humanPlayerId, createGameContext]);

  return {
    suggestions,
    isLoading,
    error,
    refresh: () => {
      lastRequestRef.current = '';
      // Trigger re-generation by clearing the ref
    },
  };
}
