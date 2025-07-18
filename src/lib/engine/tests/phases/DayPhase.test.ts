// tests/phases/DayPhase.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DayPhase } from '@/lib/engine/phases/DayPhase';
import type { Game } from '@/lib/engine/core/Game';
import { Player } from '@/lib/engine/core/Player';
import type { IRole } from '@/lib/engine/interfaces/IRole';
import { VillagerRole } from '@/lib/engine/roles/VillagerRole';
import { MafiaRole } from '@/lib/engine/roles/MafiaRole';
import { SeerRole } from '@/lib/engine/roles/SeerRole';
import { DoctorRole } from '@/lib/engine/roles/DoctorRole';
import type { IAgent, PlayerAction } from '@/lib/engine/interfaces/IAgent';
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer';
import { MessageVisibility } from '@/lib/engine/interfaces/IMessage';
import type { AgentConfig } from '@/lib/interfaces/agent.types';

// Mock the translate function to return the key
vi.mock('@/lib/i18n/server', () => ({
  translate: vi.fn((key: string) => key),
}));

const createMockGameForDayPhase = () => {
  let currentPhaseStep = 'Start';
  let currentPlayerIndex = 0;
  let currentRound = 1;
  const humanVotes = new Map<PlayerId, PlayerId | null>();
  let phaseState: Record<string, unknown> = {};

  return {
    logMessage: vi.fn(),
    getPlayer: vi.fn(),
    getAlivePlayers: vi.fn().mockReturnValue([]),
    killPlayer: vi.fn(),
    recordVoteResultsInMemory: vi.fn(),
    requestPlayerAction: vi
      .fn()
      .mockResolvedValue({ type: 'noAction' } as PlayerAction),
    notifyRenderers: vi.fn(),
    get round() {
      return currentRound;
    },
    set round(val: number) {
      currentRound = val;
    },
    get language() {
      return 'en';
    },
    checkWinCondition: vi.fn().mockReturnValue(null),
    advanceToPhase: vi.fn(),
    getPhaseStep: vi.fn(() => currentPhaseStep),
    setPhaseStep: vi.fn((step: string) => {
      currentPhaseStep = step;
    }),
    getNextPlayerIndexToAction: vi.fn(() => currentPlayerIndex),
    setNextPlayerIndexToAction: vi.fn((index: number) => {
      currentPlayerIndex = index;
    }),
    setPhaseResults: vi.fn(),
    getVotes: vi.fn(() => humanVotes),
    recordHumanVote: vi.fn((voterId: PlayerId, targetId: PlayerId | null) => {
      humanVotes.set(voterId, targetId);
    }),
    clearPendingHumanAction: vi.fn(),
    getPendingHumanAction: vi.fn().mockReturnValue(null),
    getPhaseState: vi.fn(() => phaseState),
    setPhaseState: vi.fn((state: Record<string, unknown>) => {
      phaseState = { ...phaseState, ...state };
    }),
  };
};
type MockGameForDayPhase = ReturnType<typeof createMockGameForDayPhase>;

const createMockPlayerForDayPhase = (
  id: PlayerId,
  name: string,
  role: IRole,
  isHuman = false
): Player => {
  const agentMock = vi
    .fn()
    .mockResolvedValue({ type: 'noAction' } as PlayerAction);
  const agent: IAgent = {
    id: `agent-${id}`,
    agentName: isHuman ? 'HumanAgent' : 'MockAgent',
    persona: undefined,
    getAction: agentMock,
  };
  const agentConfig: AgentConfig = { agentType: isHuman ? 'Human' : 'Mock' };
  return new Player(id, name, role, agent, agentConfig, null);
};

describe('DayPhase', () => {
  let dayPhase: DayPhase;
  let mockGame: MockGameForDayPhase;
  let p1: Player;
  let p2: Player;
  let p3: Player;
  let p4: Player;

  beforeEach(() => {
    vi.clearAllMocks();
    dayPhase = new DayPhase();
    mockGame = createMockGameForDayPhase();

    p1 = createMockPlayerForDayPhase('p1', 'Player1', new VillagerRole());
    p2 = createMockPlayerForDayPhase('p2', 'Player2', new VillagerRole());
    p3 = createMockPlayerForDayPhase('p3', 'Player3', new MafiaRole());
    p4 = createMockPlayerForDayPhase('p4', 'Player4', new VillagerRole());

    mockGame.getAlivePlayers.mockReturnValue([p1, p2, p3]);
    mockGame.getPlayer.mockImplementation((id) => {
      if (id === 'p1') return p1;
      if (id === 'p2') return p2;
      if (id === 'p3') return p3;
      if (id === 'p4') return p4;
      return undefined;
    });
  });

  async function runPlayerLoop(
    game: MockGameForDayPhase,
    phase: DayPhase,
    players: Player[]
  ) {
    for (let i = 0; i <= players.length; i++) {
      game.setNextPlayerIndexToAction(i);
      await phase.runStep(game as unknown as Game);
    }
  }

  it('should run Introduction step for round 1', async () => {
    mockGame.round = 1;
    const alivePlayers = [p1, p2, p3];
    mockGame.getAlivePlayers.mockReturnValue(alivePlayers);

    // Set up the mock to return the appropriate actions based on the player
    mockGame.requestPlayerAction.mockImplementation((player) => {
      if (player.id === 'p1')
        return Promise.resolve({ type: 'message', content: 'P1 intro' });
      if (player.id === 'p2')
        return Promise.resolve({ type: 'message', content: 'P2 intro' });
      if (player.id === 'p3')
        return Promise.resolve({ type: 'message', content: 'P3 intro' });
      return Promise.resolve({ type: 'noAction' });
    });

    // Test Start step for round 1
    mockGame.setPhaseStep('Start');
    mockGame.setNextPlayerIndexToAction(0);
    await dayPhase.runStep(mockGame as unknown as Game); // This sets step to Introduction
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      null,
      'DayBegins',
      MessageVisibility.Public
    );
    expect(mockGame.getPhaseStep()).toBe('Introduction');

    // Now check for the introduction message when we actually start the Introduction step
    mockGame.setNextPlayerIndexToAction(0); // Reset to start Introduction
    await dayPhase.runStep(mockGame as unknown as Game);
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      null,
      'IntroductionPrompt',
      MessageVisibility.Public
    );
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      p1.id,
      'P1 intro',
      MessageVisibility.Public
    );

    // Player 2 Intro
    mockGame.setNextPlayerIndexToAction(1);
    await dayPhase.runStep(mockGame as unknown as Game);
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      p2.id,
      'P2 intro',
      MessageVisibility.Public
    );

    // Player 3 Intro
    mockGame.setNextPlayerIndexToAction(2);
    await dayPhase.runStep(mockGame as unknown as Game);
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      p3.id,
      'P3 intro',
      MessageVisibility.Public
    );

    // After all intros
    mockGame.setNextPlayerIndexToAction(alivePlayers.length); // Index is now past last player
    await dayPhase.runStep(mockGame as unknown as Game);
    expect(mockGame.getPhaseStep()).toBe('Discussion'); // After intros, should go to Discussion
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      null,
      'IntroductionComplete',
      MessageVisibility.Public
    );

    // The Discussion phase should automatically start after Introduction
    // (Note: DiscussionPhase message was removed to reduce moderator chattiness)
  });

  it('should run Discussion, Voting, Tally, and Finished steps for round > 1', async () => {
    mockGame.round = 2;
    const alivePlayers = [p1, p2, p3];
    mockGame.getAlivePlayers.mockReturnValue(alivePlayers);

    // Set up mocks based on the current phase step rather than call count
    mockGame.requestPlayerAction.mockImplementation((player) => {
      const currentStep = mockGame.getPhaseStep();
      if (currentStep === 'Discussion') {
        if (player.id === 'p1')
          return Promise.resolve({ type: 'message', content: 'P1 discussing' });
        if (player.id === 'p2')
          return Promise.resolve({ type: 'message', content: 'P2 discussing' });
        if (player.id === 'p3')
          return Promise.resolve({ type: 'message', content: 'P3 discussing' });
      }
      if (currentStep === 'Voting') {
        if (player.id === 'p1')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p2' });
        if (player.id === 'p2')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p1' });
        if (player.id === 'p3') return Promise.resolve({ type: 'noAction' });
      }
      return Promise.resolve({ type: 'noAction' });
    });

    // Start
    mockGame.setPhaseStep('Start');
    mockGame.setNextPlayerIndexToAction(0);
    await dayPhase.runStep(mockGame as unknown as Game);
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      null,
      'DayBegins',
      MessageVisibility.Public
    );
    expect(mockGame.getPhaseStep()).toBe('Discussion');

    // Run Discussion phase for all players
    mockGame.setNextPlayerIndexToAction(0);
    await dayPhase.runStep(mockGame as unknown as Game); // P1 (no Discussion message logged due to chattiness reduction)
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      'p1',
      'P1 discussing',
      MessageVisibility.Public
    );

    mockGame.setNextPlayerIndexToAction(1);
    await dayPhase.runStep(mockGame as unknown as Game); // P2
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      'p2',
      'P2 discussing',
      MessageVisibility.Public
    );

    mockGame.setNextPlayerIndexToAction(2);
    await dayPhase.runStep(mockGame as unknown as Game); // P3
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      'p3',
      'P3 discussing',
      MessageVisibility.Public
    );

    mockGame.setNextPlayerIndexToAction(3); // Past last player
    await dayPhase.runStep(mockGame as unknown as Game); // Transition to Voting
    expect(mockGame.getPhaseStep()).toBe('Voting');
    // Note: DiscussionComplete message was removed to reduce moderator chattiness

    // Run Voting phase
    mockGame.setNextPlayerIndexToAction(0);
    await dayPhase.runStep(mockGame as unknown as Game); // Voting message + P1 vote
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      null,
      'VotingPhase',
      MessageVisibility.Public
    );
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      'p1',
      'VotesFor',
      MessageVisibility.Public
    );

    mockGame.setNextPlayerIndexToAction(1);
    await dayPhase.runStep(mockGame as unknown as Game); // P2 vote
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      'p2',
      'VotesFor',
      MessageVisibility.Public
    );

    mockGame.setNextPlayerIndexToAction(2);
    await dayPhase.runStep(mockGame as unknown as Game); // P3 abstain
    // Note: ChoseNoActionVoting message was removed to reduce moderator chattiness

    mockGame.setNextPlayerIndexToAction(3);
    await dayPhase.runStep(mockGame as unknown as Game); // Transition to TallyVotes
    expect(mockGame.getPhaseStep()).toBe('TallyVotes');
    // Note: VotingComplete message was removed to reduce moderator chattiness

    // TallyVotes
    mockGame.setNextPlayerIndexToAction(0);
    await dayPhase.runStep(mockGame as unknown as Game);
    // Tie vote (p1 votes for p2, p2 votes for p1, p3 abstains), random execution with enhanced logic
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      null,
      'VoteTieRandomExecution',
      MessageVisibility.Public
    );
    expect(mockGame.killPlayer).toHaveBeenCalledTimes(1);
    expect(mockGame.getPhaseStep()).toBe('Finished');

    // Finished
    mockGame.setNextPlayerIndexToAction(0);
    await dayPhase.runStep(mockGame as unknown as Game);
    // Transition to the next phase is handled by the game loop now
    expect(mockGame.advanceToPhase).not.toHaveBeenCalled();
  });

  it('should execute player with majority votes', async () => {
    mockGame.round = 2;
    const alivePlayers = [p1, p2, p3]; // 3 alive players, majority is 2
    mockGame.getAlivePlayers.mockReturnValue(alivePlayers);

    // Set up a simpler mock that tracks the current step
    mockGame.requestPlayerAction.mockImplementation((player) => {
      const currentStep = mockGame.getPhaseStep();
      if (currentStep === 'Discussion') {
        return Promise.resolve({ type: 'noAction' });
      }
      if (currentStep === 'Voting') {
        if (player.id === 'p1')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p3' });
        if (player.id === 'p2')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p3' }); // p3 gets 2 votes (majority)
        if (player.id === 'p3')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p1' });
      }
      return Promise.resolve({ type: 'noAction' });
    });

    mockGame.setPhaseStep('Start');
    await dayPhase.runStep(mockGame as unknown as Game); // To Discussion
    expect(mockGame.getPhaseStep()).toBe('Discussion');

    // Complete Discussion phase
    for (let i = 0; i < alivePlayers.length; i++) {
      mockGame.setNextPlayerIndexToAction(i);
      await dayPhase.runStep(mockGame as unknown as Game);
    }
    mockGame.setNextPlayerIndexToAction(alivePlayers.length); // Past last player
    await dayPhase.runStep(mockGame as unknown as Game); // Transition to Voting
    expect(mockGame.getPhaseStep()).toBe('Voting');

    // Complete Voting phase
    for (let i = 0; i < alivePlayers.length; i++) {
      mockGame.setNextPlayerIndexToAction(i);
      await dayPhase.runStep(mockGame as unknown as Game);
    }
    mockGame.setNextPlayerIndexToAction(alivePlayers.length); // Past last player
    await dayPhase.runStep(mockGame as unknown as Game); // Transition to TallyVotes
    expect(mockGame.getPhaseStep()).toBe('TallyVotes');

    // Tally votes
    mockGame.setNextPlayerIndexToAction(0);
    await dayPhase.runStep(mockGame as unknown as Game); // Executes TallyVotes logic

    expect(mockGame.killPlayer).toHaveBeenCalledWith('p3', 'ExecutionReason');
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      null,
      'ExecutionDecision',
      MessageVisibility.Public
    );

    // Check that notifyRenderers was called with some votes map and the correct executed player
    expect(mockGame.notifyRenderers).toHaveBeenCalledWith(
      'renderVoteResults',
      expect.any(Map),
      'p3'
    );
    expect(mockGame.recordVoteResultsInMemory).toHaveBeenCalledWith(
      expect.any(Map)
    );
    expect(mockGame.setPhaseResults).toHaveBeenCalledWith({
      lastDayElimination: 'p3',
    });
    expect(mockGame.getPhaseStep()).toBe('Finished');
  });

  it('should handle tie vote (random execution from tied players)', async () => {
    mockGame.round = 2;
    const alivePlayers = [p1, p2, p3, p4]; // 4 players
    mockGame.getAlivePlayers.mockReturnValue(alivePlayers);

    // Set up mocks for discussion and voting phases
    let callCount = 0;
    mockGame.requestPlayerAction.mockImplementation((player) => {
      callCount++;
      // First round (Discussion) - all noAction
      if (callCount <= 4) {
        return Promise.resolve({ type: 'noAction' });
      }
      // Second round (Voting) - create a tie
      if (callCount > 4) {
        if (player.id === 'p1')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p3' });
        if (player.id === 'p2')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p4' });
        if (player.id === 'p3')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p1' });
        if (player.id === 'p4')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p2' });
      }
      return Promise.resolve({ type: 'noAction' });
    });

    mockGame.setPhaseStep('Start');
    await dayPhase.runStep(mockGame as unknown as Game); // To Discussion
    expect(mockGame.getPhaseStep()).toBe('Discussion');
    await runPlayerLoop(mockGame, dayPhase, alivePlayers); // Complete Discussion, to Voting
    expect(mockGame.getPhaseStep()).toBe('Voting');

    // Reset call count for voting
    callCount = 4;

    await runPlayerLoop(mockGame, dayPhase, alivePlayers); // Complete Voting, to TallyVotes
    expect(mockGame.getPhaseStep()).toBe('TallyVotes');

    mockGame.setNextPlayerIndexToAction(0);
    await dayPhase.runStep(mockGame as unknown as Game); // Executes TallyVotes logic

    // With enhanced decisive voting, tied votes now result in random execution
    expect(mockGame.killPlayer).toHaveBeenCalledTimes(1);
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      null,
      'VoteTieRandomExecution',
      MessageVisibility.Public
    );
    expect(mockGame.getPhaseStep()).toBe('Finished');
  });

  it('should execute player with 4 out of 6 votes (simple majority)', async () => {
    mockGame.round = 2;
    // Create 6 players to replicate the exact scenario from the game
    const p5 = createMockPlayerForDayPhase('p5', 'Player5', new SeerRole());
    const p6 = createMockPlayerForDayPhase('p6', 'Player6', new DoctorRole());
    const alivePlayers = [p1, p2, p3, p4, p5, p6]; // 6 alive players
    mockGame.getAlivePlayers.mockReturnValue(alivePlayers);

    // Update getPlayer mock to include new players
    mockGame.getPlayer.mockImplementation((id) => {
      if (id === 'p1') return p1;
      if (id === 'p2') return p2;
      if (id === 'p3') return p3;
      if (id === 'p4') return p4;
      if (id === 'p5') return p5;
      if (id === 'p6') return p6;
      return undefined;
    });

    // Set up voting: 4 players vote for p3 (Mafia), 2 players vote for others
    // This replicates the exact scenario: Seer, Doctor, 2 Villagers vote for Mafia
    mockGame.requestPlayerAction.mockImplementation((player) => {
      const currentStep = mockGame.getPhaseStep();
      if (currentStep === 'Discussion') {
        return Promise.resolve({ type: 'noAction' });
      }
      if (currentStep === 'Voting') {
        if (player.id === 'p1')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p3' }); // Villager votes for Mafia
        if (player.id === 'p2')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p4' }); // Villager votes for other Villager
        if (player.id === 'p3')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p4' }); // Mafia votes for Villager
        if (player.id === 'p4')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p3' }); // Villager votes for Mafia
        if (player.id === 'p5')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p3' }); // Seer votes for Mafia
        if (player.id === 'p6')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p3' }); // Doctor votes for Mafia
      }
      return Promise.resolve({ type: 'noAction' });
    });

    // Run through the complete day phase
    mockGame.setPhaseStep('Start');
    await dayPhase.runStep(mockGame as unknown as Game); // To Discussion
    expect(mockGame.getPhaseStep()).toBe('Discussion');

    // Complete Discussion phase
    for (let i = 0; i < alivePlayers.length; i++) {
      mockGame.setNextPlayerIndexToAction(i);
      await dayPhase.runStep(mockGame as unknown as Game);
    }
    mockGame.setNextPlayerIndexToAction(alivePlayers.length);
    await dayPhase.runStep(mockGame as unknown as Game); // Transition to Voting
    expect(mockGame.getPhaseStep()).toBe('Voting');

    // Complete Voting phase
    for (let i = 0; i < alivePlayers.length; i++) {
      mockGame.setNextPlayerIndexToAction(i);
      await dayPhase.runStep(mockGame as unknown as Game);
    }
    mockGame.setNextPlayerIndexToAction(alivePlayers.length);
    await dayPhase.runStep(mockGame as unknown as Game); // Transition to TallyVotes
    expect(mockGame.getPhaseStep()).toBe('TallyVotes');

    // Tally votes
    mockGame.setNextPlayerIndexToAction(0);
    await dayPhase.runStep(mockGame as unknown as Game);

    // Log what actually happened for debugging
    console.log('=== TEST DEBUG INFO ===');
    console.log('Alive players:', alivePlayers.length);
    console.log('Expected threshold (Math.ceil(6/2)):', Math.ceil(6 / 2));
    console.log(
      'Expected threshold (Math.floor(6/2)+1):',
      Math.floor(6 / 2) + 1
    );

    // With 4 out of 6 votes for p3, p3 should be executed
    expect(mockGame.killPlayer).toHaveBeenCalledWith('p3', 'ExecutionReason');
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      null,
      'ExecutionDecision',
      MessageVisibility.Public
    );

    expect(mockGame.notifyRenderers).toHaveBeenCalledWith(
      'renderVoteResults',
      expect.any(Map),
      'p3'
    );
    expect(mockGame.recordVoteResultsInMemory).toHaveBeenCalledWith(
      expect.any(Map)
    );
    expect(mockGame.setPhaseResults).toHaveBeenCalledWith({
      lastDayElimination: 'p3',
    });
    expect(mockGame.getPhaseStep()).toBe('Finished');
  });

  it('should execute player with plurality votes (3 out of 6 with highest count)', async () => {
    mockGame.round = 2;
    // Create 6 players
    const p5 = createMockPlayerForDayPhase('p5', 'Player5', new SeerRole());
    const p6 = createMockPlayerForDayPhase('p6', 'Player6', new DoctorRole());
    const alivePlayers = [p1, p2, p3, p4, p5, p6]; // 6 alive players
    mockGame.getAlivePlayers.mockReturnValue(alivePlayers);

    // Update getPlayer mock to include new players
    mockGame.getPlayer.mockImplementation((id) => {
      if (id === 'p1') return p1;
      if (id === 'p2') return p2;
      if (id === 'p3') return p3;
      if (id === 'p4') return p4;
      if (id === 'p5') return p5;
      if (id === 'p6') return p6;
      return undefined;
    });

    // Set up voting: 3 players vote for p3 (plurality), others get 1 vote each
    // p3: 3 votes, p4: 1 vote, p1: 1 vote, p2: 1 vote
    mockGame.requestPlayerAction.mockImplementation((player) => {
      const currentStep = mockGame.getPhaseStep();
      if (currentStep === 'Discussion') {
        return Promise.resolve({ type: 'noAction' });
      }
      if (currentStep === 'Voting') {
        if (player.id === 'p1')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p3' }); // Vote for p3
        if (player.id === 'p2')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p3' }); // Vote for p3
        if (player.id === 'p3')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p4' }); // Vote for p4
        if (player.id === 'p4')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p3' }); // Vote for p3 (3rd vote)
        if (player.id === 'p5')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p1' }); // Vote for p1
        if (player.id === 'p6')
          return Promise.resolve({ type: 'vote', targetPlayerId: 'p2' }); // Vote for p2
      }
      return Promise.resolve({ type: 'noAction' });
    });

    // Run through the complete day phase
    mockGame.setPhaseStep('Start');
    await dayPhase.runStep(mockGame as unknown as Game); // To Discussion
    expect(mockGame.getPhaseStep()).toBe('Discussion');

    // Complete Discussion phase
    for (let i = 0; i < alivePlayers.length; i++) {
      mockGame.setNextPlayerIndexToAction(i);
      await dayPhase.runStep(mockGame as unknown as Game);
    }
    mockGame.setNextPlayerIndexToAction(alivePlayers.length);
    await dayPhase.runStep(mockGame as unknown as Game); // Transition to Voting
    expect(mockGame.getPhaseStep()).toBe('Voting');

    // Complete Voting phase
    for (let i = 0; i < alivePlayers.length; i++) {
      mockGame.setNextPlayerIndexToAction(i);
      await dayPhase.runStep(mockGame as unknown as Game);
    }
    mockGame.setNextPlayerIndexToAction(alivePlayers.length);
    await dayPhase.runStep(mockGame as unknown as Game); // Transition to TallyVotes
    expect(mockGame.getPhaseStep()).toBe('TallyVotes');

    // Tally votes
    mockGame.setNextPlayerIndexToAction(0);
    await dayPhase.runStep(mockGame as unknown as Game);

    // With 3 votes for p3 (highest count), p3 should be executed under plurality rules
    expect(mockGame.killPlayer).toHaveBeenCalledWith('p3', 'ExecutionReason');
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      null,
      'ExecutionDecision',
      MessageVisibility.Public
    );
    expect(mockGame.getPhaseStep()).toBe('Finished');
  });

  it('should transition to NightPhase if no win condition', () => {
    mockGame.setPhaseStep('Finished'); // Manually set for this isolated test
    mockGame.checkWinCondition.mockReturnValue(null);
    const nextPhaseType = dayPhase.transition(mockGame as unknown as Game);
    expect(nextPhaseType).toBe('Night');
  });

  it('should transition to GameOverPhase if win condition met', () => {
    mockGame.setPhaseStep('Finished'); // Manually set
    mockGame.checkWinCondition.mockReturnValue('Mafia'); // Simulate Mafia win
    const nextPhaseType = dayPhase.transition(mockGame as unknown as Game);
    expect(nextPhaseType).toBe('GameOver');
  });
});
