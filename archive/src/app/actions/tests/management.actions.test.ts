import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deleteGameAction } from '@/app/actions/management.actions';
import * as persistence from '@/lib/persistence';
import * as nextCache from 'next/cache';

// Mock dependencies
vi.mock('@/lib/persistence', () => ({
  deleteGameData: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('management actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('deleteGameAction', () => {
    it('should delete a game and revalidate paths when successful', async () => {
      // Arrange
      const gameId = 'test-game-id';
      vi.mocked(persistence.deleteGameData).mockResolvedValue(undefined);

      // Act
      const result = await deleteGameAction(gameId);

      // Assert
      expect(persistence.deleteGameData).toHaveBeenCalledWith(gameId);
      expect(nextCache.revalidatePath).toHaveBeenCalledWith('/');
      expect(nextCache.revalidatePath).toHaveBeenCalledWith(`/game/${gameId}`);
      expect(result).toEqual({ success: true });
    });

    it('should return error when deleteGameData fails', async () => {
      // Arrange
      const gameId = 'failed-game-id';
      const errorMessage = 'Failed to delete game';
      vi.mocked(persistence.deleteGameData).mockRejectedValue(
        new Error(errorMessage)
      );

      // Act
      const result = await deleteGameAction(gameId);

      // Assert
      expect(persistence.deleteGameData).toHaveBeenCalledWith(gameId);
      expect(nextCache.revalidatePath).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: errorMessage,
      });
    });

    it('should handle unknown errors gracefully', async () => {
      // Arrange
      const gameId = 'unknown-error-game';
      vi.mocked(persistence.deleteGameData).mockRejectedValue(
        'Some non-Error object'
      );

      // Act
      const result = await deleteGameAction(gameId);

      // Assert
      expect(persistence.deleteGameData).toHaveBeenCalledWith(gameId);
      expect(result).toEqual({
        success: false,
        error: 'Unknown error deleting game',
      });
    });

    it('should return success even if revalidatePath fails after successful deletion', async () => {
      // Arrange
      const gameId = 'revalidate-fail-game';
      const revalidateError = new Error('Revalidation failed');
      vi.mocked(persistence.deleteGameData).mockResolvedValue(undefined);
      vi.mocked(nextCache.revalidatePath).mockRejectedValue(revalidateError); // Simulate revalidatePath throwing

      // Act
      const result = await deleteGameAction(gameId);

      // Assert
      expect(persistence.deleteGameData).toHaveBeenCalledWith(gameId);
      expect(nextCache.revalidatePath).toHaveBeenCalledWith('/'); // It will be called
      // The function currently doesn't catch errors from revalidatePath, so it still returns success
      expect(result).toEqual({ success: true });
      // Optionally, you could mock console.error and check if the revalidate error was logged
    });

    it('should return error if gameId is empty string', async () => {
      // Arrange
      const gameId = '';
      // Assuming deleteGameData would reject an empty ID
      const errorMessage = 'Invalid game ID';
      vi.mocked(persistence.deleteGameData).mockRejectedValue(
        new Error(errorMessage)
      );

      // Act
      const result = await deleteGameAction(gameId);

      // Assert
      expect(persistence.deleteGameData).toHaveBeenCalledWith(gameId);
      expect(nextCache.revalidatePath).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: errorMessage,
      });
    });
  });
});
