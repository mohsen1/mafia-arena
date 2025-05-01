import { describe, it, expect, beforeEach } from 'vitest';
import { Message } from '@/lib/engine/core/Message';
import { MessageVisibility } from '@/lib/engine/interfaces/IMessage';
import { type PlayerId } from '@/lib/engine/interfaces/IPlayer';
// import type { GamePhaseType } from '@/lib/engine/interfaces/IGamePhase'; // Unused

describe('Message', () => {
    it('should create a message with required properties', () => {
        const message = new Message(
            1,                         // round
            'Day',                     // phase
            'player-1',                // senderId
            'Player 1',                // senderName
            'Hello world',             // content
            MessageVisibility.Public   // visibility
        );

        expect(message.round).toBe(1);
        expect(message.phase).toBe('Day');
        expect(message.senderId).toBe('player-1');
        expect(message.senderName).toBe('Player 1');
        expect(message.content).toBe('Hello world');
        expect(message.visibility).toBe(MessageVisibility.Public);
        expect(message.recipientId).toBeUndefined();
        expect(message.id).toBeDefined();
        expect(typeof message.id).toBe('string');
        expect(message.timestamp).toBeInstanceOf(Date);
    });

    it('should create a message with an optional recipient', () => {
        const recipientId: PlayerId = 'player-2';
        const message = new Message(
            1,
            'Night',                     // phase
            'player-1',
            'Player 1',
            'Private message',
            MessageVisibility.Mafia,
            recipientId
        );
        expect(message.phase).toBe('Night');
        expect(message.recipientId).toBe(recipientId);
    });

    it('should create a system message with null senderId', () => {
        const message = new Message(
            1,
            'Day',                     // phase
            null,                      // System message has null senderId
            'System',
            'Game announcement',
            MessageVisibility.Public
        );
        expect(message.phase).toBe('Day');
        expect(message.senderId).toBeNull();
        expect(message.senderName).toBe('System');
    });

    it('should generate a unique ID for each message', () => {
        const message1 = new Message(
            1, 
            'Day', 
            'player-1', 
            'Player 1', 
            'First message', 
            MessageVisibility.Public
        );
        
        const message2 = new Message(
            1, 
            'Day', 
            'player-1', 
            'Player 1', 
            'Second message', 
            MessageVisibility.Public
        );

        expect(message1.id).not.toBe(message2.id);
    });
}); 