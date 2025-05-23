// tests/phases/DayPhase.test.ts
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { DayPhase } from '@/lib/engine/phases/DayPhase';
import type { Game } from '@/lib/engine/core/Game';
import { Player } from '@/lib/engine/core/Player';
import { type IRole, RoleName } from '@/lib/engine/interfaces/IRole';
import { VillagerRole } from '@/lib/engine/roles/VillagerRole';
import { MafiaRole } from '@/lib/engine/roles/MafiaRole';
import type { IAgent, PlayerAction } from '@/lib/engine/interfaces/IAgent';
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer';
import { MessageVisibility } from '@/lib/engine/interfaces/IMessage';
import type { AgentConfig } from '@/lib/interfaces/agent.types';

const createMockGameForDayPhase = () => {
    let currentPhaseStep = 'Start';
    let currentPlayerIndex = 0;
    let currentRound = 1;
    const humanVotes = new Map<PlayerId, PlayerId | null>();

    return {
        logMessage: vi.fn(),
        getPlayer: vi.fn(),
        getAlivePlayers: vi.fn().mockReturnValue([]),
        killPlayer: vi.fn(),
        recordVoteResultsInMemory: vi.fn(),
        requestPlayerAction: vi.fn().mockResolvedValue({ type: 'noAction' } as PlayerAction),
        notifyRenderers: vi.fn(),
        get round() { return currentRound; },
        set round(val: number) { currentRound = val; },
        get language() { return 'en'; },
        checkWinCondition: vi.fn().mockReturnValue(null),
        advanceToPhase: vi.fn(),
        getPhaseStep: vi.fn(() => currentPhaseStep),
        setPhaseStep: vi.fn((step: string) => { currentPhaseStep = step; }),
        getNextPlayerIndexToAction: vi.fn(() => currentPlayerIndex),
        setNextPlayerIndexToAction: vi.fn((index: number) => { currentPlayerIndex = index; }),
        setPhaseResults: vi.fn(),
        getVotes: vi.fn(() => humanVotes),
        recordHumanVote: vi.fn((voterId: PlayerId, targetId: PlayerId | null) => {
            humanVotes.set(voterId, targetId);
        }),
        clearPendingHumanAction: vi.fn(),
        getPendingHumanAction: vi.fn().mockReturnValue(null),
    };
};
type MockGameForDayPhase = ReturnType<typeof createMockGameForDayPhase>;

const createMockPlayerForDayPhase = (id: PlayerId, name: string, role: IRole, isHuman = false): Player => {
    const agentMock = vi.fn().mockResolvedValue({type: 'noAction'} as PlayerAction);
    const agent: IAgent = {
        id: `agent-${id}`,
        agentName: isHuman ? 'HumanAgent' : 'MockAgent',
        persona: undefined,
        getAction: agentMock
    };
    const agentConfig: AgentConfig = { agentType: isHuman ? 'Human' : 'Mock' };
    return new Player(id, name, role, agent, agentConfig, null);
};


describe('DayPhase', () => {
    let dayPhase: DayPhase;
    let mockGame: MockGameForDayPhase;
    let p1: Player;
    let p2: Player;
    let p3: Player;
    let p4: Player;

    beforeEach(() => {
        vi.clearAllMocks();
        dayPhase = new DayPhase();
        mockGame = createMockGameForDayPhase();

        p1 = createMockPlayerForDayPhase('p1', 'Player1', new VillagerRole());
        p2 = createMockPlayerForDayPhase('p2', 'Player2', new VillagerRole());
        p3 = createMockPlayerForDayPhase('p3', 'Player3', new MafiaRole());
        p4 = createMockPlayerForDayPhase('p4', 'Player4', new VillagerRole());

        mockGame.getAlivePlayers.mockReturnValue([p1, p2, p3]);
        mockGame.getPlayer.mockImplementation((id) => {
            if (id === 'p1') return p1; if (id === 'p2') return p2;
            if (id === 'p3') return p3; if (id === 'p4') return p4;
            return undefined;
        });
    });

    async function runPlayerLoop(game: MockGameForDayPhase, phase: DayPhase, players: Player[]) {
        for (let i = 0; i <= players.length; i++) {
            game.setNextPlayerIndexToAction(i);
            await phase.runStep(game as unknown as Game);
        }
    }

    it('should run Introduction step for round 1', async () => {
        mockGame.round = 1;
        const alivePlayers = [p1, p2, p3];
        mockGame.getAlivePlayers.mockReturnValue(alivePlayers);

        // Set up the mock to return the appropriate actions based on the player
        mockGame.requestPlayerAction.mockImplementation((player) => {
            if (player.id === 'p1') return Promise.resolve({ type: 'message', content: 'P1 intro' });
            if (player.id === 'p2') return Promise.resolve({ type: 'message', content: 'P2 intro' });
            if (player.id === 'p3') return Promise.resolve({ type: 'message', content: 'P3 intro' });
            return Promise.resolve({ type: 'noAction' });
        });

        // Start
        mockGame.setPhaseStep('Start'); mockGame.setNextPlayerIndexToAction(0);
        await dayPhase.runStep(mockGame as unknown as Game); // This sets step to Introduction
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, "Day begins...", MessageVisibility.Public);
        expect(mockGame.getPhaseStep()).toBe('Introduction');
        
        // Now check for the introduction message when we actually start the Introduction step
        mockGame.setNextPlayerIndexToAction(0);  // Reset to start Introduction
        await dayPhase.runStep(mockGame as unknown as Game);
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, "Let's begin with introductions. Please introduce yourself.", MessageVisibility.Public);
        expect(mockGame.logMessage).toHaveBeenCalledWith(p1.id, 'P1 intro', MessageVisibility.Public);

        // Player 2 Intro
        mockGame.setNextPlayerIndexToAction(1);
        await dayPhase.runStep(mockGame as unknown as Game);
        expect(mockGame.logMessage).toHaveBeenCalledWith(p2.id, 'P2 intro', MessageVisibility.Public);

        // Player 3 Intro
        mockGame.setNextPlayerIndexToAction(2);
        await dayPhase.runStep(mockGame as unknown as Game);
        expect(mockGame.logMessage).toHaveBeenCalledWith(p3.id, 'P3 intro', MessageVisibility.Public);

        // After all intros
        mockGame.setNextPlayerIndexToAction(alivePlayers.length); // Index is now past last player
        await dayPhase.runStep(mockGame as unknown as Game);
        expect(mockGame.getPhaseStep()).toBe('Voting'); // After intros, should go to Voting
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, "Introduction complete.", MessageVisibility.Public);
        
        // Now when the Voting step starts, it should log the voting message
        mockGame.setNextPlayerIndexToAction(0);  // Reset to start Voting
        await dayPhase.runStep(mockGame as unknown as Game);
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, "Voting phase: Choose who to execute.", MessageVisibility.Public);
    });

    it('should run Discussion, Voting, Tally, and Finished steps for round > 1', async () => {
        mockGame.round = 2;
        const alivePlayers = [p1, p2, p3];
        mockGame.getAlivePlayers.mockReturnValue(alivePlayers);

        // Set up mocks based on the current phase step rather than call count
        mockGame.requestPlayerAction.mockImplementation((player) => {
            const currentStep = mockGame.getPhaseStep();
            if (currentStep === 'Discussion') {
                if (player.id === 'p1') return Promise.resolve({ type: 'message', content: 'P1 discussing' });
                if (player.id === 'p2') return Promise.resolve({ type: 'message', content: 'P2 discussing' });
                if (player.id === 'p3') return Promise.resolve({ type: 'message', content: 'P3 discussing' });
            }
            if (currentStep === 'Voting') {
                if (player.id === 'p1') return Promise.resolve({ type: 'vote', targetPlayerId: 'p2' });
                if (player.id === 'p2') return Promise.resolve({ type: 'vote', targetPlayerId: 'p1' });
                if (player.id === 'p3') return Promise.resolve({ type: 'noAction' });
            }
            return Promise.resolve({ type: 'noAction' });
        });

        // Start
        mockGame.setPhaseStep('Start'); mockGame.setNextPlayerIndexToAction(0);
        await dayPhase.runStep(mockGame as unknown as Game);
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, "Day begins...", MessageVisibility.Public);
        expect(mockGame.getPhaseStep()).toBe('Discussion');
        
        // Run Discussion phase for all players
        mockGame.setNextPlayerIndexToAction(0);
        await dayPhase.runStep(mockGame as unknown as Game); // P1 + Discussion message
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, "Discussion phase:", MessageVisibility.Public);
        expect(mockGame.logMessage).toHaveBeenCalledWith('p1', 'P1 discussing', MessageVisibility.Public);

        mockGame.setNextPlayerIndexToAction(1);
        await dayPhase.runStep(mockGame as unknown as Game); // P2
        expect(mockGame.logMessage).toHaveBeenCalledWith('p2', 'P2 discussing', MessageVisibility.Public);

        mockGame.setNextPlayerIndexToAction(2);
        await dayPhase.runStep(mockGame as unknown as Game); // P3
        expect(mockGame.logMessage).toHaveBeenCalledWith('p3', 'P3 discussing', MessageVisibility.Public);

        mockGame.setNextPlayerIndexToAction(3); // Past last player
        await dayPhase.runStep(mockGame as unknown as Game); // Transition to Voting
        expect(mockGame.getPhaseStep()).toBe('Voting');
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, "Discussion complete.", MessageVisibility.Public);

        // Run Voting phase
        mockGame.setNextPlayerIndexToAction(0);
        await dayPhase.runStep(mockGame as unknown as Game); // Voting message + P1 vote
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, "Voting phase: Choose who to execute.", MessageVisibility.Public);
        expect(mockGame.logMessage).toHaveBeenCalledWith('p1', 'votes for Player2.', MessageVisibility.Public);

        mockGame.setNextPlayerIndexToAction(1);
        await dayPhase.runStep(mockGame as unknown as Game); // P2 vote
        expect(mockGame.logMessage).toHaveBeenCalledWith('p2', 'votes for Player1.', MessageVisibility.Public);

        mockGame.setNextPlayerIndexToAction(2);
        await dayPhase.runStep(mockGame as unknown as Game); // P3 abstain
        expect(mockGame.logMessage).toHaveBeenCalledWith('p3', 'chose no action (abstains from voting).', MessageVisibility.Public);

        mockGame.setNextPlayerIndexToAction(3);
        await dayPhase.runStep(mockGame as unknown as Game); // Transition to TallyVotes
        expect(mockGame.getPhaseStep()).toBe('TallyVotes');
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, "Voting complete.", MessageVisibility.Public);

        // TallyVotes
        mockGame.setNextPlayerIndexToAction(0);
        await dayPhase.runStep(mockGame as unknown as Game);
        // No majority, no one executed in this setup
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, "The vote did not reach a majority. No one is executed.", MessageVisibility.Public);
        expect(mockGame.killPlayer).not.toHaveBeenCalled();
        expect(mockGame.getPhaseStep()).toBe('Finished');

        // Finished
        mockGame.setNextPlayerIndexToAction(0);
        await dayPhase.runStep(mockGame as unknown as Game);
        expect(mockGame.advanceToPhase).toHaveBeenCalledWith('Night');
    });

    it('should execute player with majority votes', async () => {
        mockGame.round = 2;
        const alivePlayers = [p1, p2, p3]; // 3 alive players, majority is 2
        mockGame.getAlivePlayers.mockReturnValue(alivePlayers);

        // Set up a simpler mock that tracks the current step
        mockGame.requestPlayerAction.mockImplementation((player) => {
            const currentStep = mockGame.getPhaseStep();
            if (currentStep === 'Discussion') {
                return Promise.resolve({ type: 'noAction' });
            }
            if (currentStep === 'Voting') {
                if (player.id === 'p1') return Promise.resolve({ type: 'vote', targetPlayerId: 'p3' });
                if (player.id === 'p2') return Promise.resolve({ type: 'vote', targetPlayerId: 'p3' }); // p3 gets 2 votes (majority)
                if (player.id === 'p3') return Promise.resolve({ type: 'vote', targetPlayerId: 'p1' });
            }
            return Promise.resolve({ type: 'noAction' });
        });

        mockGame.setPhaseStep('Start'); 
        await dayPhase.runStep(mockGame as unknown as Game); // To Discussion
        expect(mockGame.getPhaseStep()).toBe('Discussion');
        
        // Complete Discussion phase
        for (let i = 0; i < alivePlayers.length; i++) {
            mockGame.setNextPlayerIndexToAction(i);
            await dayPhase.runStep(mockGame as unknown as Game);
        }
        mockGame.setNextPlayerIndexToAction(alivePlayers.length); // Past last player
        await dayPhase.runStep(mockGame as unknown as Game); // Transition to Voting
        expect(mockGame.getPhaseStep()).toBe('Voting');

        // Complete Voting phase
        for (let i = 0; i < alivePlayers.length; i++) {
            mockGame.setNextPlayerIndexToAction(i);
            await dayPhase.runStep(mockGame as unknown as Game);
        }
        mockGame.setNextPlayerIndexToAction(alivePlayers.length); // Past last player
        await dayPhase.runStep(mockGame as unknown as Game); // Transition to TallyVotes
        expect(mockGame.getPhaseStep()).toBe('TallyVotes');

        // Tally votes
        mockGame.setNextPlayerIndexToAction(0);
        await dayPhase.runStep(mockGame as unknown as Game); // Executes TallyVotes logic

        expect(mockGame.killPlayer).toHaveBeenCalledWith('p3', 'was executed by popular vote.');
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, 'With 2 votes, the town has decided to execute Player3.', MessageVisibility.Public);

        // Check that notifyRenderers was called with some votes map and the correct executed player
        expect(mockGame.notifyRenderers).toHaveBeenCalledWith('renderVoteResults', expect.any(Map), 'p3');
        expect(mockGame.recordVoteResultsInMemory).toHaveBeenCalledWith(expect.any(Map));
        expect(mockGame.setPhaseResults).toHaveBeenCalledWith({ lastDayElimination: 'p3' });
        expect(mockGame.getPhaseStep()).toBe('Finished');
    });

    it('should handle tie vote (no execution)', async () => {
        mockGame.round = 2;
        const alivePlayers = [p1, p2, p3, p4]; // 4 players
        mockGame.getAlivePlayers.mockReturnValue(alivePlayers);

        // Set up mocks for discussion and voting phases
        let callCount = 0;
        mockGame.requestPlayerAction.mockImplementation((player) => {
            callCount++;
            // First round (Discussion) - all noAction
            if (callCount <= 4) {
                return Promise.resolve({ type: 'noAction' });
            }
            // Second round (Voting) - create a tie
            if (callCount > 4) {
                if (player.id === 'p1') return Promise.resolve({ type: 'vote', targetPlayerId: 'p3' });
                if (player.id === 'p2') return Promise.resolve({ type: 'vote', targetPlayerId: 'p4' });
                if (player.id === 'p3') return Promise.resolve({ type: 'vote', targetPlayerId: 'p1' });
                if (player.id === 'p4') return Promise.resolve({ type: 'vote', targetPlayerId: 'p2' });
            }
            return Promise.resolve({ type: 'noAction' });
        });

        mockGame.setPhaseStep('Start'); await dayPhase.runStep(mockGame as unknown as Game); // To Discussion
        expect(mockGame.getPhaseStep()).toBe('Discussion');
        await runPlayerLoop(mockGame, dayPhase, alivePlayers); // Complete Discussion, to Voting
        expect(mockGame.getPhaseStep()).toBe('Voting');

        // Reset call count for voting
        callCount = 4;

        await runPlayerLoop(mockGame, dayPhase, alivePlayers); // Complete Voting, to TallyVotes
        expect(mockGame.getPhaseStep()).toBe('TallyVotes');

        mockGame.setNextPlayerIndexToAction(0);
        await dayPhase.runStep(mockGame as unknown as Game); // Executes TallyVotes logic

        expect(mockGame.killPlayer).not.toHaveBeenCalled();
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, "The vote did not reach a majority. No one is executed.", MessageVisibility.Public);
        expect(mockGame.getPhaseStep()).toBe('Finished');
    });

    it('should transition to NightPhase if no win condition', () => {
        mockGame.setPhaseStep('Finished'); // Manually set for this isolated test
        mockGame.checkWinCondition.mockReturnValue(null);
        const nextPhaseType = dayPhase.transition(mockGame as unknown as Game);
        expect(nextPhaseType).toBe('Night');
    });

    it('should transition to GameOverPhase if win condition met', () => {
        mockGame.setPhaseStep('Finished'); // Manually set
        mockGame.checkWinCondition.mockReturnValue('Mafia'); // Simulate Mafia win
        const nextPhaseType = dayPhase.transition(mockGame as unknown as Game);
        expect(nextPhaseType).toBe('GameOver');
    });
}); 