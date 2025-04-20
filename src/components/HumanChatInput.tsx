"use client";

import { useState, useCallback } from 'react';
import type { GameState, PendingHumanAction, Player } from '@/lib/types/game';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from './ui/scroll-area';
import Image from 'next/image';
import { sendChatMessageAction, sendWerewolfChatMessageAction } from '@/app/actions/chatActions';
import { cn } from '@/lib/utils';

interface HumanChatInputProps {
  gameState: GameState;
  humanPlayerId: string;
  isPlayerTurn: boolean;
  onSubmitAction: (
    payload: 
      | { type: 'vote'; targetPlayerId: string } 
      | { type: 'nightAction'; targetPlayerId: string }
  ) => Promise<void>;
}

export default function HumanChatInput({ gameState, humanPlayerId, isPlayerTurn, onSubmitAction }: HumanChatInputProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const gameId = gameState.gameId;

  const pendingAction = gameState.pendingHumanAction;
  const humanPlayer = gameState.players[humanPlayerId];

  const handleSubmit = useCallback(async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (!pendingAction || isSubmitting || !gameId || !humanPlayerId) return;

    setIsSubmitting(true);
    
    try {
      switch (pendingAction.type) {
        case 'chat': {
          if (!inputValue.trim()) {
            setIsSubmitting(false);
            return;
          }
          await sendChatMessageAction(gameId, humanPlayerId, inputValue);
          setInputValue('');
          break;
        }
        case 'werewolfChat': {
          if (!inputValue.trim()) {
            setIsSubmitting(false);
            return;
          }
          await sendWerewolfChatMessageAction(gameId, humanPlayerId, inputValue);
          setInputValue('');
          break;
        }
        case 'vote': {
          if (!selectedTarget) {
              console.warn("No target selected for vote.");
              setIsSubmitting(false);
              return; 
          }
          await onSubmitAction({ type: 'vote', targetPlayerId: selectedTarget });
          setSelectedTarget(null);
          break;
        }
        case 'nightAction': {
          if (!selectedTarget) {
              console.warn("No target selected for night action.");
              setIsSubmitting(false);
              return; 
          }
          await onSubmitAction({ type: 'nightAction', targetPlayerId: selectedTarget });
          setSelectedTarget(null);
          break;
        }
        default: {
          const _exhaustiveCheck = pendingAction;
          console.error('Unknown pending action type:', _exhaustiveCheck);
          setIsSubmitting(false);
          return;
        }
      }
    } catch (error) {
      console.error("Error submitting human action:", error);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    pendingAction, 
    inputValue, 
    selectedTarget, 
    isSubmitting, 
    gameId,
    humanPlayerId,
    onSubmitAction
  ]);

  if (!humanPlayer || humanPlayer.status === 'dead') {
    return null;
  }

  const getTargetOptions = (): Player[] => {
    if (!pendingAction) return [];
    
    const livingPlayers = gameState.livingPlayerIds
        .map(id => gameState.players[id])
        .filter(p => p.status === 'alive');

    switch (pendingAction.type) {
      case 'vote':
        return livingPlayers.filter(p => p.id !== humanPlayerId);
      case 'nightAction':
        switch (humanPlayer.role) {
          case 'Werewolf':
            return livingPlayers.filter(p => p.role !== 'Werewolf');
          case 'Seer':
            return livingPlayers.filter(p => p.id !== humanPlayerId);
          case 'Doctor':
            return livingPlayers; 
          default:
            return [];
        }
      default:
        return [];
    }
  };

  const targetOptions = getTargetOptions();

  const renderInput = () => {
    if (!pendingAction) {
      return (
        <div className="p-4 border-t text-center text-muted-foreground italic">
          {t('NotYourTurnLabel', "Waiting for other players...")}
        </div>
      );
    }

    switch (pendingAction.type) {
      case 'chat':
      case 'werewolfChat':
        {
          const isWWChat = pendingAction.type === 'werewolfChat';
          const placeholder = isWWChat 
            ? t('TypeWerewolfChatMessagePlaceholder', 'Werewolf chat...') 
            : t('TypeYourMessagePlaceholder', 'Type your message...');
          const ariaLabel = isWWChat
            ? t('WerewolfChatMessageInputLabel', 'Werewolf chat message input')
            : t('ChatMessageInputLabel', 'Chat message input');
          const buttonLabel = isWWChat
            ? t('SendWerewolfChatButtonLabel', 'Send (Pack)')
            : t('SendButtonLabel', 'Send');

          return (
            <form onSubmit={handleSubmit} className="flex items-center gap-2 p-4 border-t">
              <Input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={placeholder}
                aria-label={ariaLabel}
                disabled={!isPlayerTurn || isSubmitting}
                className={cn("flex-grow", isWWChat && "border-red-500/50 focus:ring-red-500/50")}
              />
              <Button 
                type="submit" 
                disabled={!isPlayerTurn || isSubmitting || !inputValue.trim()}
                variant={isWWChat ? 'destructive' : 'default'}
              >
                {isSubmitting ? t('SendingButtonLabel', 'Sending...') : buttonLabel}
              </Button>
            </form>
          );
        }
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