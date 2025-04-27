"use client";

import { useState, useCallback, useMemo } from 'react';
import { useGameContext } from '@/context/GameContext';
import type { FilteredGameState, FilteredPlayer, PlayerId } from "@/lib/interfaces/gameState.types";
import type { HumanActionPayload, PendingHumanAction } from "@/lib/interfaces/actions.types";
import { PlayerStatus } from "@/lib/engine/interfaces/IPlayer";
import { RoleName } from "@/lib/engine/interfaces/IRole";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from './ui/scroll-area';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export default function HumanChatInput() {
  const { t } = useTranslation();
  const { gameState, submitHumanAction, isLoadingNextTurn } = useGameContext();

  const [inputValue, setInputValue] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<PlayerId | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const gameId = gameState?.id;
  const humanPlayerId = gameState?.humanPlayerId;
  const pendingAction = gameState?.pendingHumanAction;
  const humanPlayer = useMemo(() => 
    humanPlayerId ? gameState?.players.find(p => p.id === humanPlayerId) : undefined,
    [gameState?.players, humanPlayerId]
  );
  
  const isPlayerTurn = pendingAction?.playerId === humanPlayerId;

  const handleSubmit = useCallback(async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (!pendingAction || !isPlayerTurn || isSubmitting || !gameId || !humanPlayerId) {
      console.warn("Submit cancelled:", { pendingAction, isPlayerTurn, isSubmitting, gameId, humanPlayerId });
      return;
    }

    setIsSubmitting(true);
    
    let payload: HumanActionPayload | null = null;

    try {
      if (pendingAction.allowedActions.includes('message')) {
          if (!inputValue.trim()) {
            setIsSubmitting(false);
            return;
          }
          payload = { type: 'message', content: inputValue };
          setInputValue('');

      } else if (pendingAction.allowedActions.includes('vote')) {
          if (selectedTarget === undefined || selectedTarget === null) {
              console.warn("No target selected for vote.");
              setIsSubmitting(false);
              return; 
          }
          payload = { type: 'vote', targetPlayerId: selectedTarget };
          setSelectedTarget(null);

      } else {
          const nightActionType = pendingAction.allowedActions.find(a => 
              a === 'mafiaKill' || a === 'doctorSave' || a === 'seerInvestigate'
          );
          if (nightActionType) {
             if (selectedTarget === undefined || (selectedTarget === null && nightActionType !== 'doctorSave')) {
                console.warn(`No target selected or invalid null target for ${nightActionType}.`);
                setIsSubmitting(false);
                return; 
             }
             payload = { type: nightActionType, targetPlayerId: selectedTarget } as HumanActionPayload;
             setSelectedTarget(null);
          } else {
             console.error("Could not determine valid action from pendingAction:", pendingAction);
          }
      }

      if (payload) {
          console.log("Submitting human action:", payload);
          await submitHumanAction(payload);
      } else {
         console.error('Could not construct payload from pendingAction:', pendingAction);
      }

    } catch (error) {
      console.error("Error submitting human action:", error);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    pendingAction, 
    isPlayerTurn,
    inputValue, 
    selectedTarget, 
    isSubmitting, 
    gameId,
    humanPlayerId,
    submitHumanAction
  ]);

  const livingPlayers = useMemo(() => 
      gameState?.players.filter(p => p.status === PlayerStatus.Alive) ?? [], 
      [gameState?.players]
  );

  const getTargetOptions = useCallback((): FilteredPlayer[] => {
    if (!pendingAction || !humanPlayerId) return [];
    
    if (pendingAction.validTargets && pendingAction.validTargets.length > 0) {
        return livingPlayers.filter(p => pendingAction.validTargets!.includes(p.id));
    }

    if (pendingAction.allowedActions.includes('vote')) {
        return livingPlayers.filter(p => p.id !== humanPlayerId);
    } else {
        const nightActionType = pendingAction.allowedActions.find(a => 
              a === 'mafiaKill' || a === 'doctorSave' || a === 'seerInvestigate'
        );
        switch (nightActionType) {
          case 'mafiaKill': 
          case 'seerInvestigate':
            return livingPlayers.filter(p => p.id !== humanPlayerId);
          case 'doctorSave':
            return livingPlayers; 
          default:
            return [];
        }
    }
  }, [pendingAction, humanPlayerId, livingPlayers]);

  const targetOptions = getTargetOptions();

  if (!gameState || !humanPlayerId || !humanPlayer || humanPlayer.status === PlayerStatus.Dead) {
    return null; 
  }

  const renderInput = () => {
    const disabled = !isPlayerTurn || isSubmitting || isLoadingNextTurn;
    
    if (!pendingAction) {
      return (
        <div className="p-4 border-t text-center text-muted-foreground italic">
          {t('WaitingLabel', "Waiting...")}
        </div>
      );
    }

    const showChatInput = pendingAction.allowedActions.includes('message');
    const showTargetSelector = pendingAction.allowedActions.some(a => 
        a === 'vote' || a === 'mafiaKill' || a === 'doctorSave' || a === 'seerInvestigate'
    );
    const canSkipNightAction = pendingAction.allowedActions.includes('doctorSave');

    if (showChatInput) {
        const isWWChat = humanPlayer?.role === RoleName.Mafia && gameState.phase === 'Night'; 
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
                 disabled={disabled}
                 className={cn("flex-grow", isWWChat && "border-red-500/50 focus:ring-red-500/50")}
               />
               <Button 
                 type="submit" 
                 disabled={disabled || !inputValue.trim()}
                 variant={isWWChat ? 'destructive' : 'default'}
               >
                 {isSubmitting ? t('SendingButtonLabel', 'Sending...') : buttonLabel}
               </Button>
             </form>
        );
    } else if (showTargetSelector) {
        const actionType = pendingAction.allowedActions.find(a => 
            a === 'vote' || a === 'mafiaKill' || a === 'doctorSave' || a === 'seerInvestigate'
        );
        const playerRoleDisplay = humanPlayer?.role ? t(humanPlayer.role, humanPlayer.role) : 'Unknown Role';
        const title = actionType === 'vote' 
              ? t('VoteTitle', 'Vote for Elimination') 
              : t('NightActionTitle', `Night Action (${playerRoleDisplay})`);
        const buttonLabel = actionType === 'vote'
              ? t('ConfirmVoteButtonLabel', 'Confirm Vote')
              : t('ConfirmActionButtonLabel', 'Confirm Action');
        
        if (targetOptions.length === 0 && !canSkipNightAction) {
            return (
              <div className="p-4 border-t text-center text-muted-foreground italic">
                {t('NoValidTargets', 'No valid targets available.')}
              </div>
            );
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
                      {player.imageUrl ? (
                        <Image
                          src={player.imageUrl}
                          alt={player.name}
                          width={24}
                          height={24}
                          className="rounded-full"
                        />
                      ) : (
                         <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-xs text-gray-600">?</div>
                      )}
                      <span>{player.name}</span>
                    </Label>
                  ))}
                  {canSkipNightAction && (
                       <Label 
                          key="skip-save" 
                          className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-muted/50 ${selectedTarget === null ? 'bg-muted font-medium' : ''}`}
                        >
                          <input
                            type="radio"
                            name="targetPlayer"
                            value="__null__"
                            checked={selectedTarget === null}
                            onChange={() => setSelectedTarget(null)}
                            disabled={!isPlayerTurn || isSubmitting}
                            className="accent-primary"
                          />
                          <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-xs text-gray-600">-</div>
                          <span>{t("DoNotSaveLabel", "(Do not save anyone)")}</span>
                        </Label>
                  )}
                </div>
              </ScrollArea>
              <Button 
                onClick={() => handleSubmit()} 
                disabled={!isPlayerTurn || isSubmitting || (selectedTarget === undefined && !canSkipNightAction) || (selectedTarget === undefined && canSkipNightAction && selectedTarget !== null) }
              >
                {isSubmitting ? t('ConfirmingButtonLabel', 'Confirming...') : buttonLabel}
              </Button>
            </div>
        );
    } 
    else {
        return (
            <div className="p-4 border-t text-center text-muted-foreground italic">
              {pendingAction?.prompt || t('WaitingLabel', "Waiting...")}
            </div>
        );
    }
  };

  return (
    <div className="bg-card shadow-sm">
      {renderInput()}
    </div>
  );
} 