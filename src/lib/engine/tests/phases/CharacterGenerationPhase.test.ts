import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CharacterGenerationPhase } from '@/lib/engine/phases/CharacterGenerationPhase';
import type { Game } from '@/lib/engine/core/Game';

const createMockGameForCharacterGeneration = () => {
    let currentPhaseStep = 'Start';
    
    return {
        logEvent: vi.fn(),
        setPhaseStep: vi.fn((step: string) => { currentPhaseStep = step; }),
        getPhaseStep: vi.fn(() => currentPhaseStep),
    };
};

type MockGameForCharacterGeneration = ReturnType<typeof createMockGameForCharacterGeneration>;

describe('CharacterGenerationPhase', () => {
    let characterGenerationPhase: CharacterGenerationPhase;
    let mockGame: MockGameForCharacterGeneration;

    beforeEach(() => {
        vi.clearAllMocks();
        characterGenerationPhase = new CharacterGenerationPhase();
        mockGame = createMockGameForCharacterGeneration();
    });

    it('should have correct phase type', () => {
        expect(characterGenerationPhase.type).toBe('CharacterGeneration');
    });

    it('should set phase step to WaitingForCharacterGeneration on runStep', async () => {
        await characterGenerationPhase.runStep(mockGame as unknown as Game);
        
        expect(mockGame.setPhaseStep).toHaveBeenCalledWith('WaitingForCharacterGeneration');
        expect(mockGame.logEvent).toHaveBeenCalledWith('Character generation in progress...');
    });

    it('should stay in CharacterGeneration phase when step is not Complete', () => {
        mockGame.getPhaseStep.mockReturnValue('WaitingForCharacterGeneration');
        
        const nextPhase = characterGenerationPhase.transition(mockGame as unknown as Game);
        
        expect(nextPhase).toBe('CharacterGeneration');
    });

    it('should transition to Init phase when step is Complete', () => {
        mockGame.getPhaseStep.mockReturnValue('Complete');
        
        const nextPhase = characterGenerationPhase.transition(mockGame as unknown as Game);
        
        expect(nextPhase).toBe('Init');
    });

    it('should not cause infinite loops by staying in same phase indefinitely', async () => {
        // Run multiple steps to ensure it doesn't get stuck
        for (let i = 0; i < 5; i++) {
            await characterGenerationPhase.runStep(mockGame as unknown as Game);
            
            // Should always set the same step
            expect(mockGame.setPhaseStep).toHaveBeenCalledWith('WaitingForCharacterGeneration');
            
            // Should always transition to same phase unless manually marked complete
            const nextPhase = characterGenerationPhase.transition(mockGame as unknown as Game);
            expect(nextPhase).toBe('CharacterGeneration');
        }
        
        // Verify it was called the expected number of times
        expect(mockGame.setPhaseStep).toHaveBeenCalledTimes(5);
        expect(mockGame.logEvent).toHaveBeenCalledTimes(5);
    });

    it('should handle manual completion correctly', async () => {
        // Initial state
        await characterGenerationPhase.runStep(mockGame as unknown as Game);
        expect(characterGenerationPhase.transition(mockGame as unknown as Game)).toBe('CharacterGeneration');
        
        // Manually mark as complete (this would be done by the character generation action)
        mockGame.getPhaseStep.mockReturnValue('Complete');
        
        // Should now transition to Init
        expect(characterGenerationPhase.transition(mockGame as unknown as Game)).toBe('Init');
    });
}); 