import { createInitialMemory } from '@/lib/engine/interfaces/AgentMemory';
import type { PlayerAction } from '@/lib/engine/interfaces/IAgent';
import { RoleName, type Allegiance } from '@/lib/engine/interfaces/IRole';
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer';
import type { GamePhaseType } from '@/lib/engine/interfaces/IGamePhase';
import { getSystemPrompt, getUserPrompt } from '@/lib/engine/prompts';
import { beforeEach, describe, expect, it } from 'vitest';

interface MockStateData {
  round: number;
  phase: GamePhaseType;
  language: string;
  themeName: string;
  self: {
    id: PlayerId;
    name: string;
    role: RoleName;
    allegiance: Allegiance;
    status: string;
    isMafia: boolean;
    persona: { name: string; backstory: string; personalityTraits: string[] };
  };
  players: Array<{ id: PlayerId; name: string; status: string }>;
  alivePlayerIds: PlayerId[];
  mafiaPlayerIds?: PlayerId[];
  memory: ReturnType<typeof createInitialMemory>;
}

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
      expect(prompt).toContain('DECISIVE ACTION');
      expect(prompt).toContain('Valid Action Types:');
    });
  });

  describe('getUserPrompt', () => {
    let mockStateData: MockStateData;
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
          allegiance: 'Town',
          status: 'Alive',
          isMafia: false,
          persona: {
            name: 'Bartholomew Quill',
            backstory: 'Nervous librarian',
            personalityTraits: ['Anxious'],
          },
        },
        players: [
          { id: 'player-1-bart', name: 'Bartholomew Quill', status: 'Alive' },
          { id: 'player-2-agnes', name: 'Agnes Periwinkle', status: 'Alive' },
          { id: 'player-3-rev', name: 'Reverend Thomas', status: 'Dead' },
        ],
        alivePlayerIds: ['player-1-bart', 'player-2-agnes'],
        mafiaPlayerIds: undefined, // Villager view
        memory: createInitialMemory(),
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
      // Check within the Identity section
      expect(prompt).toContain('**Your Persona:**');
      // Check for specific fields
      expect(prompt).toContain(`- Name: ${mockStateData.self.persona.name}`);
      expect(prompt).toContain(
        `- Backstory: ${mockStateData.self.persona.backstory}`
      );
      expect(prompt).toContain(
        `- Traits: ${mockStateData.self.persona.personalityTraits.join(', ')}`
      );
    });

    it('should include self role information', () => {
      const prompt = getUserPrompt(mockStateData, allowedActions);
      // Check within the Identity section
      expect(prompt).toContain('**Your Identity:**');
      expect(prompt).toContain('- Your Role: Villager');
      expect(prompt).toContain('- Your Allegiance: Town'); // The actual allegiance from VillagerRole
    });

    it('should list alive players', () => {
      const prompt = getUserPrompt(mockStateData, allowedActions);
      // Check within the Players section
      expect(prompt).toContain('**Players (3 total, 2 alive):**');
      expect(prompt).toContain('- Bartholomew Quill (player-1-bart) (You)');
      expect(prompt).toContain('- Agnes Periwinkle (player-2-agnes)');
      expect(prompt).toContain(
        '(Alive Player IDs: player-1-bart, player-2-agnes)'
      );
    });

    it('should list players with correct status indication in the main list', () => {
      // The current prompt primarily lists *alive* players in the main list.
      // Dead players contribute to the total count but aren't listed there by default.
      const prompt = getUserPrompt(mockStateData, allowedActions);
      expect(prompt).toContain('**Players (3 total, 2 alive):**');
      // Check that the dead player isn't in the main alive list
      expect(prompt).not.toContain('- Reverend Thomas');
      // The test for explicitly listing dead players might be obsolete or needs a different focus
      // e.g., checking memory/history sections if they were to contain this info.
      // For now, we confirm the alive list is correct.
    });

    it('should include known Mafia members if Mafia', () => {
      mockStateData.self.role = RoleName.Mafia;
      mockStateData.self.isMafia = true;
      mockStateData.mafiaPlayerIds = ['player-1-bart', 'player-4-silas'];
      // Add the mafia player to the main player list for consistency
      mockStateData.players.push({
        id: 'player-4-silas',
        name: 'Silas Blackwood',
        status: 'Alive',
      });
      mockStateData.alivePlayerIds.push('player-4-silas');

      const prompt = getUserPrompt(mockStateData, allowedActions);
      expect(prompt).toContain('**Mafia Team:**');
      // Check for names and IDs as formatted
      expect(prompt).toContain(
        'Your fellow Mafia members are: Bartholomew Quill (player-1-bart), Silas Blackwood (player-4-silas)'
      );
    });

    it('should indicate presence of memory if available', () => {
      // Add *some* data to memory to trigger the indicator
      mockStateData.memory.voteHistory.push({
        round: 1,
        votes: new Map([['p1', 'p2']]),
      });

      const prompt = getUserPrompt(mockStateData, allowedActions);

      // Check for the simplified memory indication
      expect(prompt).toContain('**Your Memory / Game History Summary:**');
      expect(prompt).toContain('- *You have some memories recorded.*');

      // Remove detailed checks as they are no longer applicable to the current prompt format
      // expect(prompt).toContain('--- Your Memory ---'); // Old format
    });

    it('should include allowed actions and examples', () => {
      const prompt = getUserPrompt(mockStateData, allowedActions);
      expect(prompt).toContain('**YOUR TURN - ACTION REQUIRED:**');
      expect(prompt).toContain(
        '**MANDATORY:** You must take decisive action from: message, vote, noAction.'
      );
      expect(prompt).toContain('**Action Format Examples:**');
      
      // 🎯 UPDATED: Check for enhanced phase-specific message guidance
      expect(prompt).toContain(
        '- **Strategic Discussion:** `{"type": "message", "content": "Based on yesterday\'s events, I suspect [player] because [reasoning]. What do others think?"}` (**SHARE SUSPICIONS & BUILD CASES!**)'
      );
      expect(prompt).toContain(
        '- **General Message:** `{"type": "message", "content": "Your strategic message here..."}` (**ENGAGE ACTIVELY IN CONVERSATION!**)'
      );
      expect(prompt).toContain(
        '- **Vote to Eliminate:** `{"type": "vote", "targetPlayerId": "player-id-to-vote-for"}` (**CHOOSE A TARGET!**)'
      );
      // Check it doesn't include examples for actions not allowed
      expect(prompt).not.toContain('**Execute Target:**');
    });

    // 🎯 NEW TEST: Round 1 Introduction phase should have specific guidance
    it('should include Introduction phase guidance for Round 1', () => {
      mockStateData.round = 1; // Round 1
      allowedActions = ['message', 'noAction'];
      const prompt = getUserPrompt(mockStateData, allowedActions);
      
      // Check for Introduction-specific guidance
      expect(prompt).toContain(
        '- **Introduction:** `{"type": "message", "content": "Hello everyone! I am [persona-name]. [Brief intro about yourself and your concerns about the threat in the village]"}` (**INTRODUCE YOURSELF MEANINGFULLY!**)'
      );
      expect(prompt).toContain('**Action Format Examples:**');
      expect(prompt).toContain(
        '- **General Message:** `{"type": "message", "content": "Your strategic message here..."}` (**ENGAGE ACTIVELY IN CONVERSATION!**)'
      );
    });

    it('should NOT include Round 1 intro instruction text after Round 1', () => {
      mockStateData.round = 2; // Round 2
      allowedActions = ['message'];
      const prompt = getUserPrompt(mockStateData, allowedActions);
      // Check that the general turn instruction is present, not a R1 specific one
      expect(prompt).toContain('**YOUR TURN - ACTION REQUIRED:**');
      expect(prompt).toContain(
        '**MANDATORY:** You must take decisive action from: message.'
      );
      // The old "Choose your action..." text is removed.
      // expect(prompt).toContain('Choose your action based on your role, persona, memory');
    });
  });
});
