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

        (p1.agent.getAction as Mock).mockResolvedValueOnce({ type: 'message', content: 'P1 intro' });
        (p2.agent.getAction as Mock).mockResolvedValueOnce({ type: 'message', content: 'P2 intro' });
        (p3.agent.getAction as Mock).mockResolvedValueOnce({ type: 'message', content: 'P3 intro' });

        // Start
        mockGame.setPhaseStep('Start'); mockGame.setNextPlayerIndexToAction(0);
        await dayPhase.runStep(mockGame as unknown as Game); // This sets step to Introduction
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, "Day begins...", MessageVisibility.Public);
        expect(mockGame.getPhaseStep()).toBe('Introduction');
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, "Let's begin with introductions. Please introduce yourself.", MessageVisibility.Public);


        // Player 1 Intro
        mockGame.setNextPlayerIndexToAction(0);
        await dayPhase.runStep(mockGame as unknown as Game);
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
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, "Voting phase: Choose who to execute.", MessageVisibility.Public);
    });

    it('should run Discussion, Voting, Tally, and Finished steps for round > 1', async () => {
        mockGame.round = 2;
        const alivePlayers = [p1, p2, p3];
        mockGame.getAlivePlayers.mockReturnValue(alivePlayers);

        (p1.agent.getAction as Mock).mockResolvedValueOnce({ type: 'message', content: 'P1 discussing' });
        (p2.agent.getAction as Mock).mockResolvedValueOnce({ type: 'message', content: 'P2 discussing' });
        (p3.agent.getAction as Mock).mockResolvedValueOnce({ type: 'message', content: 'P3 discussing' });

        // Start
        mockGame.setPhaseStep('Start'); mockGame.setNextPlayerIndexToAction(0);
        await dayPhase.runStep(mockGame as unknown as Game);
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, "Day begins...", MessageVisibility.Public);
        expect(mockGame.getPhaseStep()).toBe('Discussion');
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, "Discussion phase:", MessageVisibility.Public);

        // Discussions
        await runPlayerLoop(mockGame, dayPhase, alivePlayers); // Runs for p1, p2, p3, then sets step to Voting

        expect(mockGame.logMessage).toHaveBeenCalledWith('p1', 'P1 discussing', MessageVisibility.Public);
        expect(mockGame.logMessage).toHaveBeenCalledWith('p2', 'P2 discussing', MessageVisibility.Public);
        expect(mockGame.logMessage).toHaveBeenCalledWith('p3', 'P3 discussing', MessageVisibility.Public);
        expect(mockGame.getPhaseStep()).toBe('Voting');
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, "Discussion complete.", MessageVisibility.Public);
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, "Voting phase: Choose who to execute.", MessageVisibility.Public);


        // Voting
        (p1.agent.getAction as Mock).mockResolvedValueOnce({ type: 'vote', targetPlayerId: 'p2' });
        (p2.agent.getAction as Mock).mockResolvedValueOnce({ type: 'vote', targetPlayerId: 'p1' });
        (p3.agent.getAction as Mock).mockResolvedValueOnce({ type: 'noAction' }); // Abstains

        await runPlayerLoop(mockGame, dayPhase, alivePlayers); // Runs for p1, p2, p3, then sets step to TallyVotes

        expect(mockGame.logMessage).toHaveBeenCalledWith('p1', 'votes for Player2.', MessageVisibility.Public);
        expect(mockGame.logMessage).toHaveBeenCalledWith('p2', 'votes for Player1.', MessageVisibility.Public);
        expect(mockGame.logMessage).toHaveBeenCalledWith('p3', 'chose no action (abstains from voting).', MessageVisibility.Public);
        expect(mockGame.getPhaseStep()).toBe('TallyVotes');
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, "Voting complete.", MessageVisibility.Public);


        // TallyVotes
        mockGame.setNextPlayerIndexToAction(0); // Reset index for TallyVotes step
        await dayPhase.runStep(mockGame as unknown as Game);
        // No majority, no one executed in this setup
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, expect.stringContaining("did not reach a majority"), MessageVisibility.Public);
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

        // Mock actions for discussion (all noAction for simplicity here)
        (p1.agent.getAction as Mock).mockResolvedValue({ type: 'noAction' });
        (p2.agent.getAction as Mock).mockResolvedValue({ type: 'noAction' });
        (p3.agent.getAction as Mock).mockResolvedValue({ type: 'noAction' });

        mockGame.setPhaseStep('Start'); await dayPhase.runStep(mockGame as unknown as Game); // To Discussion
        expect(mockGame.getPhaseStep()).toBe('Discussion');
        await runPlayerLoop(mockGame, dayPhase, alivePlayers); // Complete Discussion, to Voting
        expect(mockGame.getPhaseStep()).toBe('Voting');

        // Mock votes for execution
        (p1.agent.getAction as Mock).mockResolvedValueOnce({ type: 'vote', targetPlayerId: 'p3' });
        (p2.agent.getAction as Mock).mockResolvedValueOnce({ type: 'vote', targetPlayerId: 'p3' }); // p3 gets 2 votes (majority)
        (p3.agent.getAction as Mock).mockResolvedValueOnce({ type: 'vote', targetPlayerId: 'p1' });

        await runPlayerLoop(mockGame, dayPhase, alivePlayers); // Complete Voting, to TallyVotes
        expect(mockGame.getPhaseStep()).toBe('TallyVotes');

        // Tally votes
        mockGame.setNextPlayerIndexToAction(0);
        await dayPhase.runStep(mockGame as unknown as Game); // Executes TallyVotes logic

        expect(mockGame.killPlayer).toHaveBeenCalledWith('p3', expect.stringContaining('was executed by popular vote'));
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, expect.stringMatching(/With 2 votes, the town has decided to execute Player3/), MessageVisibility.Public);

        const expectedVotes = new Map<PlayerId, PlayerId | null>([['p1', 'p3'], ['p2', 'p3'], ['p3', 'p1']]);
        expect(mockGame.notifyRenderers).toHaveBeenCalledWith('renderVoteResults', expectedVotes, 'p3');
        expect(mockGame.recordVoteResultsInMemory).toHaveBeenCalledWith(expectedVotes);
        expect(mockGame.setPhaseResults).toHaveBeenCalledWith({ lastDayElimination: 'p3' });
        expect(mockGame.getPhaseStep()).toBe('Finished');
    });

    it('should handle tie vote (no execution)', async () => {
        mockGame.round = 2;
        const alivePlayers = [p1, p2, p3, p4]; // 4 players
        mockGame.getAlivePlayers.mockReturnValue(alivePlayers);

        (p1.agent.getAction as Mock).mockResolvedValue({ type: 'noAction' });
        (p2.agent.getAction as Mock).mockResolvedValue({ type: 'noAction' });
        (p3.agent.getAction as Mock).mockResolvedValue({ type: 'noAction' });
        (p4.agent.getAction as Mock).mockResolvedValue({ type: 'noAction' });

        mockGame.setPhaseStep('Start'); await dayPhase.runStep(mockGame as unknown as Game); // To Discussion
        expect(mockGame.getPhaseStep()).toBe('Discussion');
        await runPlayerLoop(mockGame, dayPhase, alivePlayers); // Complete Discussion, to Voting
        expect(mockGame.getPhaseStep()).toBe('Voting');

        // Votes: p1->p3, p2->p4, p3->p1, p4->p2 (no majority, multiple players with 1 vote)
        (p1.agent.getAction as Mock).mockResolvedValueOnce({ type: 'vote', targetPlayerId: 'p3' });
        (p2.agent.getAction as Mock).mockResolvedValueOnce({ type: 'vote', targetPlayerId: 'p4' });
        (p3.agent.getAction as Mock).mockResolvedValueOnce({ type: 'vote', targetPlayerId: 'p1' });
        (p4.agent.getAction as Mock).mockResolvedValueOnce({ type: 'vote', targetPlayerId: 'p2' });

        await runPlayerLoop(mockGame, dayPhase, alivePlayers); // Complete Voting, to TallyVotes
        expect(mockGame.getPhaseStep()).toBe('TallyVotes');

        mockGame.setNextPlayerIndexToAction(0);
        await dayPhase.runStep(mockGame as unknown as Game); // Executes TallyVotes logic

        expect(mockGame.killPlayer).not.toHaveBeenCalled();
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, expect.stringContaining("vote did not reach a majority"), MessageVisibility.Public);
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