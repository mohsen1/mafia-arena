'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useGameContext } from '@/context/GameContext';
import type { FilteredPlayer } from '@/lib/interfaces/gameState.types';
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
import { SpeechInput } from './SpeechInput';
import { Mic, Loader2 } from 'lucide-react';
import { addAudioBreadcrumb } from '@/components/AudioDebugOverlay';

export default function HumanChatInput() {
  const { t } = useTranslation();
  const { gameState, submitHumanAction, isLoadingNextTurn } = useGameContext();

  const [message, setMessage] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showSpeechInput, setShowSpeechInput] = useState(false);

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
    async (
      e?:
        | React.FormEvent<HTMLFormElement>
        | React.MouseEvent<HTMLButtonElement>
        | React.KeyboardEvent<HTMLInputElement>
    ) => {
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
          if (!message.trim()) {
            setIsSubmitting(false);
            return;
          }

          // Log user message submission
          console.log('[HumanChatInput] 💬 USER MESSAGE SUBMITTED:', {
            messageContent: message,
            messageLength: message.length,
            timestamp: new Date().toISOString(),
            playerId: humanPlayerId,
            gamePhase: gameState?.phase,
          });

          addAudioBreadcrumb('User message sent', {
            length: message.length,
            phase: gameState?.phase,
          });

          payload = {
            playerId: humanPlayerId,
            type: 'message',
            content: message,
          };
          setMessage('');
        } else if (pendingAction.allowedActions.includes('vote')) {
          if (selectedTarget === undefined || selectedTarget === null) {
            setIsSubmitting(false);
            return;
          }

          // Log vote submission
          console.log('[HumanChatInput] 🗳️ VOTE SUBMITTED:', {
            voter: humanPlayerId,
            target: selectedTarget,
            timestamp: new Date().toISOString(),
            gamePhase: gameState?.phase,
          });

          addAudioBreadcrumb('Vote submitted', {
            target: selectedTarget,
            phase: gameState?.phase,
          });

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
          setMessage('');
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
      message,
      selectedTarget,
      isSubmitting,
      gameId,
      humanPlayerId,
      submitHumanAction,
    ]
  );

  // Define handleKeyDown after handleSubmit
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Submit on Enter (without shift)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e as any);
      }
    },
    [handleSubmit]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Focus input on '/' key
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }

      // Submit on Ctrl/Cmd + Enter
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && message.trim()) {
        handleSubmit(e as any);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [message, handleSubmit]);

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

      return (
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {showSpeechInput && gameState.voiceModeEnabled && (
            <SpeechInput
              onTranscript={(text) => {
                setMessage(text);
                setShowSpeechInput(false);
              }}
              onInterimTranscript={(text) => setMessage(text)}
              placeholder={placeholder}
              className="mb-3"
            />
          )}

          <div className="flex gap-2">
            <Input
              ref={inputRef}
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              className="flex-1 bg-background text-foreground dark:bg-foreground dark:text-background border-border"
              aria-label={ariaLabel}
              onKeyDown={handleKeyDown}
            />

            {gameState.voiceModeEnabled && (
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setShowSpeechInput(!showSpeechInput)}
                disabled={disabled}
                title={t('UseMicrophone', 'Use microphone')}
                className="bg-background text-foreground dark:bg-foreground dark:text-background border-border hover:bg-secondary"
              >
                <Mic className="w-4 h-4" />
              </Button>
            )}

            <Button
              type="submit"
              disabled={disabled || !message.trim()}
              className="px-6 bg-background text-foreground dark:bg-foreground dark:text-background hover:bg-secondary border border-border"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('SendingLabel', 'Sending...')}
                </>
              ) : (
                t('SendLabel', 'Send')
              )}
            </Button>
          </div>
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
        <div className="p-4 space-y-4">
          <div>
            <Label
              htmlFor="target-select"
              className="block mb-2 text-sm font-medium"
            >
              {title}
            </Label>
            <ScrollArea className="h-[200px] rounded-md border p-2">
              <div
                className="space-y-2"
                role="radiogroup"
                aria-labelledby="target-select"
              >
                {targetOptions.map((player, index) => (
                  <button
                    key={player.id}
                    onClick={() => setSelectedTarget(player.id)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left',
                      'hover:bg-secondary/50',
                      selectedTarget === player.id
                        ? 'bg-primary/10 border border-primary'
                        : 'border border-transparent'
                    )}
                    disabled={disabled}
                    role="radio"
                    aria-checked={selectedTarget === player.id}
                    aria-label={t('SelectPlayer', 'Select {{name}}', {
                      name: player.name,
                    })}
                  >
                    <div className="flex-shrink-0">
                      {player.imageUrl ? (
                        <Image
                          src={player.imageUrl}
                          alt={player.name}
                          width={40}
                          height={40}
                          className="rounded-full"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                          <span className="text-lg font-semibold">
                            {player.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{player.name}</p>
                      {player.role && player.status === PlayerStatus.Dead && (
                        <p className="text-sm text-muted-foreground">
                          {t(player.role, player.role)}
                        </p>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {index + 1}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
            <p className="text-xs text-muted-foreground mt-2">
              {t(
                'TargetKeyboardHint',
                'Use arrow keys to navigate, Enter to select'
              )}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSubmit}
              disabled={disabled || !selectedTarget}
              className="flex-1"
              aria-label={t('ConfirmAction', 'Confirm {{action}}', {
                action: buttonLabel,
              })}
            >
              {t('ConfirmButton', 'Confirm')}
            </Button>
            {canSkipNightAction && (
              <Button
                onClick={() => {
                  setSelectedTarget(null);
                  handleSubmit();
                }}
                variant="outline"
                disabled={disabled}
                aria-label={t('SkipAction', 'Skip action')}
              >
                {t('SkipButton', 'Skip')}
              </Button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="p-4 text-center text-muted-foreground italic">
        {pendingAction?.prompt || t('WaitingLabel', 'Waiting...')}
      </div>
    );
  };

  return (
    <div className="bg-foreground text-background dark:bg-background dark:text-foreground border-t">
      {renderInput()}
    </div>
  );
}
