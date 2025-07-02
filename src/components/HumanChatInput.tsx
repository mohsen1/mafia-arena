'use client';

import { useState, useCallback, useMemo } from 'react';
import { useGameContext } from '@/context/GameContext';
import type {
  FilteredPlayer,
  PlayerId,
} from '@/lib/interfaces/gameState.types';
import type { HumanActionPayload } from '@/lib/interfaces/actions.types';
import { PlayerStatus } from '@/lib/engine/interfaces/IPlayer';
import { RoleName } from '@/lib/engine/interfaces/IRole';
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
  const humanPlayer = useMemo(
    () =>
      humanPlayerId && gameState?.players
        ? Object.values(gameState.players).find(
            (p: FilteredPlayer) => p.id === humanPlayerId
          )
        : undefined,
    [gameState?.players, humanPlayerId]
  );

  const isPlayerTurn = pendingAction?.playerId === humanPlayerId;

  const handleSubmit = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();
      if (
        !pendingAction ||
        !isPlayerTurn ||
        isSubmitting ||
        !gameId ||
        !humanPlayerId
      ) {
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
          payload = {
            playerId: humanPlayerId,
            type: 'message',
            content: inputValue,
          };
          setInputValue('');
        } else if (pendingAction.allowedActions.includes('vote')) {
          if (selectedTarget === undefined || selectedTarget === null) {
            setIsSubmitting(false);
            return;
          }
          payload = {
            playerId: humanPlayerId,
            type: 'vote',
            targetPlayerId: selectedTarget,
          };
          setSelectedTarget(null);
        } else {
          const nightActionType = pendingAction.allowedActions.find(
            (a) =>
              a === 'mafiaKill' || a === 'doctorSave' || a === 'seerInvestigate'
          );
          if (nightActionType) {
            if (
              selectedTarget === undefined ||
              (selectedTarget === null && nightActionType !== 'doctorSave')
            ) {
              setIsSubmitting(false);
              return;
            }
            payload = {
              playerId: humanPlayerId,
              type: nightActionType,
              targetPlayerId: selectedTarget,
            };
            setSelectedTarget(null);
          }
        }

        if (payload) {
          await submitHumanAction(payload);
          setInputValue('');
          setSelectedTarget(null);
        } else {
          console.error(
            'Could not determine valid action payload from pendingAction:',
            pendingAction
          );
        }
      } catch (error) {
        console.error('Error submitting human action:', error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      pendingAction,
      isPlayerTurn,
      inputValue,
      selectedTarget,
      isSubmitting,
      gameId,
      humanPlayerId,
      submitHumanAction,
    ]
  );

  const livingPlayers = useMemo(
    () =>
      gameState?.players
        ? Object.values(gameState.players).filter(
            (p: FilteredPlayer) => p.status === PlayerStatus.Alive
          )
        : [],
    [gameState?.players]
  );

  const getTargetOptions = useCallback((): FilteredPlayer[] => {
    if (!pendingAction || !humanPlayerId) return [];

    const validTargetsSet = pendingAction.validTargets
      ? new Set(pendingAction.validTargets)
      : null;
    if (validTargetsSet) {
      return livingPlayers.filter((p: FilteredPlayer) =>
        validTargetsSet.has(p.id)
      );
    }

    if (pendingAction.allowedActions.includes('vote')) {
      return livingPlayers.filter(
        (p: FilteredPlayer) => p.id !== humanPlayerId
      );
    }

    const nightActionType = pendingAction.allowedActions.find(
      (a) => a === 'mafiaKill' || a === 'doctorSave' || a === 'seerInvestigate'
    );
    switch (nightActionType) {
      case 'mafiaKill':
      case 'seerInvestigate':
        return livingPlayers.filter(
          (p: FilteredPlayer) => p.id !== humanPlayerId
        );
      case 'doctorSave':
        return livingPlayers;
      default:
        return [];
    }
  }, [pendingAction, humanPlayerId, livingPlayers]);

  const targetOptions = getTargetOptions();

  if (
    !gameState ||
    !humanPlayerId ||
    !humanPlayer ||
    humanPlayer.status === PlayerStatus.Dead
  ) {
    return null;
  }

  const renderInput = () => {
    const disabled = !isPlayerTurn || isSubmitting || isLoadingNextTurn;

    if (!pendingAction) {
      return (
        <div className="p-4 text-center text-muted-foreground italic">
          {t('WaitingLabel', 'Waiting...')}
        </div>
      );
    }

    const showChatInput = pendingAction.allowedActions.includes('message');
    const showTargetSelector = pendingAction.allowedActions.some(
      (a) =>
        a === 'vote' ||
        a === 'mafiaKill' ||
        a === 'doctorSave' ||
        a === 'seerInvestigate'
    );
    const canSkipNightAction =
      pendingAction.allowedActions.includes('doctorSave');

    if (showChatInput) {
      const isWWChat =
        humanPlayer?.role === RoleName.Mafia && gameState.phase === 'Night';
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
        <form onSubmit={handleSubmit} className="flex items-center gap-2 p-4">
          <Input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={placeholder}
            aria-label={ariaLabel}
            disabled={disabled}
            className={cn(
              'flex-grow',
              isWWChat && 'border-destructive/50 focus:ring-destructive/50'
            )}
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
    }

    if (showTargetSelector) {
      const actionType = pendingAction.allowedActions.find(
        (a) =>
          a === 'vote' ||
          a === 'mafiaKill' ||
          a === 'doctorSave' ||
          a === 'seerInvestigate'
      );
      const playerRoleDisplay = humanPlayer?.role
        ? t(humanPlayer.role, humanPlayer.role)
        : t('UnknownRole', 'Unknown Role');
      const title =
        actionType === 'vote'
          ? t('VoteTitle', 'Vote for Elimination')
          : t('NightActionTitle', `Night Action (${playerRoleDisplay})`);
      const buttonLabel =
        actionType === 'vote'
          ? t('ConfirmVoteButtonLabel', 'Confirm Vote')
          : t('ConfirmActionButtonLabel', 'Confirm Action');

      if (targetOptions.length === 0 && !canSkipNightAction) {
        return (
          <div className="p-4 text-center text-muted-foreground italic">
            {t('NoValidTargets', 'No valid targets available.')}
          </div>
        );
      }

      return (
        <div className="p-4 flex flex-col gap-3 h-full overflow-hidden">
          <h4 className="font-semibold text-center">{title}</h4>
          <ScrollArea className="flex-1 max-h-[calc(100%-80px)] rounded-md bg-secondary/20">
            <div className="p-2 space-y-1">
              {targetOptions.map((player) => (
                <Label
                  key={player.id}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-muted/50',
                    selectedTarget === player.id ? 'bg-muted font-medium' : ''
                  )}
                >
                  <input
                    type="radio"
                    name="targetPlayer"
                    value={player.id}
                    checked={selectedTarget === player.id}
                    onChange={() => setSelectedTarget(player.id)}
                    disabled={disabled}
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
                    <div className="w-6 h-6 rounded-full bg-neutral-300 flex items-center justify-center text-xs text-neutral-600">
                      ?
                    </div>
                  )}
                  <span>{player.name}</span>
                </Label>
              ))}
              {canSkipNightAction && (
                <Label
                  key="skip-save"
                  className={cn(
                    'flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-muted/50',
                    selectedTarget === null ? 'bg-muted font-medium' : ''
                  )}
                >
                  <input
                    type="radio"
                    name="targetPlayer"
                    value="__null__"
                    checked={selectedTarget === null}
                    onChange={() => setSelectedTarget(null)}
                    disabled={disabled}
                    className="accent-primary"
                  />
                  <div className="w-6 h-6 rounded-full bg-neutral-300 flex items-center justify-center text-xs text-neutral-600">
                    -
                  </div>
                  <span>{t('DoNotSaveLabel', '(Do not save anyone)')}</span>
                </Label>
              )}
            </div>
          </ScrollArea>
          <Button
            onClick={() => handleSubmit()}
            disabled={
              disabled ||
              (selectedTarget === undefined &&
                (!canSkipNightAction || selectedTarget !== null))
            }
          >
            {isSubmitting
              ? t('ConfirmingButtonLabel', 'Confirming...')
              : buttonLabel}
          </Button>
        </div>
      );
    }

    return (
      <div className="p-4 text-center text-muted-foreground italic">
        {pendingAction?.prompt || t('WaitingLabel', 'Waiting...')}
      </div>
    );
  };

  return <div>{renderInput()}</div>;
}
