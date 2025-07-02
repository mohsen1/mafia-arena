'use client'; // Make this a client component to use the hook

import Link from 'next/link';
import type { FilteredGameState } from '@/lib/interfaces/client.types';
import { deleteGameAction } from '@/app/actions/management.actions';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next'; // Import the hook
import { useState } from 'react'; // Import useState for loading state

// Define props
interface GameCardProps {
  game: FilteredGameState;
  onDelete?: (gameId: string) => void; // Optional callback after deletion
}

export default function GameCard({ game, onDelete }: GameCardProps) {
  const { t } = useTranslation(); // Use the hook
  const [isDeleting, setIsDeleting] = useState(false);

  // onClick handler for the delete button
  const handleDeleteClick = async () => {
    if (isDeleting) return;
    // Confirm deletion
    if (
      !confirm(
        t(
          'ConfirmDeleteGame',
          `Are you sure you want to delete game ${game.gameId}?`
        )
      )
    ) {
      return;
    }
    setIsDeleting(true);
    try {
      const result = await deleteGameAction(game.gameId);
      if (result.success) {
        onDelete?.(game.gameId); // Call callback if provided
        // Optionally trigger a client-side refresh or state update
      } else {
        // Handle deletion failure (e.g., show error message)
        console.error('Failed to delete game:', result.error);
        alert(t('DeleteGameError', `Failed to delete game: ${result.error}`));
      }
    } catch (error) {
      console.error('Error calling deleteGameAction:', error);
      alert(t('DeleteGameError', 'An error occurred while deleting the game.'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <li className="flex justify-between items-start gap-4 p-4 rounded-lg bg-card">
      <div className="flex-1 space-y-2">
        <h3 className="text-lg font-semibold mb-1">
          <Link
            href={`/${game.language}/game/${game.gameId}`}
            className="hover:underline text-primary"
          >
            {game.themeTitle || t('DefaultGameTitle', 'Untitled Game')}
          </Link>
        </h3>
        {game.themeDescription && (
          <p className="text-sm text-muted-foreground italic mb-2">
            {game.themeDescription}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {t('GamePhaseLabel', 'Phase')}:{' '}
          <span className="font-medium capitalize">
            {t(`GamePhase_${game.phase}`, game.phase)}
          </span>{' '}
          | {t('RoundLabel', 'Round')}:{' '}
          <span className="font-medium">{game.round}</span> |
          {t('PlayersLabel', 'Players')}:{' '}
          <span className="font-medium">
            {Object.keys(game.players).length}
          </span>{' '}
          | {t('CreatedLabel', 'Created')}:{' '}
          <span className="font-medium">
            {format(new Date(game.createdAt), 'PPpp')}
          </span>
        </p>
      </div>
      <div className="flex-shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDeleteClick}
          disabled={isDeleting}
        >
          {isDeleting
            ? t('DeletingButtonLabel', 'Deleting...')
            : t('DeleteButton', 'Delete')}
        </Button>
      </div>
    </li>
  );
}
