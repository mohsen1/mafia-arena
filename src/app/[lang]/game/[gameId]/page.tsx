import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import {
  advanceGameStateAction,
  getGameStateAction,
} from '@/app/actions/gameplay.actions';
import { submitHumanAction } from '@/app/actions/human.actions';
import GameClient from './GameClient';
import type { LanguageCode } from '@/lib/i18n/settings';

interface GamePageProps {
  params: Promise<{ gameId: string; lang: LanguageCode }>;
}

export default async function GamePage({
  params: paramsPromise,
}: GamePageProps) {
  const params = await paramsPromise;
  const { gameId, lang } = params;

  // Check authentication at the page level
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    notFound(); // Redirect to 404 if not authenticated
  }

  // Use the authenticated server action to get game state
  const gameStateResult = await getGameStateAction(gameId);

  // Handle error responses from the server action
  if ('error' in gameStateResult) {
    notFound(); // Game not found or user doesn't have permission
  }

  const boundAdvanceGameStateAction = advanceGameStateAction.bind(null, gameId);
  const boundSubmitHumanAction = submitHumanAction.bind(null, gameId);

  return (
    <GameClient
      initialGameState={gameStateResult}
      gameId={gameId}
      lang={lang}
      boundAdvanceGameStateAction={boundAdvanceGameStateAction}
      boundSubmitHumanAction={boundSubmitHumanAction}
    />
  );
}
