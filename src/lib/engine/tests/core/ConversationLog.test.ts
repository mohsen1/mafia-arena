import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationLog } from '../../src/core/ConversationLog';
import { Message } from '../../src/core/Message';
import { MessageVisibility } from '../../src/interfaces/IMessage';
import { type PlayerId } from '../../src/interfaces/IPlayer';
import { RoleName } from '../../src/interfaces/IRole';

// Helper to create messages easily using the actual Message class
const createMsg = (
    round: number,
    phase: 'Init' | 'Day' | 'Night' | 'GameOver', // Use literals
    senderId: PlayerId | null,
    content: string,
    visibility: MessageVisibility,
    senderName: string = 'TestSender',
    recipientId?: PlayerId
): Message => {
    return new Message(round, phase, senderId, senderName, content, visibility, recipientId);
};

describe('ConversationLog', () => {
    let conversationLog: ConversationLog;
    const player1Id: PlayerId = 'player1'; // Villager
    const player2Id: PlayerId = 'player2'; // Mafia
    const player3Id: PlayerId = 'player3'; // Mafia

    let msg1: Message, msg2: Message, msg3: Message, msg4: Message, msg5: Message;

    beforeEach(() => {
        conversationLog = new ConversationLog();

        // Round 1 Day - Public
        msg1 = createMsg(1, 'Day', player1Id, 'Hello everyone!', MessageVisibility.Public, 'P1');
        // Round 1 Night - Public System Msg
        msg2 = createMsg(1, 'Night', null, 'Night falls', MessageVisibility.Public, 'System');
        // Round 1 Night - Mafia Chat
        msg3 = createMsg(1, 'Night', player2Id, 'Let\'s kill P1', MessageVisibility.Mafia, 'P2');
        // Round 1 Night - Mafia Chat
        msg4 = createMsg(1, 'Night', player3Id, 'Good idea P2', MessageVisibility.Mafia, 'P3');
        // Round 2 Day - Public
        msg5 = createMsg(2, 'Day', player2Id, 'Anyone suspicious?', MessageVisibility.Public, 'P2');

        conversationLog.addMessage(msg1);
        conversationLog.addMessage(msg2);
        conversationLog.addMessage(msg3);
        conversationLog.addMessage(msg4);
        conversationLog.addMessage(msg5);
    });

    describe('Adding and retrieving messages', () => {
        it('should store and retrieve all messages in order', () => {
            const messages = conversationLog.getAllMessages();
            expect(messages.length).toBe(5);
            expect(messages[0]).toBe(msg1);
            expect(messages[1]).toBe(msg2);
            expect(messages[2]).toBe(msg3);
            expect(messages[3]).toBe(msg4);
            expect(messages[4]).toBe(msg5);
        });

        it('should return an immutable array', () => {
            const messages = conversationLog.getAllMessages();
            expect(() => (messages as Message[]).push(msg1)).toThrow(); // Attempt to mutate should fail
        });
    });

    describe('Filtering messages', () => {
        it('should filter by round', () => {
            const round1Messages = conversationLog.getMessages({ round: 1 });
            expect(round1Messages.length).toBe(4);
            expect(round1Messages).toEqual([msg1, msg2, msg3, msg4]);

            const round2Messages = conversationLog.getMessages({ round: 2 });
            expect(round2Messages.length).toBe(1);
            expect(round2Messages).toEqual([msg5]);
        });

        it('should filter by phase', () => {
            const dayMessages = conversationLog.getMessages({ phase: 'Day' });
            expect(dayMessages.length).toBe(2);
            expect(dayMessages).toEqual([msg1, msg5]);

            const nightMessages = conversationLog.getMessages({ phase: 'Night' });
            expect(nightMessages.length).toBe(3);
            expect(nightMessages).toEqual([msg2, msg3, msg4]);
        });

        it('should filter by visibility (single)', () => {
            const publicMessages = conversationLog.getMessages({ visibility: MessageVisibility.Public });
            expect(publicMessages.length).toBe(3);
            expect(publicMessages).toEqual([msg1, msg2, msg5]);

            const mafiaMessages = conversationLog.getMessages({ visibility: MessageVisibility.Mafia });
            expect(mafiaMessages.length).toBe(2);
            expect(mafiaMessages).toEqual([msg3, msg4]);
        });

        it('should filter by visibility (array)', () => {
            const allMessages = conversationLog.getMessages({ visibility: [MessageVisibility.Public, MessageVisibility.Mafia] });
            expect(allMessages.length).toBe(5);
            expect(allMessages).toEqual([msg1, msg2, msg3, msg4, msg5]);
        });

        it('should filter messages relevant to a Villager', () => {
            const villagerView = conversationLog.getMessages({ relevantToPlayer: { id: player1Id, role: RoleName.Villager } });
            expect(villagerView.length).toBe(3); // Only public messages
            expect(villagerView).toEqual([msg1, msg2, msg5]);
        });

        it('should filter messages relevant to a Mafia member', () => {
            const mafiaView = conversationLog.getMessages({ relevantToPlayer: { id: player2Id, role: RoleName.Mafia } });
            expect(mafiaView.length).toBe(5); // Public + Mafia messages
            expect(mafiaView).toEqual([msg1, msg2, msg3, msg4, msg5]);
        });

        it('should combine multiple filters', () => {
            const round1NightMafiaMessages = conversationLog.getMessages({
                round: 1,
                phase: 'Night',
                visibility: MessageVisibility.Mafia
            });
            expect(round1NightMafiaMessages.length).toBe(2);
            expect(round1NightMafiaMessages).toEqual([msg3, msg4]);

            const round1NightPublicMessages = conversationLog.getMessages({
                round: 1,
                phase: 'Night',
                visibility: MessageVisibility.Public
            });
            expect(round1NightPublicMessages.length).toBe(1);
            expect(round1NightPublicMessages).toEqual([msg2]);
        });

         it('should return empty array if no messages match filters', () => {
             const noMatch = conversationLog.getMessages({ round: 3 });
             expect(noMatch.length).toBe(0);

             const noMatchPhase = conversationLog.getMessages({ phase: 'Init' });
             expect(noMatchPhase.length).toBe(0);
         });
    });
});
