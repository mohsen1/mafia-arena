"use client";

import { useState, useCallback } from 'react';
import type { GameState, PendingHumanAction, Player } from '@/lib/types/game';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from './ui/scroll-area';
import Image from 'next/image';

interface HumanChatInputProps {
  gameState: GameState;
  humanPlayerId: string;
  isPlayerTurn: boolean;
  onSubmitAction: (
    payload: 
      | { type: 'chat'; content: string } 
      | { type: 'vote'; targetPlayerId: string } 
      | { type: 'nightAction'; targetPlayerId: string } 
  ) => Promise<void>;
}

export default function HumanChatInput({ gameState, humanPlayerId, isPlayerTurn, onSubmitAction }: HumanChatInputProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pendingAction = gameState.pendingHumanAction;
  const humanPlayer = gameState.players[humanPlayerId];

  const handleSubmit = useCallback(async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (!pendingAction || isSubmitting) return;

    setIsSubmitting(true);
    let payload: 
      | { type: 'chat'; content: string } 
      | { type: 'vote'; targetPlayerId: string } 
      | { type: 'nightAction'; targetPlayerId: string };

    switch (pendingAction.type) {
      case 'chat':
        if (!inputValue.trim()) {
          setIsSubmitting(false);
          return; // Don't submit empty messages
        }
        payload = { type: 'chat', content: inputValue };
        break;
      case 'vote':
      case 'nightAction':
        if (!selectedTarget) {
            console.warn("No target selected for vote/night action.");
            setIsSubmitting(false);
            return; 
        }
        payload = { type: pendingAction.type, targetPlayerId: selectedTarget };
        break;
      default:
        console.error('Unknown pending action type:', pendingAction.type);
        setIsSubmitting(false);
        return;
    }

    try {
      await onSubmitAction(payload);
      setInputValue(''); // Clear input after successful submission
      setSelectedTarget(null); // Clear selection
    } catch (error) {
      console.error("Error submitting human action:", error);
      // Optionally show an error message to the user
    } finally {
      setIsSubmitting(false);
    }
  }, [pendingAction, inputValue, selectedTarget, onSubmitAction, isSubmitting]);

  if (!humanPlayer || humanPlayer.status === 'dead') {
    return null; // Don't render if no pending action or human is dead
  }

  // Helper to get target options based on action type
  const getTargetOptions = (): Player[] => {
    if (!pendingAction) return [];
    
    const livingPlayers = gameState.livingPlayerIds
        .map(id => gameState.players[id])
        .filter(p => p.status === 'alive');

    switch (pendingAction.type) {
      case 'vote':
        return livingPlayers.filter(p => p.id !== humanPlayerId); // Cannot vote for self
      case 'nightAction':
        switch (humanPlayer.role) {
          case 'Werewolf':
            // Werewolves target non-werewolves
            return livingPlayers.filter(p => p.role !== 'Werewolf');
          case 'Seer':
            // Seer targets anyone but self
            return livingPlayers.filter(p => p.id !== humanPlayerId);
          case 'Doctor':
            // Doctor can target anyone (including self)
            return livingPlayers; 
          default:
            return []; // Villagers have no night action
        }
      default:
        return [];
    }
  };

  const targetOptions = getTargetOptions();

  const renderInput = () => {
    // If there's no pending action, render nothing or a disabled placeholder
    if (!pendingAction) {
      return (
        <div className="p-4 border-t text-center text-muted-foreground italic">
          {t('NotYourTurnLabel', "Waiting for other players...")}
        </div>
      );
    }

    switch (pendingAction.type) {
      case 'chat':
        return (
          <form onSubmit={handleSubmit} className="flex items-center gap-2 p-4 border-t">
            <Input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={t('TypeYourMessagePlaceholder', 'Type your message...')}
              aria-label={t('ChatMessageInputLabel', 'Chat message input')}
              disabled={!isPlayerTurn || isSubmitting}
              className="flex-grow"
            />
            <Button type="submit" disabled={!isPlayerTurn || isSubmitting || !inputValue.trim()}>
              {isSubmitting ? t('SendingButtonLabel', 'Sending...') : t('SendButtonLabel', 'Send')}
            </Button>
          </form>
        );
      case 'vote':
      case 'nightAction':
        {
          const title = pendingAction.type === 'vote' 
              ? t('VoteTitle', 'Vote for Elimination') 
              : t('NightActionTitle', `Night Action (${humanPlayer.role})`);
          const buttonLabel = pendingAction.type === 'vote'
              ? t('ConfirmVoteButtonLabel', 'Confirm Vote')
              : t('ConfirmActionButtonLabel', 'Confirm Action');

          if (targetOptions.length === 0) {
              return <p className="p-4 text-muted-foreground italic">{t('NoValidTargets', 'No valid targets available.')}</p>;
          }

          return (
            <div className="p-4 border-t flex flex-col gap-3 h-full overflow-hidden">
              <h4 className="font-semibold text-center">{title}</h4>
              <ScrollArea className="flex-1 max-h-48 border rounded-md">
                <div className="p-2 space-y-1">
                {targetOptions.map((player) => (
                  <Label 
                    key={player.id} 
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-muted/50 ${selectedTarget === player.id ? 'bg-muted font-medium' : ''}`}
                  >
                    <input
                      type="radio"
                      name="targetPlayer"
                      value={player.id}
                      checked={selectedTarget === player.id}
                      onChange={() => setSelectedTarget(player.id)}
                      disabled={!isPlayerTurn || isSubmitting}
                      className="accent-primary"
                    />
                    {player.imageUrl && (
                      <Image
                        src={player.imageUrl}
                        alt={player.name}
                        width={24}
                        height={24}
                        className="rounded-full"
                      />
                    )}
                    {!player.imageUrl && (
                       <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-xs text-gray-600">?</div>
                    )}
                    <span>{player.name}</span>
                  </Label>
                ))}
                </div>
              </ScrollArea>
              <Button 
                onClick={() => handleSubmit()} 
                disabled={!isPlayerTurn || isSubmitting || !selectedTarget}
              >
                {isSubmitting ? t('ConfirmingButtonLabel', 'Confirming...') : buttonLabel}
              </Button>
            </div>
          );
        }
      default:
        return null;
    }
  };

  return (
    <div className="bg-background shadow-sm">
      {renderInput()}
    </div>
  );
} 