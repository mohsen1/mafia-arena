// tests/phases/DayPhase.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DayPhase } from '@/lib/engine/phases/DayPhase';
import { Game } from '@/lib/engine/core/Game';
import { Player } from '@/lib/engine/core/Player';
import { IRole } from '@/lib/engine/interfaces/IRole';
import { VillagerRole } from '@/lib/engine/roles/VillagerRole';
import { MafiaRole } from '@/lib/engine/roles/MafiaRole';
import { type IAgent, type PlayerAction } from '@/lib/engine/interfaces/IAgent';
import { type PlayerId } from '@/lib/engine/interfaces/IPlayer';
import { MessageVisibility } from '@/lib/engine/interfaces/IMessage';
import { NightPhase } from '@/lib/engine/phases/NightPhase';

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
    requestPlayerAction: vi.fn().mockResolvedValue({ type: 'noAction' }),
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
        const messageAction: PlayerAction = { type: 'message', content: 'Testing' }; // For discussion
        const voteAction1: PlayerAction = { type: 'vote', targetPlayerId: player3Id };
        const voteAction2: PlayerAction = { type: 'vote', targetPlayerId: player3Id };
        const voteAction3: PlayerAction = { type: 'vote', targetPlayerId: player1Id }; // Mafia votes elsewhere

        // --- Setup Player Mocks ---
        // No need for individual agents now, rely on mockGame.requestPlayerAction
        const player1 = createMockDayPlayer(player1Id, new VillagerRole(), { getAction: vi.fn() } as any);
        const player2 = createMockDayPlayer(player2Id, new VillagerRole(), { getAction: vi.fn() } as any);
        const player3 = createMockDayPlayer(player3Id, new MafiaRole(), { getAction: vi.fn() } as any);
        players = [player1, player2, player3];

        // Configure game mocks
        mockGame.getAlivePlayers.mockReturnValue(players);
        mockGame.getPlayer.mockImplementation((id) => players.find(p => p.id === id));
        mockGame.generateVisibleGameState.mockImplementation((id) => ({ /* state */ }));

        // --- Mock requestPlayerAction specifically for this test ---
        // Round 1 Discussion
        mockGame.requestPlayerAction
            .mockResolvedValueOnce(messageAction) // p1 intro
            .mockResolvedValueOnce(messageAction) // p2 intro
            .mockResolvedValueOnce(messageAction); // p3 intro
        // Round > 1 Discussion (skipped if round === 1, but mock anyway)
        // mockGame.requestPlayerAction... (if needed)
        // Voting
        mockGame.requestPlayerAction
            .mockResolvedValueOnce(voteAction1) // p1 vote
            .mockResolvedValueOnce(voteAction2) // p2 vote
            .mockResolvedValueOnce(voteAction3); // p3 vote

        // Set round to 1 for intro logic
        mockGame.round = 1;

        // --- Run Phase ---
        await dayPhase.runPhase(mockGame as unknown as Game);

        // --- Assertions ---
        // Verify requestPlayerAction calls (intro + vote for each)
        expect(mockGame.requestPlayerAction).toHaveBeenCalledTimes(players.length * 2);

        // Verify message logs from intro
        expect(mockGame.logMessage).toHaveBeenCalledWith(player1Id, messageAction.content, MessageVisibility.Public);
        expect(mockGame.logMessage).toHaveBeenCalledWith(player2Id, messageAction.content, MessageVisibility.Public);
        expect(mockGame.logMessage).toHaveBeenCalledWith(player3Id, messageAction.content, MessageVisibility.Public);

        // Verify individual vote logs
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
         const voteAction: PlayerAction = { type: 'noAction' }; // Abstain

         const player1 = createMockDayPlayer(player1Id, new VillagerRole(), { getAction: vi.fn() } as any);
         players = [player1];

         // Configure mocks
         mockGame.getAlivePlayers.mockReturnValue(players);
         mockGame.getPlayer.mockImplementation((id) => (id === player1Id ? player1 : undefined));
         mockGame.generateVisibleGameState.mockImplementation((id) => ({ /* Simplified state */ }));
         mockGame.round = 2; // Ensure discussion happens

         // Mock requestPlayerAction: discussion message, then vote noAction
         mockGame.requestPlayerAction.mockResolvedValueOnce(messageAction).mockResolvedValueOnce(voteAction);

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
        const noAction: PlayerAction = { type: 'noAction' };

        const player1 = createMockDayPlayer(player1Id, new VillagerRole(), { getAction: vi.fn() } as any);
        players = [player1];

        // Configure mocks
        mockGame.getAlivePlayers.mockReturnValue(players);
        mockGame.getPlayer.mockImplementation((id) => (id === player1Id ? player1 : undefined));
        mockGame.generateVisibleGameState.mockImplementation((id) => ({ /* Simplified state */ }));
        mockGame.round = 2;

        // Mock requestPlayerAction: both return noAction
        mockGame.requestPlayerAction.mockResolvedValue(noAction); // Use default for both calls

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

        const player1 = createMockDayPlayer(player1Id, new VillagerRole(), { getAction: vi.fn() } as any);
        const player2 = createMockDayPlayer(player2Id, new VillagerRole(), { getAction: vi.fn() } as any);
        const player3 = createMockDayPlayer(player3Id, new MafiaRole(), { getAction: vi.fn() } as any);
        players = [player1, player2, player3];

        // Configure game mocks
        mockGame.getAlivePlayers.mockReturnValue(players);
        mockGame.getPlayer.mockImplementation((id) => players.find(p => p.id === id));
        mockGame.generateVisibleGameState.mockImplementation((id) => ({ /* Full state needed */ }));
        mockGame.round = 2;

        // Mock requestPlayerAction calls
        mockGame.requestPlayerAction
            .mockResolvedValueOnce({ type: 'noAction' }) // p1 discuss
            .mockResolvedValueOnce({ type: 'noAction' }) // p2 discuss
            .mockResolvedValueOnce({ type: 'noAction' }); // p3 discuss
        mockGame.requestPlayerAction
            .mockResolvedValueOnce(voteAction1) // p1 vote
            .mockResolvedValueOnce(voteAction2) // p2 vote
            .mockResolvedValueOnce(voteAction3); // p3 vote

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
        const player4 = createMockDayPlayer(player4Id, new VillagerRole(), { getAction: vi.fn() } as any);

        // Original players + new one
        const player1 = createMockDayPlayer(player1Id, new VillagerRole(), { getAction: vi.fn() } as any);
        const player2 = createMockDayPlayer(player2Id, new VillagerRole(), { getAction: vi.fn() } as any);
        const player3 = createMockDayPlayer(player3Id, new MafiaRole(), { getAction: vi.fn() } as any);
        players = [player1, player2, player3, player4];

        mockGame.getAlivePlayers.mockReturnValue(players);
        mockGame.getPlayer.mockImplementation((id) => players.find(p => p.id === id));
        mockGame.generateVisibleGameState.mockImplementation((id) => ({ /* updated state */ }));
        mockGame.round = 2;

        // --- Setup Actions ---
        const voteAction1: PlayerAction = { type: 'vote', targetPlayerId: player3Id };
        const voteAction2: PlayerAction = { type: 'vote', targetPlayerId: player3Id };
        const voteAction3: PlayerAction = { type: 'vote', targetPlayerId: player1Id };
        const voteAction4: PlayerAction = { type: 'vote', targetPlayerId: player1Id };

        // Mock requestPlayerAction calls
        mockGame.requestPlayerAction
            .mockResolvedValueOnce({ type: 'noAction' }) // p1 discuss
            .mockResolvedValueOnce({ type: 'noAction' }) // p2 discuss
            .mockResolvedValueOnce({ type: 'noAction' }) // p3 discuss
            .mockResolvedValueOnce({ type: 'noAction' }); // p4 discuss
        mockGame.requestPlayerAction
            .mockResolvedValueOnce(voteAction1) // p1 vote
            .mockResolvedValueOnce(voteAction2) // p2 vote
            .mockResolvedValueOnce(voteAction3) // p3 vote
            .mockResolvedValueOnce(voteAction4); // p4 vote

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

    it('should handle votes for dead players as abstentions', async () => {
        // --- Setup ---
        const deadPlayerId = 'p-dead';
        const voterId = 'p-voter';

        const voter = createMockDayPlayer(voterId, new VillagerRole(), { getAction: vi.fn() } as any);
        // Mock a dead player representation (needed for getPlayer lookup perhaps)
        const deadPlayer = createMockDayPlayer(deadPlayerId, new VillagerRole(), { getAction: vi.fn() } as any);
        deadPlayer.kill(); // Mark as dead

        players = [voter]; // Only one alive voter
        const allPlayersMap = new Map([[voterId, voter], [deadPlayerId, deadPlayer]]);

        mockGame.getAlivePlayers.mockReturnValue(players);
        mockGame.getPlayer.mockImplementation((id) => allPlayersMap.get(id)); // Need map to find dead player
        mockGame.generateVisibleGameState.mockImplementation((id) => ({ /* state */ }));
        mockGame.round = 2; // Skip intro

        // Mock actions: discuss noAction, vote for dead player
        const voteAction: PlayerAction = { type: 'vote', targetPlayerId: deadPlayerId };
        mockGame.requestPlayerAction
            .mockResolvedValueOnce({ type: 'noAction' })
            .mockResolvedValueOnce(voteAction);

        // --- Run Phase ---
        await dayPhase.runPhase(mockGame as unknown as Game);

        // --- Assertions ---
        // Verify log message indicates invalid vote
        expect(mockGame.logMessage).toHaveBeenCalledWith(
            voterId,
            expect.stringContaining(`tried to vote for invalid target (${deadPlayerId})`),
            MessageVisibility.Public
        );

        // Verify recorded vote is null (abstain)
        const expectedVotesMap = new Map([[voterId, null]]);
        expect(mockGame.recordVoteResultsInMemory).toHaveBeenCalledWith(expectedVotesMap);

        // Verify no kill happened
        expect(mockGame.killPlayer).not.toHaveBeenCalled();
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, expect.stringContaining("No one is executed"), MessageVisibility.Public);
        expect(mockGame.notifyRenderers).toHaveBeenCalledWith('renderVoteResults', expectedVotesMap, null);
    });

    it('should handle unexpected action types during voting as abstentions', async () => {
        // --- Setup ---
        const player1 = createMockDayPlayer(player1Id, new VillagerRole(), { getAction: vi.fn() } as any);
        const player2 = createMockDayPlayer(player2Id, new VillagerRole(), { getAction: vi.fn() } as any);
        players = [player1, player2];

        mockGame.getAlivePlayers.mockReturnValue(players);
        mockGame.getPlayer.mockImplementation((id) => players.find(p => p.id === id));
        mockGame.generateVisibleGameState.mockImplementation((id) => ({ /* state */ }));
        mockGame.round = 2; // Skip intro

        // Mock actions:
        // Discussion: Both noAction
        // Voting: p1 votes p2, p2 returns a message action
        const voteAction: PlayerAction = { type: 'vote', targetPlayerId: player2Id };
        const messageAction: PlayerAction = { type: 'message', content: 'Wait, I change my mind!' };

        mockGame.requestPlayerAction
            .mockResolvedValueOnce({ type: 'noAction' }) // p1 discuss
            .mockResolvedValueOnce({ type: 'noAction' }); // p2 discuss
        mockGame.requestPlayerAction
            .mockResolvedValueOnce(voteAction)    // p1 vote
            .mockResolvedValueOnce(messageAction); // p2 returns message during vote

        // --- Run Phase ---
        await dayPhase.runPhase(mockGame as unknown as Game);

        // --- Assertions ---
        // Verify p1's vote log
        expect(mockGame.logMessage).toHaveBeenCalledWith(player1Id, expect.stringContaining(`votes for ${player2.name}`), MessageVisibility.Public);

        // Verify p2's action is logged as abstain
        expect(mockGame.logMessage).toHaveBeenCalledWith(player2Id, expect.stringContaining("abstains from voting."), MessageVisibility.Public);
        // Crucially, ensure the message content wasn't logged during voting phase
        expect(mockGame.logMessage).not.toHaveBeenCalledWith(player2Id, messageAction.content, MessageVisibility.Public);

        // Verify recorded votes (p1 -> p2, p2 -> null)
        const expectedVotesMap = new Map([[player1Id, player2Id], [player2Id, null]]);
        expect(mockGame.recordVoteResultsInMemory).toHaveBeenCalledWith(expectedVotesMap);

        // Verify no kill happened (need majority of 2, only 1 vote cast)
        expect(mockGame.killPlayer).not.toHaveBeenCalled();
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, expect.stringContaining("did not reach a majority"), MessageVisibility.Public);
        expect(mockGame.notifyRenderers).toHaveBeenCalledWith('renderVoteResults', expectedVotesMap, null);
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