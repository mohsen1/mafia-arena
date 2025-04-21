import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationLog } from '../../src/core/ConversationLog';
import { Message } from '../../src/core/Message';
import { GamePhaseType } from '../../src/interfaces/IGamePhase';
import { MessageVisibility } from '../../src/interfaces/IMessage';
import { PlayerId } from '../../src/interfaces/IPlayer';
import { RoleName } from '../../src/interfaces/IRole';
import { GameMessage } from '../../src/interfaces/GameState';

// Helper to create messages easily
const createMsg = (
    round: number,
    phase: GamePhaseType,
    senderId: PlayerId | null,
    content: string,
    visibility: MessageVisibility,
    senderName: string = 'TestSender'
): Message => {
    return new Message(round, phase, senderId, senderName, content, visibility);
};

describe('ConversationLog', () => {
    let conversationLog: ConversationLog;
    const player1Id: PlayerId = 'player1';
    const player2Id: PlayerId = 'player2';
    const player3Id: PlayerId = 'player3';

    beforeEach(() => {
        conversationLog = new ConversationLog();
    });

    describe('Adding messages', () => {
        it('should add messages correctly', () => {
            conversationLog.addMessage({
                id: '1',
                timestamp: new Date(),
                content: 'Hello world',
                phase: GamePhaseType.Day,
                round: 1,
                visibility: 'all'
            });

            const messages = conversationLog.getAllMessages();
            expect(messages.length).toBe(1);
            expect(messages[0].content).toBe('Hello world');
        });

        it('should add player messages', () => {
            conversationLog.addPlayerMessage({
                id: '1',
                timestamp: new Date(),
                content: 'Player speaking',
                phase: GamePhaseType.Day,
                round: 1,
                playerId: player1Id,
                visibility: 'all'
            });

            const messages = conversationLog.getAllMessages();
            expect(messages.length).toBe(1);
            expect(messages[0].playerId).toBe(player1Id);
        });

        it('should preserve message order', () => {
            const date1 = new Date();
            const date2 = new Date(date1.getTime() + 1000);
            
            conversationLog.addMessage({
                id: '1',
                timestamp: date1,
                content: 'First message',
                phase: GamePhaseType.Day,
                round: 1,
                visibility: 'all'
            });
            
            conversationLog.addMessage({
                id: '2',
                timestamp: date2,
                content: 'Second message',
                phase: GamePhaseType.Day,
                round: 1,
                visibility: 'all'
            });

            const messages = conversationLog.getAllMessages();
            expect(messages.length).toBe(2);
            expect(messages[0].content).toBe('First message');
            expect(messages[1].content).toBe('Second message');
        });
    });

    describe('Message Filtering', () => {
        beforeEach(() => {
            // Add various messages for testing filters
            
            // Day messages - Round 1
            conversationLog.addPlayerMessage({
                id: '1',
                timestamp: new Date(),
                content: 'Day message from player 1',
                phase: GamePhaseType.Day,
                round: 1,
                playerId: player1Id,
                visibility: 'all'
            });
            
            conversationLog.addPlayerMessage({
                id: '2',
                timestamp: new Date(),
                content: 'Day message from player 2',
                phase: GamePhaseType.Day,
                round: 1,
                playerId: player2Id,
                visibility: 'all'
            });
            
            // Night messages - Round 1
            conversationLog.addPlayerMessage({
                id: '3',
                timestamp: new Date(),
                content: 'Mafia night message',
                phase: GamePhaseType.Night,
                round: 1,
                playerId: player1Id,
                visibility: 'mafia'
            });
            
            // Game event message - Round 1
            conversationLog.addMessage({
                id: '4',
                timestamp: new Date(),
                content: 'Game event: Night has fallen',
                phase: GamePhaseType.Night,
                round: 1,
                visibility: 'all'
            });
            
            // Day messages - Round 2
            conversationLog.addPlayerMessage({
                id: '5',
                timestamp: new Date(),
                content: 'Day message from player 3',
                phase: GamePhaseType.Day,
                round: 2,
                playerId: player3Id,
                visibility: 'all'
            });
        });

        it('should filter messages by phase', () => {
            const dayMessages = conversationLog.getMessagesByPhase(GamePhaseType.Day);
            const nightMessages = conversationLog.getMessagesByPhase(GamePhaseType.Night);
            
            expect(dayMessages.length).toBe(3); // 2 from round 1, 1 from round 2
            expect(nightMessages.length).toBe(2); // 1 player message, 1 game event
        });

        it('should filter messages by round', () => {
            const round1Messages = conversationLog.getMessagesByRound(1);
            const round2Messages = conversationLog.getMessagesByRound(2);
            
            expect(round1Messages.length).toBe(4); // 2 day messages, 1 night message, 1 game event
            expect(round2Messages.length).toBe(1); // 1 day message
        });

        it('should filter messages by player', () => {
            const player1Messages = conversationLog.getMessagesByPlayer(player1Id);
            const player2Messages = conversationLog.getMessagesByPlayer(player2Id);
            
            expect(player1Messages.length).toBe(2); // 1 day message, 1 night message
            expect(player2Messages.length).toBe(1); // 1 day message
        });

        it('should filter messages by visibility', () => {
            const publicMessages = conversationLog.getMessagesVisibleTo('all');
            const mafiaMessages = conversationLog.getMessagesVisibleTo('mafia');
            
            expect(publicMessages.length).toBe(4); // All 'all' visibility messages
            expect(mafiaMessages.length).toBe(5); // All messages (mafia can see all)
        });

        it('should filter messages for a specific player', () => {
            // Assuming player1 is mafia, player2 is not
            const visibleToPlayer1 = conversationLog.getMessagesVisibleToPlayer(player1Id, true);
            const visibleToPlayer2 = conversationLog.getMessagesVisibleToPlayer(player2Id, false);
            
            expect(visibleToPlayer1.length).toBe(5); // All messages (mafia)
            expect(visibleToPlayer2.length).toBe(4); // Only public messages
        });

        it('should combine multiple filters', () => {
            const dayRound1Messages = conversationLog.getMessagesBy({
                phase: GamePhaseType.Day,
                round: 1
            });
            
            expect(dayRound1Messages.length).toBe(2);
            
            const player1DayMessages = conversationLog.getMessagesBy({
                phase: GamePhaseType.Day,
                playerId: player1Id
            });
            
            expect(player1DayMessages.length).toBe(1);
        });

        it('should get messages between two timestamps', () => {
            // Replace the log with messages at specific times
            conversationLog = new ConversationLog();
            
            const time1 = new Date('2023-01-01T10:00:00Z');
            const time2 = new Date('2023-01-01T10:05:00Z');
            const time3 = new Date('2023-01-01T10:10:00Z');
            
            conversationLog.addMessage({
                id: '1',
                timestamp: time1,
                content: 'Message at 10:00',
                phase: GamePhaseType.Day,
                round: 1,
                visibility: 'all'
            });
            
            conversationLog.addMessage({
                id: '2',
                timestamp: time2,
                content: 'Message at 10:05',
                phase: GamePhaseType.Day,
                round: 1,
                visibility: 'all'
            });
            
            conversationLog.addMessage({
                id: '3',
                timestamp: time3,
                content: 'Message at 10:10',
                phase: GamePhaseType.Day,
                round: 1,
                visibility: 'all'
            });
            
            const timeRangeMessages = conversationLog.getMessagesBetween(
                new Date('2023-01-01T10:01:00Z'),
                new Date('2023-01-01T10:09:00Z')
            );
            
            expect(timeRangeMessages.length).toBe(1);
            expect(timeRangeMessages[0].content).toBe('Message at 10:05');
        });
    });

    describe('Message information', () => {
        it('should have correct message counts', () => {
            conversationLog.addMessage({
                id: '1',
                timestamp: new Date(),
                content: 'Message 1',
                phase: GamePhaseType.Day,
                round: 1,
                visibility: 'all'
            });
            
            conversationLog.addMessage({
                id: '2',
                timestamp: new Date(),
                content: 'Message 2',
                phase: GamePhaseType.Day,
                round: 1,
                visibility: 'all'
            });
            
            expect(conversationLog.getMessageCount()).toBe(2);
        });

        it('should generate summary statistics', () => {
            conversationLog.addPlayerMessage({
                id: '1',
                timestamp: new Date(),
                content: 'Player 1 message 1',
                phase: GamePhaseType.Day,
                round: 1,
                playerId: player1Id,
                visibility: 'all'
            });
            
            conversationLog.addPlayerMessage({
                id: '2',
                timestamp: new Date(),
                content: 'Player 1 message 2',
                phase: GamePhaseType.Day,
                round: 1,
                playerId: player1Id,
                visibility: 'all'
            });
            
            conversationLog.addPlayerMessage({
                id: '3',
                timestamp: new Date(),
                content: 'Player 2 message',
                phase: GamePhaseType.Day,
                round: 1,
                playerId: player2Id,
                visibility: 'all'
            });
            
            const stats = conversationLog.getMessageStatistics();
            
            expect(stats.totalMessages).toBe(3);
            expect(stats.messagesByPlayer[player1Id]).toBe(2);
            expect(stats.messagesByPlayer[player2Id]).toBe(1);
        });
    });
});
