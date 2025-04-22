// tests/prompts.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getSystemPrompt, getUserPrompt } from '../../src/prompts';
import { createInitialMemory, type AgentMemory } from '../../src/interfaces/AgentMemory';
import { RoleName } from '../../src/interfaces/IRole';
import type { VisibleGameState } from '../../src/interfaces/GameState';
import type { PlayerAction } from '../../src/interfaces/IAgent';
import { Message } from '../../src/core/Message';
import { MessageVisibility } from '../../src/interfaces/IMessage';

describe('Prompts', () => {

    describe('getSystemPrompt', () => {
        it('should return a non-empty string', () => {
            const prompt = getSystemPrompt();
            expect(prompt).toBeTypeOf('string');
            expect(prompt.length).toBeGreaterThan(0);
        });

        it('should contain essential keywords', () => {
             const prompt = getSystemPrompt();
             expect(prompt).toContain('Mafia game');
             expect(prompt).toContain('Persona');
             expect(prompt).toContain('JSON object');
             expect(prompt).toContain('DO NOT REVEAL YOUR ROLE');
             expect(prompt).toContain('Valid Actions (based on phase and role):');
         });
    });

    describe('getUserPrompt', () => {
        let mockStateData: any; // Use 'any' for easier mocking of state structure
        let allowedActions: PlayerAction['type'][];

        beforeEach(() => {
            // Reset mock data
            allowedActions = ['message', 'vote', 'noAction'];
            mockStateData = {
                round: 3,
                phase: 'Day',
                language: 'en',
                themeName: 'UK_VILLAGE_1900S',
                self: {
                    id: 'player-1-bart',
                    name: 'Bartholomew Quill',
                    role: RoleName.Villager,
                    isMafia: false,
                    persona: { name: 'Bartholomew Quill', backstory: 'Nervous librarian', personalityTraits: ['Anxious'] }
                },
                players: [
                    { id: 'player-1-bart', name: 'Bartholomew Quill', status: 'Alive' },
                    { id: 'player-2-agnes', name: 'Agnes Periwinkle', status: 'Alive' },
                    { id: 'player-3-rev', name: 'Reverend Thomas', status: 'Dead' }
                ],
                alivePlayerIds: ['player-1-bart', 'player-2-agnes'],
                mafiaPlayerIds: undefined, // Villager view
                memory: createInitialMemory()
            };
        });

        it('should generate a prompt containing current round, phase, and language', () => {
            const prompt = getUserPrompt(mockStateData, allowedActions);
            expect(prompt).toContain('Round: 3');
            expect(prompt).toContain('Phase: Day');
            expect(prompt).toContain('Language: en');
            expect(prompt).toContain('Theme: UK_VILLAGE_1900S');
        });

         it('should include persona information if available', () => {
             const prompt = getUserPrompt(mockStateData, allowedActions);
             expect(prompt).toContain('Your Persona: Bartholomew Quill (Anxious)');
             expect(prompt).toContain('Backstory: Nervous librarian');
         });

        it('should include self role information', () => {
            const prompt = getUserPrompt(mockStateData, allowedActions);
             expect(prompt).toContain('Your Info (Self Role): {"role":"Villager","isMafia":false}');
        });

        it('should list alive players', () => {
             const prompt = getUserPrompt(mockStateData, allowedActions);
             expect(prompt).toContain('Alive Players: player-1-bart, player-2-agnes');
         });

         it('should list all player statuses', () => {
              const prompt = getUserPrompt(mockStateData, allowedActions);
              expect(prompt).toContain('"id":"player-3-rev"');
              expect(prompt).toContain('"status":"Dead"');
          });

        it('should include known Mafia members if Mafia', () => {
            mockStateData.self.role = RoleName.Mafia;
            mockStateData.self.isMafia = true;
            mockStateData.mafiaPlayerIds = ['player-1-bart', 'player-4-silas']; // Example
            const prompt = getUserPrompt(mockStateData, allowedActions);
            expect(prompt).toContain('Known Mafia Members: player-1-bart, player-4-silas');
        });

         it('should include formatted memory sections (Votes, Kills, Investigations, Messages)', () => {
             // Add data to memory
             mockStateData.memory.voteHistory.push({ round: 1, votes: new Map([['p1', 'p2']]) });
             mockStateData.memory.killHistory.push({ round: 1, killedPlayerId: 'p3' });
             mockStateData.memory.investigationResults.push({ round: 1, targetId: 'p2', allegiance: 'Town' });
             mockStateData.memory.messageHistory = [
                 new Message(1, 'Day', 'p2', 'Agnes', 'Hello!', MessageVisibility.Public)
             ];

             const prompt = getUserPrompt(mockStateData, allowedActions);

             // Check for sections and content
             expect(prompt).toContain('--- Your Memory ---');
             expect(prompt).toContain('Your Investigation Results:');
             expect(prompt).toContain('- Round 1: Investigated p2 (p2) - Result: Town'); // Assumes p2 is Agnes
             expect(prompt).toContain('Previous Day Voting History:');
             expect(prompt).toContain('- p1 voted for p2'); // Assumes p1 is Bart, p2 is Agnes
             expect(prompt).toContain('Previous Night Kill History:');
             expect(prompt).toContain('- Round 1: p3 was killed.'); // Assumes p3 is Rev
             expect(prompt).toContain('Full Conversation History (Visible to You):');
             expect(prompt).toContain('[R1 Day] Agnes: Hello!');
             expect(prompt).toContain('--- End Memory ---');
         });

        it('should include allowed actions', () => {
             const prompt = getUserPrompt(mockStateData, allowedActions);
             expect(prompt).toContain('Allowed Actions: message, vote, noAction');
         });

        it('should include special instruction for Round 1 introductions', () => {
             mockStateData.round = 1;
             allowedActions = ['message']; // Only message allowed
             const prompt = getUserPrompt(mockStateData, allowedActions);
             expect(prompt).toContain('**It\'s Round 1 Introductions! Your ONLY goal this turn is to introduce yourself based on your Persona.**');
         });

         it('should NOT include Round 1 intro instruction after Round 1', () => {
              mockStateData.round = 2; // Round 2
              allowedActions = ['message'];
              const prompt = getUserPrompt(mockStateData, allowedActions);
              expect(prompt).not.toContain('**It\'s Round 1 Introductions!');
              expect(prompt).toContain('Choose your action based on your role, persona, memory');
          });
    });
});