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
import type { IAgent, PlayerAction } from '@/lib/engine/interfaces/IAgent';
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer';
import { MessageVisibility } from '@/lib/engine/interfaces/IMessage';
import type { AgentConfig } from '@/lib/interfaces/agent.types';
import { PlayerStatus } from '@/lib/engine/interfaces/IPlayer';
import { RoleName } from '@/lib/engine/interfaces/IRole';

const createMockGameForNightPhase = () => {
  let currentPhaseStep = 'Start';
  let currentPlayerIndex = 0;
  let currentRound = 1;

  // Create a minimal mock game state for agent calls
  const mockGameState = {
    gameId: 'test-game',
    round: 1,
    phase: 'Night' as const,
    self: {
      id: 'test-player',
      name: 'Test',
      status: PlayerStatus.Alive,
      role: RoleName.Villager,
      isMafia: false,
      allegiance: 'Town' as const,
    },
    players: [],
    alivePlayerIds: new Set<string>(),
    language: 'en' as const,
    memory: {
      investigationResults: [],
      saveHistory: [],
      voteHistory: [],
      killHistory: [],
      messageHistory: [],
      aiConversationLogs: [],
    },
    themeName: 'Test Theme',
  };

  return {
    logMessage: vi.fn(),
    getPlayer: vi.fn(),
    getAlivePlayers: vi.fn().mockReturnValue([]),
    getAliveMafia: vi.fn().mockReturnValue([]),
    killPlayer: vi.fn(),
    recordKillInMemory: vi.fn(),
    recordSeerResultInMemory: vi.fn(),
    recordDoctorSaveInMemory: vi.fn(),
    notifyRenderers: vi.fn(),
    requestPlayerAction: vi
      .fn()
      .mockImplementation(
        async (player: Player, allowedActions: PlayerAction['type'][]) => {
          // Delegate to the player's agent instead of always returning noAction
          return await player.agent.getAction(mockGameState, allowedActions);
        }
      ),
    get round() {
      return currentRound;
    },
    set round(val: number) {
      currentRound = val;
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
    getPendingHumanAction: vi.fn().mockReturnValue(null),
  };
};
type MockGameForNightPhase = ReturnType<typeof createMockGameForNightPhase>;

const createMockPlayerForNightPhase = (
  id: PlayerId,
  name: string,
  role: IRole
): Player => {
  const agent: IAgent = {
    id: `agent-${id}`,
    agentName: 'MockAgent',
    persona: undefined,
    getAction: vi.fn().mockResolvedValue({ type: 'noAction' }),
  };
  const agentConfig: AgentConfig = { agentType: 'Mock' };
  return new Player(id, name, role, agent, agentConfig, null);
};

// Helper to run through a loop of player actions for a given step
async function runPlayerLoopNight(
  game: MockGameForNightPhase,
  phase: NightPhase,
  players: Player[]
) {
  for (let i = 0; i <= players.length; i++) {
    game.setNextPlayerIndexToAction(i);
    await phase.runStep(game as unknown as Game);
  }
}

describe('NightPhase', () => {
  let nightPhase: NightPhase;
  let mockGame: MockGameForNightPhase;
  let mafiaPlayer1: Player;
  let mafiaPlayer2: Player;
  let doctorPlayer: Player;
  let seerPlayer: Player;
  let villagerPlayer: Player;

  beforeEach(() => {
    vi.clearAllMocks();
    nightPhase = new NightPhase();
    mockGame = createMockGameForNightPhase();

    mafiaPlayer1 = createMockPlayerForNightPhase(
      'm1',
      'Mafia1',
      new MafiaRole()
    );
    mafiaPlayer2 = createMockPlayerForNightPhase(
      'm2',
      'Mafia2',
      new MafiaRole()
    );
    doctorPlayer = createMockPlayerForNightPhase(
      'doc',
      'Doctor',
      new DoctorRole()
    );
    seerPlayer = createMockPlayerForNightPhase('seer', 'Seer', new SeerRole());
    villagerPlayer = createMockPlayerForNightPhase(
      'v1',
      'Villager1',
      new VillagerRole()
    );

    mockGame.getPlayer.mockImplementation((id) => {
      if (id === 'm1') return mafiaPlayer1;
      if (id === 'm2') return mafiaPlayer2;
      if (id === 'doc') return doctorPlayer;
      if (id === 'seer') return seerPlayer;
      if (id === 'v1') return villagerPlayer;
      return undefined;
    });
  });

  it('should collect actions from all night-action roles (Mafia, Doctor, Seer)', async () => {
    const alivePlayers = [
      mafiaPlayer1,
      mafiaPlayer2,
      doctorPlayer,
      seerPlayer,
      villagerPlayer,
    ];
    const aliveMafia = [mafiaPlayer1, mafiaPlayer2];
    mockGame.getAlivePlayers.mockReturnValue(alivePlayers);
    mockGame.getAliveMafia.mockReturnValue(aliveMafia);

    // Start
    mockGame.setPhaseStep('Start');
    await nightPhase.runStep(mockGame as unknown as Game);
    expect(mockGame.getPhaseStep()).toBe('MafiaDiscussion');

    // Mafia Discussion
    (
      mafiaPlayer1.agent.getAction as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ type: 'message', content: 'M1 says hi' });
    (
      mafiaPlayer2.agent.getAction as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ type: 'message', content: 'M2 says hi' });
    await runPlayerLoopNight(mockGame, nightPhase, aliveMafia);
    expect(mockGame.getPhaseStep()).toBe('MafiaVoting');

    // Mafia Voting
    (
      mafiaPlayer1.agent.getAction as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ type: 'mafiaKill', targetPlayerId: 'v1' });
    (
      mafiaPlayer2.agent.getAction as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ type: 'mafiaKill', targetPlayerId: 'v1' });
    await runPlayerLoopNight(mockGame, nightPhase, aliveMafia);
    expect(mockGame.getPhaseStep()).toBe('ConsolidateMafiaVote');

    // Consolidate Mafia Vote
    mockGame.setNextPlayerIndexToAction(0);
    await nightPhase.runStep(mockGame as unknown as Game);
    expect(mockGame.getPhaseStep()).toBe('OtherActionsStart');

    // Other Actions Start
    mockGame.setNextPlayerIndexToAction(0);
    await nightPhase.runStep(mockGame as unknown as Game);
    expect(mockGame.getPhaseStep()).toBe('OtherActionsLoop');

    // Other Actions Loop (Doctor then Seer)
    (
      doctorPlayer.agent.getAction as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ type: 'doctorSave', targetPlayerId: 'doc' });
    (
      seerPlayer.agent.getAction as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ type: 'seerInvestigate', targetPlayerId: 'm1' });
    await runPlayerLoopNight(mockGame, nightPhase, [doctorPlayer, seerPlayer]);
    expect(mockGame.getPhaseStep()).toBe('ResolveNight');

    expect(mockGame.requestPlayerAction).toHaveBeenCalledWith(
      mafiaPlayer1,
      expect.arrayContaining(['message', 'noAction'])
    );
    expect(mockGame.requestPlayerAction).toHaveBeenCalledWith(
      mafiaPlayer2,
      expect.arrayContaining(['message', 'noAction'])
    );
    expect(mockGame.requestPlayerAction).toHaveBeenCalledWith(
      mafiaPlayer1,
      expect.arrayContaining(['mafiaKill', 'noAction'])
    );
    expect(mockGame.requestPlayerAction).toHaveBeenCalledWith(
      mafiaPlayer2,
      expect.arrayContaining(['mafiaKill', 'noAction'])
    );
    expect(mockGame.requestPlayerAction).toHaveBeenCalledWith(doctorPlayer, [
      'doctorSave',
      'noAction',
    ]);
    expect(mockGame.requestPlayerAction).toHaveBeenCalledWith(seerPlayer, [
      'seerInvestigate',
      'noAction',
    ]);
    expect(mockGame.requestPlayerAction).not.toHaveBeenCalledWith(
      villagerPlayer,
      expect.any(Array)
    );
  });

  it('should process Doctor save correctly (preventing kill)', async () => {
    const alivePlayers = [mafiaPlayer1, doctorPlayer, villagerPlayer];
    mockGame.getAlivePlayers.mockReturnValue(alivePlayers);
    mockGame.getAliveMafia.mockReturnValue([mafiaPlayer1]);

    (mafiaPlayer1.agent.getAction as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ type: 'message', content: 'Kill v1' })
      .mockResolvedValueOnce({ type: 'mafiaKill', targetPlayerId: 'v1' });
    (
      doctorPlayer.agent.getAction as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ type: 'doctorSave', targetPlayerId: 'v1' });

    mockGame.setPhaseStep('Start');
    await nightPhase.runStep(mockGame as unknown as Game);
    await runPlayerLoopNight(mockGame, nightPhase, [mafiaPlayer1]);
    expect(mockGame.getPhaseStep()).toBe('MafiaVoting');
    await runPlayerLoopNight(mockGame, nightPhase, [mafiaPlayer1]);
    expect(mockGame.getPhaseStep()).toBe('ConsolidateMafiaVote');
    mockGame.setNextPlayerIndexToAction(0);
    await nightPhase.runStep(mockGame as unknown as Game);
    expect(mockGame.getPhaseStep()).toBe('OtherActionsStart');
    mockGame.setNextPlayerIndexToAction(0);
    await nightPhase.runStep(mockGame as unknown as Game);
    expect(mockGame.getPhaseStep()).toBe('OtherActionsLoop');
    await runPlayerLoopNight(mockGame, nightPhase, [doctorPlayer]);
    expect(mockGame.getPhaseStep()).toBe('ResolveNight');

    mockGame.setNextPlayerIndexToAction(0);
    await nightPhase.runStep(mockGame as unknown as Game); // ResolveNight

    expect(mockGame.killPlayer).not.toHaveBeenCalled();
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      null,
      expect.stringContaining(
        `${villagerPlayer.name} was attacked, but the Doctor saved them!`
      ),
      MessageVisibility.Public
    );
    expect(mockGame.recordKillInMemory).toHaveBeenCalledWith(null);
    expect(mockGame.recordDoctorSaveInMemory).toHaveBeenCalledWith('doc', 'v1');
    expect(mockGame.notifyRenderers).toHaveBeenCalledWith(
      'renderNightResults',
      null
    );
  });

  it('should process Mafia kill correctly when no save occurs', async () => {
    const alivePlayers = [mafiaPlayer1, doctorPlayer, villagerPlayer];
    mockGame.getAlivePlayers.mockReturnValue(alivePlayers);
    mockGame.getAliveMafia.mockReturnValue([mafiaPlayer1]);

    (mafiaPlayer1.agent.getAction as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ type: 'message', content: 'Kill v1' })
      .mockResolvedValueOnce({ type: 'mafiaKill', targetPlayerId: 'v1' });
    (
      doctorPlayer.agent.getAction as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ type: 'doctorSave', targetPlayerId: 'doc' }); // Doctor saves self

    mockGame.setPhaseStep('Start');
    await nightPhase.runStep(mockGame as unknown as Game);
    await runPlayerLoopNight(mockGame, nightPhase, [mafiaPlayer1]); // MafiaDiscussion
    await runPlayerLoopNight(mockGame, nightPhase, [mafiaPlayer1]); // MafiaVoting
    mockGame.setNextPlayerIndexToAction(0);
    await nightPhase.runStep(mockGame as unknown as Game); // Consolidate
    mockGame.setNextPlayerIndexToAction(0);
    await nightPhase.runStep(mockGame as unknown as Game); // OtherActionsStart
    await runPlayerLoopNight(mockGame, nightPhase, [doctorPlayer]); // OtherActionsLoop
    mockGame.setNextPlayerIndexToAction(0);
    await nightPhase.runStep(mockGame as unknown as Game); // ResolveNight

    expect(mockGame.killPlayer).toHaveBeenCalledWith(
      'v1',
      'was killed during the night.'
    );
    expect(mockGame.recordKillInMemory).toHaveBeenCalledWith('v1');
    expect(mockGame.notifyRenderers).toHaveBeenCalledWith(
      'renderNightResults',
      'v1'
    );
  });

  it('should record Seer investigation results in memory and log privately to Seer', async () => {
    const alivePlayers = [mafiaPlayer1, seerPlayer, villagerPlayer];
    mockGame.getAlivePlayers.mockReturnValue(alivePlayers);
    mockGame.getAliveMafia.mockReturnValue([mafiaPlayer1]);

    (
      mafiaPlayer1.agent.getAction as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ type: 'noAction' }); // Mafia does nothing
    (
      seerPlayer.agent.getAction as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ type: 'seerInvestigate', targetPlayerId: 'm1' });

    mockGame.setPhaseStep('Start');
    await nightPhase.runStep(mockGame as unknown as Game);
    await runPlayerLoopNight(mockGame, nightPhase, [mafiaPlayer1]); // MafiaDiscussion
    await runPlayerLoopNight(mockGame, nightPhase, [mafiaPlayer1]); // MafiaVoting
    mockGame.setNextPlayerIndexToAction(0);
    await nightPhase.runStep(mockGame as unknown as Game); // Consolidate
    mockGame.setNextPlayerIndexToAction(0);
    await nightPhase.runStep(mockGame as unknown as Game); // OtherActionsStart
    await runPlayerLoopNight(mockGame, nightPhase, [seerPlayer]); // Seer acts
    mockGame.setNextPlayerIndexToAction(0);
    await nightPhase.runStep(mockGame as unknown as Game); // ResolveNight

    expect(mockGame.recordSeerResultInMemory).toHaveBeenCalledWith(
      'seer',
      'm1',
      'Mafia'
    );
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      'seer',
      `Your investigation revealed that ${mafiaPlayer1.name} is aligned with the Mafia.`,
      MessageVisibility.Private
    );
  });

  it('should handle Mafia message action during discussion', async () => {
    mockGame.getAlivePlayers.mockReturnValue([mafiaPlayer1, villagerPlayer]);
    mockGame.getAliveMafia.mockReturnValue([mafiaPlayer1]);
    (
      mafiaPlayer1.agent.getAction as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ type: 'message', content: 'targeting v1' });

    mockGame.setPhaseStep('Start');
    await nightPhase.runStep(mockGame as unknown as Game); // To MafiaDiscussion
    expect(mockGame.getPhaseStep()).toBe('MafiaDiscussion');
    mockGame.setNextPlayerIndexToAction(0);
    await nightPhase.runStep(mockGame as unknown as Game); // m1 discusses

    expect(mockGame.logMessage).toHaveBeenCalledWith(
      'm1',
      'targeting v1',
      MessageVisibility.Mafia
    );
  });

  it('should handle tied Mafia votes by NOT killing anyone', async () => {
    const alivePlayers = [
      mafiaPlayer1,
      mafiaPlayer2,
      villagerPlayer,
      doctorPlayer,
    ];
    mockGame.getAlivePlayers.mockReturnValue(alivePlayers);
    mockGame.getAliveMafia.mockReturnValue([mafiaPlayer1, mafiaPlayer2]);

    (mafiaPlayer1.agent.getAction as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ type: 'message', content: 'M1 discusses' })
      .mockResolvedValueOnce({ type: 'mafiaKill', targetPlayerId: 'v1' });
    (mafiaPlayer2.agent.getAction as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ type: 'message', content: 'M2 discusses' })
      .mockResolvedValueOnce({ type: 'mafiaKill', targetPlayerId: 'doc' }); // Different targets
    (
      doctorPlayer.agent.getAction as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ type: 'noAction' });

    mockGame.setPhaseStep('Start');
    await nightPhase.runStep(mockGame as unknown as Game);
    await runPlayerLoopNight(mockGame, nightPhase, [
      mafiaPlayer1,
      mafiaPlayer2,
    ]); // MafiaDiscussion
    expect(mockGame.getPhaseStep()).toBe('MafiaVoting');
    await runPlayerLoopNight(mockGame, nightPhase, [
      mafiaPlayer1,
      mafiaPlayer2,
    ]); // MafiaVoting
    expect(mockGame.getPhaseStep()).toBe('ConsolidateMafiaVote');
    mockGame.setNextPlayerIndexToAction(0);
    await nightPhase.runStep(mockGame as unknown as Game); // Consolidate
    expect(mockGame.getPhaseStep()).toBe('OtherActionsStart');
    mockGame.setNextPlayerIndexToAction(0);
    await nightPhase.runStep(mockGame as unknown as Game); // To OtherActionsLoop
    await runPlayerLoopNight(mockGame, nightPhase, [doctorPlayer]); // Doctor acts
    expect(mockGame.getPhaseStep()).toBe('ResolveNight');
    mockGame.setNextPlayerIndexToAction(0);
    await nightPhase.runStep(mockGame as unknown as Game); // ResolveNight

    expect(mockGame.killPlayer).not.toHaveBeenCalled();
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      null,
      expect.stringContaining('Mafia vote resulted in a tie. No kill tonight.'),
      MessageVisibility.Mafia
    );
    expect(mockGame.logMessage).toHaveBeenCalledWith(
      null,
      'The night passed without any casualties.',
      MessageVisibility.Public
    );
    expect(mockGame.recordKillInMemory).toHaveBeenCalledWith(null);
  });

  it('should transition to DayPhase if no win condition', () => {
    mockGame.setPhaseStep('Finished');
    mockGame.checkWinCondition.mockReturnValue(null);
    const nextPhaseType = nightPhase.transition(mockGame as unknown as Game);
    expect(nextPhaseType).toBe('Day');
  });

  it('should transition to GameOverPhase if win condition met', () => {
    mockGame.setPhaseStep('Finished');
    mockGame.checkWinCondition.mockReturnValue('Town');
    const nextPhaseType = nightPhase.transition(mockGame as unknown as Game);
    expect(nextPhaseType).toBe('GameOver');
  });
});
