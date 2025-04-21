import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Game } from '../../src/core/Game';
import { Player } from '../../src/core/Player';
import { ConversationLog } from '../../src/core/ConversationLog';
import { GamePhaseType } from '../../src/interfaces/GameState';
import { PlayerStatus } from '../../src/interfaces/IPlayer';
import { RoleName } from '../../src/interfaces/IRole';
import type { PlayerId } from '../../src/interfaces/IPlayer';
import type { IAgent, PlayerAction } from '../../src/interfaces/IAgent';
import type { IRole } from '../../src/interfaces/IRole';
import type { IRandomGenerator } from '../../src/interfaces/IRandomGenerator';

// Mock role implementations
const mockVillagerRole: IRole = {
    name: RoleName.Villager,
    allegiance: 'Town',
    canPerformNightAction: false,
    description: 'A simple villager',
};

const mockMafiaRole: IRole = {
    name: RoleName.Mafia,
    allegiance: 'Mafia',
    canPerformNightAction: true,
    description: 'Mafia member',
};

// Mock agent factory
const createMockAgent = (id: PlayerId): IAgent => ({
    playerId: id,
    getAction: vi.fn().mockResolvedValue({ type: 'noAction' })
});

// Mock random generator
const mockRandom: IRandomGenerator = {
    getRandomInt: vi.fn(),
    shuffle: vi.fn(arr => [...arr]), // Returns a copy of the array without shuffling
};

describe('Game', () => {
    const gameId = 'test-game-123';
    let playerIds: PlayerId[];
    let playerNames: string[];
    let players: Player[];
    let game: Game;

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();
        
        // Create test players: 3 villagers, 2 mafia
        playerIds = ['p1', 'p2', 'p3', 'p4', 'p5'];
        playerNames = ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5'];
        
        players = [
            new Player(playerIds[0], playerNames[0], mockVillagerRole, createMockAgent(playerIds[0])),
            new Player(playerIds[1], playerNames[1], mockVillagerRole, createMockAgent(playerIds[1])),
            new Player(playerIds[2], playerNames[2], mockVillagerRole, createMockAgent(playerIds[2])),
            new Player(playerIds[3], playerNames[3], mockMafiaRole, createMockAgent(playerIds[3])),
            new Player(playerIds[4], playerNames[4], mockMafiaRole, createMockAgent(playerIds[4])),
        ];
        
        // Create the game
        game = new Game(gameId, players, mockRandom);
    });

    describe('Game initialization', () => {
        it('should initialize with the correct properties', () => {
            expect(game.id).toBe(gameId);
            expect(game.round).toBe(1);
            expect(game.phase).toBe(GamePhaseType.Day);
            expect(game.isGameOver).toBe(false);
            expect(game.winningTeam).toBeNull();
        });

        it('should initialize with all players alive', () => {
            const allPlayers = game.getPlayers();
            expect(allPlayers.length).toBe(5);
            allPlayers.forEach(player => {
                expect(player.isAlive()).toBe(true);
            });
        });

        it('should throw error if no players are provided', () => {
            expect(() => new Game('empty-game', [], mockRandom)).toThrow(/at least one player/);
        });

        it('should throw error if duplicate player IDs exist', () => {
            const duplicatePlayers = [
                new Player('dup-id', 'Player A', mockVillagerRole, createMockAgent('dup-id')),
                new Player('dup-id', 'Player B', mockVillagerRole, createMockAgent('dup-id')),
            ];
            expect(() => new Game('dup-game', duplicatePlayers, mockRandom)).toThrow(/duplicate player ID/);
        });
    });

    describe('Player management', () => {
        it('should get a player by ID', () => {
            const player = game.getPlayerById(playerIds[0]);
            expect(player).toBeDefined();
            expect(player?.id).toBe(playerIds[0]);
            expect(player?.name).toBe(playerNames[0]);
        });

        it('should return null for non-existent player ID', () => {
            const player = game.getPlayerById('non-existent');
            expect(player).toBeNull();
        });

        it('should get all alive players', () => {
            const alivePlayers = game.getAlivePlayers();
            expect(alivePlayers.length).toBe(5);
            
            // Kill a player and check again
            game.getPlayerById(playerIds[0])?.kill();
            const updatedAlivePlayers = game.getAlivePlayers();
            expect(updatedAlivePlayers.length).toBe(4);
            expect(updatedAlivePlayers.find(p => p.id === playerIds[0])).toBeUndefined();
        });
    });

    describe('Game state visibility', () => {
        it('should generate public game state', () => {
            const publicState = game.getPublicGameState();
            
            expect(publicState.gameId).toBe(gameId);
            expect(publicState.round).toBe(1);
            expect(publicState.phase).toBe(GamePhaseType.Day);
            expect(publicState.players.length).toBe(5);
            expect(publicState.alivePlayerIds.size).toBe(5);
            
            // Public state should not reveal roles
            publicState.players.forEach(player => {
                expect(player).not.toHaveProperty('role');
            });
        });

        it('should generate player-specific game state', () => {
            const playerState = game.getVisibleGameStateForPlayer(playerIds[3]); // Mafia player
            
            expect(playerState.gameId).toBe(gameId);
            expect(playerState.round).toBe(1);
            expect(playerState.phase).toBe(GamePhaseType.Day);
            
            // Should include player's own role info
            expect(playerState.self.id).toBe(playerIds[3]);
            expect(playerState.self.role).toBe(RoleName.Mafia);
            expect(playerState.self.isMafia).toBe(true);
            
            // Other players should be represented without roles
            expect(playerState.players.length).toBe(5);
            playerState.players.forEach(player => {
                if (player.id !== playerIds[3]) {
                    expect(player).not.toHaveProperty('role');
                }
            });
        });

        it('should include other mafia members in mafia player state', () => {
            const mafiaState = game.getVisibleGameStateForPlayer(playerIds[3]); // First mafia player
            
            const mafiaMembers = mafiaState.mafiaMembers;
            expect(mafiaMembers).toBeDefined();
            expect(mafiaMembers?.length).toBe(2);
            expect(mafiaMembers?.map(p => p.id)).toContain(playerIds[4]); // Should know about other mafia
        });

        it('should not include mafia members for non-mafia players', () => {
            const villagerState = game.getVisibleGameStateForPlayer(playerIds[0]); // Villager player
            expect(villagerState.mafiaMembers).toBeUndefined();
        });
    });

    describe('Win conditions', () => {
        it('should detect Town win when all Mafia are eliminated', () => {
            // Kill all Mafia players
            game.getPlayerById(playerIds[3])?.kill();
            game.getPlayerById(playerIds[4])?.kill();
            
            // Check win condition
            expect(game.checkGameOver()).toBe(true);
            expect(game.isGameOver).toBe(true);
            expect(game.winningTeam).toBe('Town');
        });

        it('should detect Mafia win when Mafia equals or outnumbers Town', () => {
            // Kill all but one Town players
            game.getPlayerById(playerIds[0])?.kill();
            game.getPlayerById(playerIds[1])?.kill();
            
            // Check win condition - not yet won (2 mafia vs 1 town)
            expect(game.checkGameOver()).toBe(true);
            expect(game.isGameOver).toBe(true);
            expect(game.winningTeam).toBe('Mafia');
        });

        it('should not end game when neither win condition is met', () => {
            // Kill one Town player
            game.getPlayerById(playerIds[0])?.kill();
            
            // Check win condition - game should continue
            expect(game.checkGameOver()).toBe(false);
            expect(game.isGameOver).toBe(false);
            expect(game.winningTeam).toBeNull();
        });
    });

    describe('Game phases and voting', () => {
        it('should advance to night phase', () => {
            game.advanceToNight();
            
            expect(game.phase).toBe(GamePhaseType.Night);
            expect(game.round).toBe(1); // Should still be same round
        });

        it('should advance to day and increment round', () => {
            game.advanceToNight();
            game.advanceToDay();
            
            expect(game.phase).toBe(GamePhaseType.Day);
            expect(game.round).toBe(2); // Round should increment
        });

        it('should record votes and determine majority', () => {
            // Three players vote for playerIds[4] (majority of 5)
            game.recordVote(playerIds[0], playerIds[4]);
            game.recordVote(playerIds[1], playerIds[4]);
            game.recordVote(playerIds[2], playerIds[4]);
            // One player votes for playerIds[0]
            game.recordVote(playerIds[3], playerIds[0]);
            
            const votingResult = game.tallyVotes();
            expect(votingResult.targetId).toBe(playerIds[4]);
            expect(votingResult.voteCount).toBe(3);
        });

        it('should return null for voting result if no majority', () => {
            // No majority - all voting for different targets
            game.recordVote(playerIds[0], playerIds[1]);
            game.recordVote(playerIds[1], playerIds[2]);
            game.recordVote(playerIds[2], playerIds[3]);
            game.recordVote(playerIds[3], playerIds[4]);
            game.recordVote(playerIds[4], playerIds[0]);
            
            const votingResult = game.tallyVotes();
            expect(votingResult).toBeNull();
        });

        it('should clear votes when advancing phases', () => {
            // Record some votes
            game.recordVote(playerIds[0], playerIds[4]);
            game.recordVote(playerIds[1], playerIds[4]);
            
            // Advance phase
            game.advanceToNight();
            
            // Should have reset votes
            const votingResult = game.tallyVotes();
            expect(votingResult).toBeNull();
        });
    });

    describe('Game message log', () => {
        it('should initialize with an empty conversation log', () => {
            const messages = game.getConversationLog().getAllMessages();
            expect(messages).toHaveLength(0);
        });

        it('should add game event messages to the log', () => {
            game.addGameEventMessage('Game started');
            
            const messages = game.getConversationLog().getAllMessages();
            expect(messages).toHaveLength(1);
            expect(messages[0].content).toBe('Game started');
            expect(messages[0].visibility).toBe('all');
        });

        it('should add player messages to the log', () => {
            game.addPlayerMessage(playerIds[0], 'Hello everyone');
            
            const messages = game.getConversationLog().getAllMessages();
            expect(messages).toHaveLength(1);
            expect(messages[0].playerId).toBe(playerIds[0]);
            expect(messages[0].content).toBe('Hello everyone');
        });

        it('should add night messages with mafia visibility', () => {
            game.advanceToNight();
            game.addMafiaMessage(playerIds[3], 'Secret mafia plan');
            
            const messages = game.getConversationLog().getAllMessages();
            expect(messages).toHaveLength(1);
            expect(messages[0].playerId).toBe(playerIds[3]);
            expect(messages[0].visibility).toBe('mafia');
            expect(messages[0].phase).toBe(GamePhaseType.Night);
        });
    });
});
