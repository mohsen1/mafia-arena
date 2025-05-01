// tests/phases/NightPhase.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NightPhase } from '@/lib/engine/phases/NightPhase';
import type { Game } from '@/lib/engine/core/Game'; // We need Game to mock its methods
import { Player } from '@/lib/engine/core/Player';
import type { IRole } from '@/lib/engine/interfaces/IRole';
import { DoctorRole } from '@/lib/engine/roles/DoctorRole';
import { SeerRole } from '@/lib/engine/roles/SeerRole';
import { MafiaRole } from '@/lib/engine/roles/MafiaRole';
import { VillagerRole } from '@/lib/engine/roles/VillagerRole';
import { type IAgent, type PlayerAction } from '@/lib/engine/interfaces/IAgent';
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer';
import { MessageVisibility } from '@/lib/engine/interfaces/IMessage';
import { DayPhase } from '@/lib/engine/phases/DayPhase';
import { AgentConfig } from '@/lib/interfaces/agent.types';

// Mock the Game class methods that the phase interacts with
const mockGame = {
    logMessage: vi.fn(),
    generateVisibleGameState: vi.fn(),
    getPlayer: vi.fn(),
    getAlivePlayers: vi.fn(),
    killPlayer: vi.fn(),
    recordKillInMemory: vi.fn(),
    recordSeerResultInMemory: vi.fn(),
    notifyRenderers: vi.fn(), // Mock renderer notifications if needed
    requestPlayerAction: vi.fn().mockResolvedValue({ type: 'noAction' }),
};

// Mock Player and Agent - Reverted: Keep action for easier setup, though agent.getAction won't be called directly
const createMockPhasePlayer = (id: PlayerId, role: IRole, action: PlayerAction): Player => {
    const agent: IAgent = {
        id: `agent-for-${id}`,
        agentName: `MockAgent${role.name}`,
        persona: { // Provide a mock Persona object
            name: `Mock ${role.name}`,
            backstory: `A test persona for ${role.name}.`,
            personalityTraits: ["mock", "test"]
        },
        // Keep the mock action setup for simplicity in test definition, even if not directly used
        getAction: vi.fn().mockResolvedValue(action)
    };
    // Add mock agent config
    const mockAgentConfig: AgentConfig = { agentType: 'Test' }; 
    const player = new Player(id, `Test ${role.name} ${id}`, role, agent, mockAgentConfig);
    vi.spyOn(player, 'kill');
    return player;
};


describe('NightPhase', () => {
    let nightPhase: NightPhase;
    let players: Player[];
    const mafiaId: PlayerId = 'p-mafia';
    const doctorId: PlayerId = 'p-doctor';
    const seerId: PlayerId = 'p-seer';
    const villagerId: PlayerId = 'p-villager';

    beforeEach(() => {
        vi.clearAllMocks();
        nightPhase = new NightPhase();
    });

    it('should collect actions from all night-action roles', async () => {
        // Define expected actions returned by requestPlayerAction
        const expectedMafiaAction: PlayerAction = { type: 'mafiaKill', targetPlayerId: villagerId };
        const expectedDoctorAction: PlayerAction = { type: 'doctorSave', targetPlayerId: villagerId };
        const expectedSeerAction: PlayerAction = { type: 'seerInvestigate', targetPlayerId: mafiaId };
        
        // Setup players - pass dummy action to creator, actual action determined by requestPlayerAction mock
        const dummyAction: PlayerAction = { type: 'noAction' }; 
        const mafiaPlayer = createMockPhasePlayer(mafiaId, new MafiaRole(), dummyAction);
        const doctorPlayer = createMockPhasePlayer(doctorId, new DoctorRole(), dummyAction);
        const seerPlayer = createMockPhasePlayer(seerId, new SeerRole(), dummyAction);
        const villagerPlayer = createMockPhasePlayer(villagerId, new VillagerRole(), dummyAction);
        players = [mafiaPlayer, doctorPlayer, seerPlayer, villagerPlayer];

        mockGame.getAlivePlayers.mockReturnValue(players);
        mockGame.getPlayer.mockImplementation((id) => players.find(p => p.id === id));
        mockGame.generateVisibleGameState.mockImplementation((id) => ({
             self: { id, role: players.find(p => p.id === id)?.role.name ?? 'Unknown', isMafia: id === mafiaId },
             //... other necessary gameState properties
        }));

        // --- Mock requestPlayerAction --- 
        mockGame.requestPlayerAction
            .mockResolvedValueOnce({ type: 'noAction' }) // Mafia Discussion (assuming default is noAction)
            .mockResolvedValueOnce(expectedMafiaAction) // Mafia Vote
            .mockResolvedValueOnce(expectedDoctorAction) // Doctor Action
            .mockResolvedValueOnce(expectedSeerAction);  // Seer Action

        await nightPhase.runPhase(mockGame as unknown as Game);

        // Verify requestPlayerAction was called correctly
        expect(mockGame.requestPlayerAction).toHaveBeenCalledWith(mafiaPlayer, ['message', 'noAction']); // Mafia Discussion
        expect(mockGame.requestPlayerAction).toHaveBeenCalledWith(mafiaPlayer, ['mafiaKill', 'noAction']); // Mafia Vote
        expect(mockGame.requestPlayerAction).toHaveBeenCalledWith(doctorPlayer, ['doctorSave', 'noAction']);
        expect(mockGame.requestPlayerAction).toHaveBeenCalledWith(seerPlayer, ['seerInvestigate', 'noAction']);
        // Verify it wasn't called for the villager
        expect(mockGame.requestPlayerAction).not.toHaveBeenCalledWith(villagerPlayer, expect.any(Array));
        expect(mockGame.requestPlayerAction).toHaveBeenCalledTimes(4); // 1 discuss, 3 actions
    });

    it('should process Doctor save correctly (preventing kill)', async () => {
        const expectedMafiaAction: PlayerAction = { type: 'mafiaKill', targetPlayerId: villagerId };
        const expectedDoctorAction: PlayerAction = { type: 'doctorSave', targetPlayerId: villagerId }; // Saving the target
        const dummyAction: PlayerAction = { type: 'noAction' };

        const mafiaPlayer = createMockPhasePlayer(mafiaId, new MafiaRole(), dummyAction);
        const doctorPlayer = createMockPhasePlayer(doctorId, new DoctorRole(), dummyAction);
        const villagerPlayer = createMockPhasePlayer(villagerId, new VillagerRole(), dummyAction);
        players = [mafiaPlayer, doctorPlayer, villagerPlayer];

        mockGame.getAlivePlayers.mockReturnValue(players);
        mockGame.getPlayer.mockImplementation((id) => players.find(p => p.id === id));
        mockGame.generateVisibleGameState.mockReturnValue({ self: {}, players: [], alivePlayerIds: new Set() }); 

        // Mock requestPlayerAction calls
        mockGame.requestPlayerAction
            .mockResolvedValueOnce({type: 'noAction'}) // Mafia Discussion
            .mockResolvedValueOnce(expectedMafiaAction) // Mafia Vote
            .mockResolvedValueOnce(expectedDoctorAction); // Doctor Save

        await nightPhase.runPhase(mockGame as unknown as Game);

        // Verify killPlayer was NOT called because the save succeeded
        expect(mockGame.killPlayer).not.toHaveBeenCalled();
        // Verify save was logged publicly (but not target) - Updated expected message
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, expect.stringContaining("Someone was attacked, but the Doctor saved them!"), MessageVisibility.Public);
        // Verify kill was recorded as null in memory
        expect(mockGame.recordKillInMemory).toHaveBeenCalledWith(null);
         // Verify night results renderer shows no kill
        expect(mockGame.notifyRenderers).toHaveBeenCalledWith('renderNightResults', null);
    });

     it('should process Mafia kill correctly when no save occurs', async () => {
        const expectedMafiaAction: PlayerAction = { type: 'mafiaKill', targetPlayerId: villagerId };
        const expectedDoctorAction: PlayerAction = { type: 'doctorSave', targetPlayerId: doctorId }; // Saving self
        const dummyAction: PlayerAction = { type: 'noAction' };

        const mafiaPlayer = createMockPhasePlayer(mafiaId, new MafiaRole(), dummyAction);
        const doctorPlayer = createMockPhasePlayer(doctorId, new DoctorRole(), dummyAction);
        const villagerPlayer = createMockPhasePlayer(villagerId, new VillagerRole(), dummyAction);
        players = [mafiaPlayer, doctorPlayer, villagerPlayer];

        mockGame.getAlivePlayers.mockReturnValue(players);
        mockGame.getPlayer.mockImplementation((id) => players.find(p => p.id === id));
        mockGame.generateVisibleGameState.mockReturnValue({ self: {}, players: [], alivePlayerIds: new Set() });

        // Clear and reset mocks specifically for this test
        vi.clearAllMocks();
        mockGame.requestPlayerAction.mockClear(); // Clear specific mock
        mockGame.killPlayer.mockClear(); 
        mockGame.recordKillInMemory.mockClear();
        mockGame.notifyRenderers.mockClear();

        // Mock requestPlayerAction calls in order
        mockGame.requestPlayerAction
            .mockResolvedValueOnce({type: 'noAction'}) // Mafia Discussion
            .mockResolvedValueOnce(expectedMafiaAction) // Mafia Vote
            .mockResolvedValueOnce(expectedDoctorAction); // Doctor Save

        await nightPhase.runPhase(mockGame as unknown as Game);

        // Verify killPlayer *was* called for the villager
        expect(mockGame.killPlayer).toHaveBeenCalledWith(villagerId, expect.any(String));
         // Verify kill was recorded in memory
        expect(mockGame.recordKillInMemory).toHaveBeenCalledWith(villagerId);
         // Verify night results renderer shows the kill
        expect(mockGame.notifyRenderers).toHaveBeenCalledWith('renderNightResults', villagerId);
    });

    it('should record Seer investigation results in memory', async () => {
        const expectedSeerAction: PlayerAction = { type: 'seerInvestigate', targetPlayerId: mafiaId };
        const dummyAction: PlayerAction = { type: 'noAction' };

        const mafiaPlayer = createMockPhasePlayer(mafiaId, new MafiaRole(), dummyAction);
        const seerPlayer = createMockPhasePlayer(seerId, new SeerRole(), dummyAction);
         players = [mafiaPlayer, seerPlayer];

        mockGame.getAlivePlayers.mockReturnValue(players);
        mockGame.getPlayer.mockImplementation((id) => players.find(p => p.id === id));
         mockGame.generateVisibleGameState.mockReturnValue({ self: {}, players: [], alivePlayerIds: new Set() });

        // Mock requestPlayerAction calls
        mockGame.requestPlayerAction
            .mockResolvedValueOnce({type: 'noAction'}) // Mafia Discussion
            .mockResolvedValueOnce({type: 'noAction'}) // Mafia Vote
            .mockResolvedValueOnce(expectedSeerAction); // Seer Investigate

        await nightPhase.runPhase(mockGame as unknown as Game);

        // Verify recordSeerResultInMemory was called with correct details
        expect(mockGame.recordSeerResultInMemory).toHaveBeenCalledWith(
            seerId,
            mafiaId,
            'Mafia' // Expected allegiance of the target
        );
         // Verify the private message sent TO the seer
         expect(mockGame.logMessage).toHaveBeenCalledWith(
            seerId, // The message is logged TO the seer
            expect.stringContaining("decides to investigate someone."), // Specific private log content
            MessageVisibility.Private // Visibility remains private
         );
    });

     it('should handle Mafia message action during the night', async () => {
         const expectedMessageAction: PlayerAction = { type: 'message', content: 'Let\'s frame the Doctor' };
         const expectedVoteAction: PlayerAction = { type: 'noAction' }; // Mafia still needs a kill vote action
         const dummyAction: PlayerAction = { type: 'noAction' };

         const mafiaPlayer = createMockPhasePlayer(mafiaId, new MafiaRole(), dummyAction); 
         players = [mafiaPlayer];

         mockGame.getAlivePlayers.mockReturnValue(players);
         mockGame.getPlayer.mockImplementation((id) => players.find(p => p.id === id));
         mockGame.generateVisibleGameState.mockReturnValue({ self: {}, players: [], alivePlayerIds: new Set() });

         // Mock requestPlayerAction calls - **Moved Before runPhase**
         mockGame.requestPlayerAction
             .mockResolvedValueOnce(expectedMessageAction) // Mafia Discussion (message)
             .mockResolvedValueOnce(expectedVoteAction); // Mafia Vote (noAction)

         await nightPhase.runPhase(mockGame as unknown as Game);

         // Verify logMessage was called with Mafia visibility for the SENT message
         expect(mockGame.logMessage).toHaveBeenCalledWith(
             mafiaId,
             expectedMessageAction.content, // Check for the correct content
             MessageVisibility.Mafia
         );
         // Ensure no kill processing happened etc.
         expect(mockGame.killPlayer).not.toHaveBeenCalled();
         expect(mockGame.recordKillInMemory).toHaveBeenCalledWith(null); // Record no kill occurred
     });

    it('should handle tied Mafia votes by selecting the first target (deterministic tie-break)', async () => {
        // Setup: 2 Mafia, 2 Villagers. Mafia tie vote.
        const mafia1Id = 'p-mafia1';
        const mafia2Id = 'p-mafia2';
        const villager1Id = 'p-villager1';
        const villager2Id = 'p-villager2';

        const mafia1Action: PlayerAction = { type: 'mafiaKill', targetPlayerId: villager1Id };
        const mafia2Action: PlayerAction = { type: 'mafiaKill', targetPlayerId: villager2Id };
        const dummyAction: PlayerAction = { type: 'noAction' };

        const mafiaPlayer1 = createMockPhasePlayer(mafia1Id, new MafiaRole(), dummyAction);
        const mafiaPlayer2 = createMockPhasePlayer(mafia2Id, new MafiaRole(), dummyAction);
        const villagerPlayer1 = createMockPhasePlayer(villager1Id, new VillagerRole(), dummyAction);
        const villagerPlayer2 = createMockPhasePlayer(villager2Id, new VillagerRole(), dummyAction);
        players = [mafiaPlayer1, mafiaPlayer2, villagerPlayer1, villagerPlayer2];

        mockGame.getAlivePlayers.mockReturnValue(players);
        mockGame.getPlayer.mockImplementation((id) => players.find(p => p.id === id));
        mockGame.generateVisibleGameState.mockReturnValue({ /* state */ });

        // Mock requestPlayerAction: Discuss (noAction), Vote (m1->v1, m2->v2)
        mockGame.requestPlayerAction
            .mockResolvedValueOnce({ type: 'noAction' }) // m1 discuss
            .mockResolvedValueOnce({ type: 'noAction' }) // m2 discuss
            .mockResolvedValueOnce(mafia1Action)        // m1 vote
            .mockResolvedValueOnce(mafia2Action);       // m2 vote

        await nightPhase.runPhase(mockGame as unknown as Game);

        // Assert: killPlayer should be called for villager1Id (first target in tie)
        expect(mockGame.killPlayer).toHaveBeenCalledWith(villager1Id, expect.any(String));
        expect(mockGame.killPlayer).toHaveBeenCalledTimes(1); // Only one kill despite tie
        // Verify recorded kill
        expect(mockGame.recordKillInMemory).toHaveBeenCalledWith(villager1Id);
        // Verify renderer notification
        expect(mockGame.notifyRenderers).toHaveBeenCalledWith('renderNightResults', villager1Id);
        // Verify Mafia log mentions the chosen target
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, expect.stringContaining(`chosen target is ${villagerPlayer1.name}`), MessageVisibility.Mafia);
    });

    it('should transition to DayPhase', () => {
        const nextPhase = nightPhase.transition(mockGame as unknown as Game);
        expect(nextPhase).toBeInstanceOf(DayPhase);
    });

    // Add tests for Mafia vote tallying, tie-breaking (if any), invalid targets etc.
});