// tests/phases/NightPhase.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NightPhase } from '../../src/phases/NightPhase';
import { Game } from '../../src/core/Game'; // We need Game to mock its methods
import { Player } from '../../src/core/Player';
import { RoleName } from '../../src/interfaces/IRole';
import { DoctorRole } from '../../src/roles/DoctorRole';
import { SeerRole } from '../../src/roles/SeerRole';
import { MafiaRole } from '../../src/roles/MafiaRole';
import { VillagerRole } from '../../src/roles/VillagerRole';
import { type IAgent, type PlayerAction } from '../../src/interfaces/IAgent';
import { type PlayerId } from '../../src/interfaces/IPlayer';
import { MessageVisibility } from '../../src/interfaces/IMessage';
import { DayPhase } from '../../src/phases/DayPhase';

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
};

// Mock Player and Agent
const createMockPhasePlayer = (id: PlayerId, role: IRole, action: PlayerAction): Player => {
    const agent: IAgent = {
        playerId: id,
        getAction: vi.fn().mockResolvedValue(action),
    };
    const player = new Player(id, `Test ${role.name} ${id}`, role, agent);
    // Allow spying on kill method if needed
    vi.spyOn(player, 'kill');
    return player;
};


describe('NightPhase', () => {
    let nightPhase: NightPhase;
    let players: Player[];
    let mafiaId: PlayerId = 'p-mafia';
    let doctorId: PlayerId = 'p-doctor';
    let seerId: PlayerId = 'p-seer';
    let villagerId: PlayerId = 'p-villager';

    beforeEach(() => {
        vi.clearAllMocks();
        nightPhase = new NightPhase();
    });

    it('should collect actions from all night-action roles', async () => {
        // Setup players with actions
        const mafiaAction: PlayerAction = { type: 'mafiaKill', targetPlayerId: villagerId };
        const doctorAction: PlayerAction = { type: 'doctorSave', targetPlayerId: villagerId };
        const seerAction: PlayerAction = { type: 'seerInvestigate', targetPlayerId: mafiaId };
        const villagerAction: PlayerAction = { type: 'noAction' }; // Villager shouldn't be asked

        const mafiaPlayer = createMockPhasePlayer(mafiaId, new MafiaRole(), mafiaAction);
        const doctorPlayer = createMockPhasePlayer(doctorId, new DoctorRole(), doctorAction);
        const seerPlayer = createMockPhasePlayer(seerId, new SeerRole(), seerAction);
        const villagerPlayer = createMockPhasePlayer(villagerId, new VillagerRole(), villagerAction);
        players = [mafiaPlayer, doctorPlayer, seerPlayer, villagerPlayer];

        mockGame.getAlivePlayers.mockReturnValue(players);
        mockGame.getPlayer.mockImplementation((id) => players.find(p => p.id === id));
        // Mock gameState generation for each player
        mockGame.generateVisibleGameState.mockImplementation((id) => ({
             self: { id, role: players.find(p=>p.id===id)!.role.name, isMafia: id === mafiaId },
             //... other necessary gameState properties
        }));

        await nightPhase.runPhase(mockGame as unknown as Game);

        // Verify getAction was called for night roles, but not villager
        expect(mafiaPlayer.agent.getAction).toHaveBeenCalled();
        expect(doctorPlayer.agent.getAction).toHaveBeenCalled();
        expect(seerPlayer.agent.getAction).toHaveBeenCalled();
        expect(villagerPlayer.agent.getAction).not.toHaveBeenCalled();
    });

    it('should process Doctor save correctly (preventing kill)', async () => {
        const mafiaAction: PlayerAction = { type: 'mafiaKill', targetPlayerId: villagerId };
        const doctorAction: PlayerAction = { type: 'doctorSave', targetPlayerId: villagerId }; // Saving the target

        const mafiaPlayer = createMockPhasePlayer(mafiaId, new MafiaRole(), mafiaAction);
        const doctorPlayer = createMockPhasePlayer(doctorId, new DoctorRole(), doctorAction);
        const villagerPlayer = createMockPhasePlayer(villagerId, new VillagerRole(), { type: 'noAction' });
        players = [mafiaPlayer, doctorPlayer, villagerPlayer];

        mockGame.getAlivePlayers.mockReturnValue(players);
        mockGame.getPlayer.mockImplementation((id) => players.find(p => p.id === id));
        mockGame.generateVisibleGameState.mockReturnValue({ self: {}, players: [], alivePlayerIds: new Set() }); // Simplified mock

        await nightPhase.runPhase(mockGame as unknown as Game);

        // Verify killPlayer was NOT called because the save succeeded
        expect(mockGame.killPlayer).not.toHaveBeenCalled();
        // Verify save was logged publicly (but not target)
        expect(mockGame.logMessage).toHaveBeenCalledWith(null, expect.stringContaining("Doctor successfully saved someone"), MessageVisibility.Public);
        // Verify kill was recorded as null in memory
        expect(mockGame.recordKillInMemory).toHaveBeenCalledWith(null);
         // Verify night results renderer shows no kill
        expect(mockGame.notifyRenderers).toHaveBeenCalledWith('renderNightResults', null);

    });

     it('should process Mafia kill correctly when no save occurs', async () => {
        const mafiaAction: PlayerAction = { type: 'mafiaKill', targetPlayerId: villagerId };
        const doctorAction: PlayerAction = { type: 'doctorSave', targetPlayerId: doctorId }; // Saving self

        const mafiaPlayer = createMockPhasePlayer(mafiaId, new MafiaRole(), mafiaAction);
        const doctorPlayer = createMockPhasePlayer(doctorId, new DoctorRole(), doctorAction);
        const villagerPlayer = createMockPhasePlayer(villagerId, new VillagerRole(), { type: 'noAction' });
        players = [mafiaPlayer, doctorPlayer, villagerPlayer];

        mockGame.getAlivePlayers.mockReturnValue(players);
        mockGame.getPlayer.mockImplementation((id) => players.find(p => p.id === id));
         mockGame.generateVisibleGameState.mockReturnValue({ self: {}, players: [], alivePlayerIds: new Set() });

        await nightPhase.runPhase(mockGame as unknown as Game);

        // Verify killPlayer *was* called for the villager
        expect(mockGame.killPlayer).toHaveBeenCalledWith(villagerId, expect.any(String));
         // Verify kill was recorded in memory
        expect(mockGame.recordKillInMemory).toHaveBeenCalledWith(villagerId);
         // Verify night results renderer shows the kill
        expect(mockGame.notifyRenderers).toHaveBeenCalledWith('renderNightResults', villagerId);
    });

    it('should record Seer investigation results in memory', async () => {
        const seerAction: PlayerAction = { type: 'seerInvestigate', targetPlayerId: mafiaId };
        const mafiaPlayer = createMockPhasePlayer(mafiaId, new MafiaRole(), { type: 'noAction' });
        const seerPlayer = createMockPhasePlayer(seerId, new SeerRole(), seerAction);
         players = [mafiaPlayer, seerPlayer];

        mockGame.getAlivePlayers.mockReturnValue(players);
        mockGame.getPlayer.mockImplementation((id) => players.find(p => p.id === id));
         mockGame.generateVisibleGameState.mockReturnValue({ self: {}, players: [], alivePlayerIds: new Set() });

        await nightPhase.runPhase(mockGame as unknown as Game);

        // Verify recordSeerResultInMemory was called with correct details
        expect(mockGame.recordSeerResultInMemory).toHaveBeenCalledWith(
            seerId,
            mafiaId,
            'Mafia' // Expected allegiance of the target
        );
         expect(mockGame.logMessage).toHaveBeenCalledWith(null, expect.stringContaining("Seer"), MessageVisibility.Private);
    });

     it('should handle Mafia message action during the night', async () => {
         const messageAction: PlayerAction = { type: 'message', content: 'Let\'s frame the Doctor' };
         const mafiaPlayer = createMockPhasePlayer(mafiaId, new MafiaRole(), messageAction);
         players = [mafiaPlayer];

         mockGame.getAlivePlayers.mockReturnValue(players);
         mockGame.getPlayer.mockImplementation((id) => players.find(p => p.id === id));
          mockGame.generateVisibleGameState.mockReturnValue({ self: {}, players: [], alivePlayerIds: new Set() });

         await nightPhase.runPhase(mockGame as unknown as Game);

         // Verify logMessage was called with Mafia visibility
         expect(mockGame.logMessage).toHaveBeenCalledWith(
             mafiaId,
             'Let\'s frame the Doctor',
             MessageVisibility.Mafia
         );
         // Ensure no kill processing happened etc.
         expect(mockGame.killPlayer).not.toHaveBeenCalled();
         expect(mockGame.recordKillInMemory).toHaveBeenCalledWith(null); // Record no kill occurred
     });


    it('should transition to DayPhase', () => {
        const nextPhase = nightPhase.transition(mockGame as unknown as Game);
        expect(nextPhase).toBeInstanceOf(DayPhase);
    });

    // Add tests for Mafia vote tallying, tie-breaking (if any), invalid targets etc.
});