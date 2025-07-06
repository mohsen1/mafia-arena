import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../core/Game';
import { HumanAgent } from '../../agents/HumanAgent';
import { MafiaRole } from '../../roles/MafiaRole';
import { VillagerRole } from '../../roles/VillagerRole';
import { DoctorRole } from '../../roles/DoctorRole';
import { SeerRole } from '../../roles/SeerRole';
import { DayPhase } from '../../phases/DayPhase';
import { NightPhase } from '../../phases/NightPhase';
import type { PlayerAction, IAgent } from '../../interfaces/IAgent';
import type { VisibleGameState } from '../../interfaces/GameState';
import type { PlayerId } from '../../interfaces/IPlayer';
import { DEFAULT_PERSONA } from '../../interfaces/Persona';

// Simple mock agent for testing
class MockAgent implements IAgent {
  readonly id: PlayerId;
  readonly agentName = 'Mock';
  persona = DEFAULT_PERSONA;

  constructor(id: PlayerId) {
    this.id = id;
  }

  async getAction(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _gameState: VisibleGameState,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _allowedActions?: PlayerAction['type'][]
  ): Promise<PlayerAction> {
    // Always return no action to avoid complications
    return { type: 'noAction' };
  }

  async generatePersona(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _themeDescription: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _language?: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _existingNames?: string[]
  ): Promise<void> {
    // Mock agent creates a unique persona based on the agent ID
    this.persona = {
      name: `Mock-${this.id}`,
      backstory: 'A test character for automated testing.',
      personalityTraits: ['Predictable', 'Logical', 'Test-oriented'],
      occupation: 'Test Subject',
      quirk: 'Always follows predefined patterns',
      secretOrFear: 'Fears being replaced by a real character',
      voiceId: 'ErXwobaYiN019PkySvjV', // Antoni - default voice
    };
  }
}

describe('Basic Game Flow E2E', () => {
  let game: Game;

  beforeEach(() => {
    // Create a game with 5 players: 1 human, 4 AI
    const playerSetups = [
      {
        name: 'Human Player',
        agent: new HumanAgent('human-1'),
        role: new VillagerRole(),
      },
      {
        name: 'AI Mafia 1',
        agent: new MockAgent('ai-1'),
        role: new MafiaRole(),
      },
      {
        name: 'AI Mafia 2',
        agent: new MockAgent('ai-2'),
        role: new MafiaRole(),
      },
      {
        name: 'AI Doctor',
        agent: new MockAgent('ai-3'),
        role: new DoctorRole(),
      },
      { name: 'AI Seer', agent: new MockAgent('ai-4'), role: new SeerRole() },
    ];

    game = Game.createNewGame(playerSetups, 'UK_VILLAGE_1900S', 'en');

    // Don't mock console for debugging
    // vi.spyOn(console, 'log').mockImplementation(() => {});
    // vi.spyOn(console, 'warn').mockImplementation(() => {});
    // vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should have correct initial state', () => {
    expect(game.getCurrentPhaseType()).toBe('Init');
    expect(game.round).toBe(0);
    expect(game.getAlivePlayers()).toHaveLength(5);

    const players = game.getAlivePlayers();
    expect(players.some((p) => p.agent instanceof HumanAgent)).toBe(true);
    expect(players.filter((p) => p.role.name === 'Mafia')).toHaveLength(2);
    expect(players.filter((p) => p.role.name === 'Villager')).toHaveLength(1);
    expect(players.filter((p) => p.role.name === 'Doctor')).toHaveLength(1);
    expect(players.filter((p) => p.role.name === 'Seer')).toHaveLength(1);
  });

  it('should transition from Init to Day phase', async () => {
    // Manually advance from Init phase
    const initPhase = game.getCurrentPhase();
    expect(initPhase.type).toBe('Init');

    await initPhase.runStep(game);

    const nextPhaseType = initPhase.transition(game);
    expect(nextPhaseType).toBe('Day');

    game.advanceToPhase(nextPhaseType);
    expect(game.getCurrentPhaseType()).toBe('Day');
    expect(game.round).toBe(1);
  });

  it('should handle Day phase without infinite loop', async () => {
    // Advance to Day phase first
    game.advanceToPhase('Day');
    expect(game.getCurrentPhaseType()).toBe('Day');

    const dayPhase = game.getCurrentPhase() as DayPhase;
    let stepCount = 0;
    const maxSteps = 25; // Increased to account for 5 players * 3 phases + transitions

    // Track phase steps to ensure progression
    const steps: string[] = [];

    while (game.getPhaseStep() !== 'Finished' && stepCount < maxSteps) {
      const currentStep = game.getPhaseStep();
      steps.push(currentStep);

      console.log(
        `Day Phase Step: ${currentStep}, Players: ${game.getAlivePlayers().length}, StepCount: ${stepCount}`
      );

      await dayPhase.runStep(game);
      stepCount++;

      // If we're waiting for human action, simulate it
      const pendingAction = game.getPendingHumanAction();
      if (pendingAction) {
        console.log(`Simulating human action for step: ${currentStep}`);
        // Simulate human choosing no action
        const humanPlayer = game.getPlayer(pendingAction.playerId);
        if (humanPlayer) {
          dayPhase.processAction(game, pendingAction.playerId, {
            type: 'noAction',
          });
          game.clearPendingHumanAction();
          game.setNextPlayerIndexToAction(
            game.getNextPlayerIndexToAction() + 1
          );
        }
      }
    }

    console.log(`Day phase completed in ${stepCount} steps:`, steps);
    expect(stepCount).toBeLessThan(maxSteps);
    expect(game.getPhaseStep()).toBe('Finished');
  });

  it('should handle Night phase without infinite loop', async () => {
    // Advance to Night phase
    game.advanceToPhase('Night');
    expect(game.getCurrentPhaseType()).toBe('Night');

    const nightPhase = game.getCurrentPhase() as NightPhase;
    let stepCount = 0;
    const maxSteps = 30; // Night phase has more steps

    const steps: string[] = [];

    while (game.getPhaseStep() !== 'Finished' && stepCount < maxSteps) {
      const currentStep = game.getPhaseStep();
      steps.push(currentStep);

      console.log(
        `Night Phase Step: ${currentStep}, Players: ${game.getAlivePlayers().length}`
      );

      await nightPhase.runStep(game);
      stepCount++;

      // If we're waiting for human action, simulate it
      const pendingAction = game.getPendingHumanAction();
      if (pendingAction) {
        console.log(`Simulating human action for step: ${currentStep}`);
        const humanPlayer = game.getPlayer(pendingAction.playerId);
        if (humanPlayer) {
          // Simulate appropriate action based on allowed actions
          let action: PlayerAction = { type: 'noAction' };
          if (pendingAction.allowedActions.includes('mafiaKill')) {
            // Don't actually kill anyone in test
            action = { type: 'noAction' };
          } else if (pendingAction.allowedActions.includes('doctorSave')) {
            action = { type: 'noAction' };
          } else if (pendingAction.allowedActions.includes('seerInvestigate')) {
            action = { type: 'noAction' };
          }

          nightPhase.processAction(game, pendingAction.playerId, action);
          game.clearPendingHumanAction();
          game.setNextPlayerIndexToAction(
            game.getNextPlayerIndexToAction() + 1
          );
        }
      }
    }

    console.log(`Night phase completed in ${stepCount} steps:`, steps);
    expect(stepCount).toBeLessThan(maxSteps);
    expect(game.getPhaseStep()).toBe('Finished');
  });

  it('should complete a full Day-Night cycle', async () => {
    // Start from Day phase
    game.advanceToPhase('Day');

    // Complete Day phase
    await completePhaseWithSimulation(game, 'Day', 25);
    expect(game.getPhaseStep()).toBe('Finished');

    // Transition to Night
    const dayPhase = game.getCurrentPhase();
    const nextPhase = dayPhase.transition(game);

    // The game might end during Day phase due to random execution
    // when no votes are cast (all agents return noAction)
    if (nextPhase === 'GameOver') {
      // This is expected behavior with the decisive voting logic
      expect(game.checkWinCondition()).not.toBeNull();
      console.log('Game ended during Day phase due to win condition');
      return; // Test passes - game ended normally
    }

    expect(nextPhase).toBe('Night');

    game.advanceToPhase(nextPhase);
    expect(game.getCurrentPhaseType()).toBe('Night');

    // Complete Night phase
    await completePhaseWithSimulation(game, 'Night', 30);
    expect(game.getPhaseStep()).toBe('Finished');

    // Should transition back to Day
    const nightPhase = game.getCurrentPhase();
    const nextPhaseAfterNight = nightPhase.transition(game);

    // Game might also end after Night phase
    if (nextPhaseAfterNight === 'GameOver') {
      expect(game.checkWinCondition()).not.toBeNull();
      console.log('Game ended during Night phase due to win condition');
      return; // Test passes - game ended normally
    }

    expect(nextPhaseAfterNight).toBe('Day');
  });

  it('should detect win conditions correctly', () => {
    // Test initial state - no win condition
    expect(game.checkWinCondition()).toBeNull();

    // Kill all mafia - Town should win
    const mafiaPlayers = game
      .getAlivePlayers()
      .filter((p) => p.role.name === 'Mafia');
    for (const player of mafiaPlayers) {
      game.killPlayer(player.id, 'test elimination');
    }

    expect(game.checkWinCondition()).toBe('Town');

    // Reset and test Mafia win condition
    const newGame = Game.createNewGame(
      [
        {
          name: 'Human Player',
          agent: new HumanAgent('human-2'),
          role: new VillagerRole(),
        },
        {
          name: 'AI Mafia 1',
          agent: new MockAgent('ai-5'),
          role: new MafiaRole(),
        },
        {
          name: 'AI Mafia 2',
          agent: new MockAgent('ai-6'),
          role: new MafiaRole(),
        },
      ],
      'UK_VILLAGE_1900S',
      'en'
    );

    // Kill town player - Mafia should win (2 mafia vs 0 town)
    const townPlayers = newGame
      .getAlivePlayers()
      .filter((p) => p.role.allegiance === 'Town');
    for (const player of townPlayers) {
      newGame.killPlayer(player.id, 'test elimination');
    }

    expect(newGame.checkWinCondition()).toBe('Mafia');
  });

  it('should not get stuck in infinite loop with empty player actions', async () => {
    // This test specifically checks for the infinite loop issue using the actual game loop
    game.advanceToPhase('Day');

    // Start the game loop - it should detect infinite loops and terminate gracefully
    await game.runGameLoop();

    // The game should have ended due to infinite loop detection or win condition
    const finalPhase = game.getCurrentPhaseType();
    const pendingAction = game.getPendingHumanAction();
    console.log(`Game ended in phase: ${finalPhase}`);
    console.log(
      `Pending human action: ${pendingAction ? `${pendingAction.playerId} - ${pendingAction.allowedActions.join(', ')}` : 'None'}`
    );

    // The game should either be in GameOver phase or have paused for human action
    expect(['GameOver', 'Day', 'Night'].includes(finalPhase)).toBe(true);

    // If the game ended without a pending human action, it should be in GameOver (infinite loop protection)
    if (!pendingAction) {
      expect(finalPhase).toBe('GameOver');
      console.log(
        'Game ended due to infinite loop protection - this is the expected fix'
      );
    } else {
      console.log(
        'Game paused for human action - this is also expected behavior'
      );
    }
  });
});

// Helper function to complete a phase with human action simulation
async function completePhaseWithSimulation(
  game: Game,
  phaseType: string,
  maxSteps: number
): Promise<void> {
  const phase = game.getCurrentPhase();
  let stepCount = 0;

  while (game.getPhaseStep() !== 'Finished' && stepCount < maxSteps) {
    const currentStep = game.getPhaseStep();
    console.log(
      `${phaseType} Phase Step: ${currentStep}, StepCount: ${stepCount}`
    );

    await phase.runStep(game);
    stepCount++;

    // Simulate human actions
    const pendingAction = game.getPendingHumanAction();
    if (pendingAction) {
      if (phase instanceof DayPhase) {
        phase.processAction(game, pendingAction.playerId, { type: 'noAction' });
        game.clearPendingHumanAction();
        game.setNextPlayerIndexToAction(game.getNextPlayerIndexToAction() + 1);
      } else if (phase instanceof NightPhase) {
        phase.processAction(game, pendingAction.playerId, { type: 'noAction' });
        game.clearPendingHumanAction();
        game.setNextPlayerIndexToAction(game.getNextPlayerIndexToAction() + 1);
      }
    }
  }

  if (stepCount >= maxSteps) {
    throw new Error(
      `Phase ${phaseType} did not complete within ${maxSteps} steps (reached ${stepCount})`
    );
  }
}
