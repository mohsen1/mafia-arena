// tests/phases/DayPhase.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DayPhase } from '../../src/phases/DayPhase';
import { Game } from '../../src/core/Game';
import { Player } from '../../src/core/Player';
import { IRole } from '../../src/interfaces/IRole';
import { VillagerRole } from '../../src/roles/VillagerRole';
import { MafiaRole } from '../../src/roles/MafiaRole';
import { type IAgent, type PlayerAction } from '../../src/interfaces/IAgent';
import { type PlayerId } from '../../src/interfaces/IPlayer';
import { MessageVisibility } from '../../src/interfaces/IMessage';
import { NightPhase } from '../../src/phases/NightPhase';

// Mock Game class
const mockGame = {
    logMessage: vi.fn(),
    generateVisibleGameState: vi.fn(),
    getPlayer: vi.fn(),
    getAlivePlayers: vi.fn(),
    getMostVotedPlayer: vi.fn(),
    resetVotes: vi.fn(),
    recordVoteInMemory: vi.fn(),
    getVotes: vi.fn().mockReturnValue(new Map()), // Start with empty votes
    notifyRenderers: vi.fn(),
    getGamePhase: vi.fn().mockReturnValue('Day'), // Simulate being in Day phase initially
    killPlayer: vi.fn(),
    round: 2,
    recordVoteResultsInMemory: vi.fn(),
};

// Mock Player and Agent - Changed 3rd param from action: PlayerAction to agent: IAgent
const createMockDayPlayer = (id: PlayerId, role: IRole, agent: IAgent): Player => {
    // Use the provided agent directly
    return new Player(id, `Test ${role.name} ${id}`, role, agent);
};

describe('DayPhase', () => {
    let dayPhase: DayPhase;
    let players: Player[];
    let player1Id: PlayerId = 'p1';
    let player2Id: PlayerId = 'p2';
    let player3Id: PlayerId = 'p3'; // Mafia

    beforeEach(() => {
        vi.clearAllMocks();
        dayPhase = new DayPhase();

        // Reset mock game state for each test
        mockGame.getAlivePlayers.mockReset();
        mockGame.getPlayer.mockReset();
        mockGame.generateVisibleGameState.mockReset();
        mockGame.logMessage.mockReset();
        mockGame.resetVotes.mockReset();
        mockGame.recordVoteInMemory.mockReset();
        mockGame.getVotes.mockReset().mockReturnValue(new Map());
        mockGame.getMostVotedPlayer.mockReset();
        mockGame.notifyRenderers.mockReset();
        mockGame.getGamePhase.mockReset().mockReturnValue('Day');
        mockGame.killPlayer.mockReset();
        mockGame.round = 2;
        mockGame.recordVoteResultsInMemory.mockReset();
    });

    it('should collect votes, log them, tally, execute player with majority, and record results', async () => {
        // --- Setup Actions ---
        // Simulate the *second* action request within DayPhase (the voting one)
        const voteAction1: PlayerAction = { type: 'vote', targetPlayerId: player3Id };
        const voteAction2: PlayerAction = { type: 'vote', targetPlayerId: player3Id };
        const voteAction3: PlayerAction = { type: 'vote', targetPlayerId: player1Id }; // Mafia votes elsewhere

        // --- Setup Player Mocks ---
        // Create specific agents for this test to mock getAction calls individually
        const agent1 = { playerId: player1Id, getAction: vi.fn() } as unknown as IAgent;
        const agent2 = { playerId: player2Id, getAction: vi.fn() } as unknown as IAgent;
        const agent3 = { playerId: player3Id, getAction: vi.fn() } as unknown as IAgent;

        const player1 = createMockDayPlayer(player1Id, new VillagerRole(), agent1);
        const player2 = createMockDayPlayer(player2Id, new VillagerRole(), agent2);
        const player3 = createMockDayPlayer(player3Id, new MafiaRole(), agent3);
        players = [player1, player2, player3]; // Redefine players array for this test

        // Configure game mocks for this specific scenario
        mockGame.getAlivePlayers.mockReturnValue(players);
        mockGame.getPlayer.mockImplementation((id) => players.find(p => p.id === id));
        mockGame.generateVisibleGameState.mockImplementation((id) => ({ // Provide necessary state for voting
             self: { id, role: players.find(p=>p.id===id)!.role.name, isMafia: id === player3Id },
             players: players.map(p => ({ id: p.id, name: p.name, isAlive: p.isAlive })),
             alivePlayerIds: new Set(players.map(p => p.id)),
             phase: 'Day',
             round: mockGame.round,
             votes: new Map(),
             messages: [],
             nightKills: new Map(),
             seerResults: new Map(),
             voteResults: null,
             mafiaPlayerIds: new Set([player3Id]),
        }));

        // Mock getAction calls: Assume Round > 1, so first call is discussion, second is vote
        // Mock discussion action (can be anything, e.g., noAction)
        // Use vi.mocked() for type safety with mocks
        vi.mocked(agent1.getAction).mockResolvedValueOnce({ type: 'noAction' });
        vi.mocked(agent2.getAction).mockResolvedValueOnce({ type: 'noAction' });
        vi.mocked(agent3.getAction).mockResolvedValueOnce({ type: 'noAction' });
        // Mock voting action
        vi.mocked(agent1.getAction).mockResolvedValueOnce(voteAction1);
        vi.mocked(agent2.getAction).mockResolvedValueOnce(voteAction2);
        vi.mocked(agent3.getAction).mockResolvedValueOnce(voteAction3);


        // --- Run Phase ---
        await dayPhase.runPhase(mockGame as unknown as Game);

        // --- Assertions ---
        // 1. Verify getAction was called twice per player (discussion + vote)
        expect(agent1.getAction).toHaveBeenCalledTimes(2);
        expect(agent2.getAction).toHaveBeenCalledTimes(2);
        expect(agent3.getAction).toHaveBeenCalledTimes(2);

        // 2. Verify individual vote logs
        const player1Name = players.find(p => p.id === player1Id)?.name;
        const player3Name = players.find(p => p.id === player3Id)?.name;
        expect(mockGame.logMessage).toHaveBeenCalledWith(player1Id, `votes for ${player3Name}.`, MessageVisibility.Public);
        expect(mockGame.logMessage).toHaveBeenCalledWith(player2Id, `votes for ${player3Name}.`, MessageVisibility.Public);
        expect(mockGame.logMessage).toHaveBeenCalledWith(player3Id, `votes for ${player1Name}.`, MessageVisibility.Public);

        // 3. Verify majority calculation and execution
        // 3 players, majority = 2. Player3 got 2 votes.
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, expect.stringContaining(`decided to execute ${player3Name}`), MessageVisibility.Public);
        expect(mockGame.killPlayer).toHaveBeenCalledWith(player3Id, "was executed by popular vote.");
        expect(mockGame.killPlayer).toHaveBeenCalledTimes(1);

        // 4. Verify final vote results rendering and recording
        const expectedVotesMap = new Map<PlayerId, PlayerId | null>([
            [player1Id, player3Id],
            [player2Id, player3Id],
            [player3Id, player1Id],
        ]);
        expect(mockGame.notifyRenderers).toHaveBeenCalledWith('renderVoteResults', expectedVotesMap, player3Id);
        expect(mockGame.recordVoteResultsInMemory).toHaveBeenCalledWith(expectedVotesMap);
    });

     it('should handle message action during the discussion part and abstain vote', async () => {
         // --- Setup ---
         const messageAction: PlayerAction = { type: 'message', content: 'I suspect P3!' };
         const voteAction: PlayerAction = { type: 'noAction' };

         // Specific agent for this test
         const agent1 = { playerId: player1Id, getAction: vi.fn() } as unknown as IAgent;
         const player1 = createMockDayPlayer(player1Id, new VillagerRole(), agent1);
         players = [player1]; // Only one player

         // Configure mocks for single player scenario
         mockGame.getAlivePlayers.mockReturnValue(players);
         mockGame.getPlayer.mockImplementation((id) => (id === player1Id ? player1 : undefined));
         mockGame.generateVisibleGameState.mockImplementation((id) => ({ /* Simplified state */ }));

         // Mock first call (discussion) returns message, second call (vote) returns noAction
         // Use vi.mocked()
         vi.mocked(agent1.getAction).mockResolvedValueOnce(messageAction).mockResolvedValueOnce(voteAction);

         // --- Run Phase ---
         await dayPhase.runPhase(mockGame as unknown as Game);

         // --- Assertions ---
         // Verify message log from discussion part
         expect(mockGame.logMessage).toHaveBeenCalledWith(
             player1Id,
             'I suspect P3!',
             MessageVisibility.Public
         );
         // Verify abstain log from voting part
         expect(mockGame.logMessage).toHaveBeenCalledWith(player1Id, expect.stringContaining("abstain"), MessageVisibility.Public);

         // Verify no kill happened
         expect(mockGame.killPlayer).not.toHaveBeenCalled();
         // Verify vote results recorded (with null vote)
         const expectedVotesMap = new Map([[player1Id, null]]);
         expect(mockGame.notifyRenderers).toHaveBeenCalledWith('renderVoteResults', expectedVotesMap, null);
         expect(mockGame.recordVoteResultsInMemory).toHaveBeenCalledWith(expectedVotesMap);
     });

     it('should handle noAction for both discussion and vote', async () => {
        const noAction1: PlayerAction = { type: 'noAction' };
        const noAction2: PlayerAction = { type: 'noAction' };

        // Specific agent
        const agent1 = { playerId: player1Id, getAction: vi.fn() } as unknown as IAgent;
        const player1 = createMockDayPlayer(player1Id, new VillagerRole(), agent1);
        players = [player1];

        // Configure mocks
        mockGame.getAlivePlayers.mockReturnValue(players);
        mockGame.getPlayer.mockImplementation((id) => (id === player1Id ? player1 : undefined));
        mockGame.generateVisibleGameState.mockImplementation((id) => ({ /* Simplified state */ }));

        // Mock both calls return noAction
        // Use vi.mocked()
        vi.mocked(agent1.getAction).mockResolvedValueOnce(noAction1).mockResolvedValueOnce(noAction2);

        // --- Run Phase ---
        await dayPhase.runPhase(mockGame as unknown as Game);

        // --- Assertions ---
        // Verify only initial day message + abstain log + no execution log (if any)
        // Check abstain log from voting part
        expect(mockGame.logMessage).toHaveBeenCalledWith(player1Id, expect.stringContaining("abstain"), MessageVisibility.Public);
        // Check the generic no execution log
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, expect.stringContaining("No one is executed"), MessageVisibility.Public);

        // Verify no kill happened
        expect(mockGame.killPlayer).not.toHaveBeenCalled();
        // Verify vote results recorded (with null vote)
        const expectedVotesMap = new Map([[player1Id, null]]);
        expect(mockGame.notifyRenderers).toHaveBeenCalledWith('renderVoteResults', expectedVotesMap, null);
        expect(mockGame.recordVoteResultsInMemory).toHaveBeenCalledWith(expectedVotesMap);
     });

    // Add tie vote test
    it('should handle a tie vote correctly (no execution)', async () => {
        // --- Setup Actions ---
        const voteAction1: PlayerAction = { type: 'vote', targetPlayerId: player2Id }; // p1 votes p2
        const voteAction2: PlayerAction = { type: 'vote', targetPlayerId: player1Id }; // p2 votes p1
        const voteAction3: PlayerAction = { type: 'noAction' }; // p3 abstains

        // --- Setup Player Mocks ---
        const agent1 = { playerId: player1Id, getAction: vi.fn() } as unknown as IAgent;
        const agent2 = { playerId: player2Id, getAction: vi.fn() } as unknown as IAgent;
        const agent3 = { playerId: player3Id, getAction: vi.fn() } as unknown as IAgent;

        const player1 = createMockDayPlayer(player1Id, new VillagerRole(), agent1);
        const player2 = createMockDayPlayer(player2Id, new VillagerRole(), agent2);
        const player3 = createMockDayPlayer(player3Id, new MafiaRole(), agent3);
        players = [player1, player2, player3];

        // Configure game mocks
        mockGame.getAlivePlayers.mockReturnValue(players);
        mockGame.getPlayer.mockImplementation((id) => players.find(p => p.id === id));
        mockGame.generateVisibleGameState.mockImplementation((id) => ({ /* Full state needed */ }));

        // Mock discussion actions + voting actions
        // Use vi.mocked()
        vi.mocked(agent1.getAction).mockResolvedValueOnce({ type: 'noAction' }).mockResolvedValueOnce(voteAction1);
        vi.mocked(agent2.getAction).mockResolvedValueOnce({ type: 'noAction' }).mockResolvedValueOnce(voteAction2);
        vi.mocked(agent3.getAction).mockResolvedValueOnce({ type: 'noAction' }).mockResolvedValueOnce(voteAction3);

        // --- Run Phase ---
        await dayPhase.runPhase(mockGame as unknown as Game);

         // --- Assertions ---
        // 1. Verify individual vote/abstain logs
        expect(mockGame.logMessage).toHaveBeenCalledWith(player1Id, expect.stringContaining(`votes for ${players.find(p=>p.id===player2Id)?.name}`), MessageVisibility.Public);
        expect(mockGame.logMessage).toHaveBeenCalledWith(player2Id, expect.stringContaining(`votes for ${players.find(p=>p.id===player1Id)?.name}`), MessageVisibility.Public);
        expect(mockGame.logMessage).toHaveBeenCalledWith(player3Id, expect.stringContaining("abstains from voting."), MessageVisibility.Public);

        // 2. Verify NO execution happened due to tie (or lack of majority in this specific case)
        // The current logic logs "did not reach majority" when a tie occurs below the threshold.
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, expect.stringContaining("did not reach a majority"), MessageVisibility.Public);
        expect(mockGame.killPlayer).not.toHaveBeenCalled();

        // 3. Verify final vote results rendering and recording (no executed player)
        const expectedVotesMap = new Map<PlayerId, PlayerId | null>([
            [player1Id, player2Id],
            [player2Id, player1Id],
            [player3Id, null],
        ]);
        expect(mockGame.notifyRenderers).toHaveBeenCalledWith('renderVoteResults', expectedVotesMap, null);
        expect(mockGame.recordVoteResultsInMemory).toHaveBeenCalledWith(expectedVotesMap);
     });

    // Add no majority test
    it('should handle no majority correctly (no execution)', async () => {
        // Add a 4th player
        const player4Id = 'p4';
        const agent4 = { playerId: player4Id, getAction: vi.fn() } as unknown as IAgent;
        const player4 = createMockDayPlayer(player4Id, new VillagerRole(), agent4);

        // Original players + new one
        const agent1 = { playerId: player1Id, getAction: vi.fn() } as unknown as IAgent;
        const agent2 = { playerId: player2Id, getAction: vi.fn() } as unknown as IAgent;
        const agent3 = { playerId: player3Id, getAction: vi.fn() } as unknown as IAgent;
        const player1 = createMockDayPlayer(player1Id, new VillagerRole(), agent1);
        const player2 = createMockDayPlayer(player2Id, new VillagerRole(), agent2);
        const player3 = createMockDayPlayer(player3Id, new MafiaRole(), agent3);
        players = [player1, player2, player3, player4];

        mockGame.getAlivePlayers.mockReturnValue(players);
        mockGame.getPlayer.mockImplementation((id) => players.find(p => p.id === id));
        mockGame.generateVisibleGameState.mockImplementation((id) => ({ /* updated state */ }));

        // --- Setup Actions ---
        // 4 players, majority is 3. Votes: p1->p3, p2->p3, p3->p1, p4->p1
        // p3 gets 2 votes, p1 gets 2 votes. Max votes = 2, not >= majority 3.
        const voteAction1: PlayerAction = { type: 'vote', targetPlayerId: player3Id };
        const voteAction2: PlayerAction = { type: 'vote', targetPlayerId: player3Id };
        const voteAction3: PlayerAction = { type: 'vote', targetPlayerId: player1Id };
        const voteAction4: PlayerAction = { type: 'vote', targetPlayerId: player1Id };

        // Mock discussion + voting actions
        // Use vi.mocked()
        vi.mocked(agent1.getAction).mockResolvedValueOnce({ type: 'noAction' }).mockResolvedValueOnce(voteAction1);
        vi.mocked(agent2.getAction).mockResolvedValueOnce({ type: 'noAction' }).mockResolvedValueOnce(voteAction2);
        vi.mocked(agent3.getAction).mockResolvedValueOnce({ type: 'noAction' }).mockResolvedValueOnce(voteAction3);
        vi.mocked(agent4.getAction).mockResolvedValueOnce({ type: 'noAction' }).mockResolvedValueOnce(voteAction4);

        // --- Run Phase ---
        await dayPhase.runPhase(mockGame as unknown as Game);

        // --- Assertions ---
        // 1. Verify NO execution happened due to lack of majority
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, expect.stringContaining("did not reach a majority"), MessageVisibility.Public);
        expect(mockGame.killPlayer).not.toHaveBeenCalled();

        // 2. Verify final vote results rendering and recording (no executed player)
         const expectedVotesMap = new Map<PlayerId, PlayerId | null>([
            [player1Id, player3Id],
            [player2Id, player3Id],
            [player3Id, player1Id],
            [player4Id, player1Id],
        ]);
        expect(mockGame.notifyRenderers).toHaveBeenCalledWith('renderVoteResults', expectedVotesMap, null);
        expect(mockGame.recordVoteResultsInMemory).toHaveBeenCalledWith(expectedVotesMap);
     });

    it('should transition to NightPhase', () => {
        const nextPhase = dayPhase.transition(mockGame as unknown as Game);
        expect(nextPhase).toBeInstanceOf(NightPhase);
    });

    // Add more tests:
    // - Test handling invalid actions (e.g., voting for a dead player, invalid action type)
    // - Test interaction with game state (e.g., using information from generateVisibleGameState)
    // - Test different player counts and roles
}); 