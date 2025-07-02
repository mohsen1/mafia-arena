import { IAgent, PlayerAction } from '../interfaces/IAgent';
import { VisibleGameState } from '../interfaces/GameState';
import { PlayerId } from '../interfaces/IPlayer';
import { delay } from '../core/utils';
import { RoleName } from '../interfaces/IRole';
import { Persona, DEFAULT_PERSONA } from '../interfaces/Persona';

export class DummyAIAgent implements IAgent {
  public readonly id: PlayerId;
  public readonly agentName = 'DummyAIAgent';
  public persona: Persona = DEFAULT_PERSONA;

  constructor(id: PlayerId, persona?: Persona) {
    this.id = id;
    // Use provided persona or default. Note: Dummy agent won't generate.
    this.persona = persona || DEFAULT_PERSONA;
  }

  async getAction(
    gameState: VisibleGameState,
    allowedActions?: PlayerAction['type'][]
  ): Promise<PlayerAction> {
    await delay(50 + Math.random() * 100); // Simulate thinking time

    const agentIdForLog = `${this.id} (${this.persona.name})`; // Include persona name in log
    const aliveOthers = Array.from(gameState.alivePlayerIds).filter(
      (id) => id !== this.id
    );

    switch (gameState.phase) {
      case 'Day':
        const canVote = allowedActions?.includes('vote');
        const canMessage = allowedActions?.includes('message');

        // 🎯 FIX: During Introduction/Discussion phases, prioritize messaging over voting
        // This ensures AI agents actually participate in conversations
        if (canMessage && !canVote && Math.random() < 0.9) {
          // Introduction phase: High chance to introduce yourself
          const message = `[${gameState.language}] Hello everyone! I am ${gameState.self.name}. ${gameState.round === 1 ? "I'm worried about these dark rumors in our village." : `I've been thinking about yesterday's events.`}`;
          console.log(
            `[${agentIdForLog}] Deciding to SEND MESSAGE (Introduction): ${message}`
          );
          return { type: 'message', content: message };
        } else if (canMessage && canVote && Math.random() < 0.6) {
          // Discussion phase: Good chance to discuss before voting
          const message = `[${gameState.language}] I have some thoughts about who might be suspicious. ${gameState.self.name} is observing carefully.`;
          console.log(
            `[${agentIdForLog}] Deciding to SEND MESSAGE (Discussion): ${message}`
          );
          return { type: 'message', content: message };
        } else if (canVote && aliveOthers.length > 0 && Math.random() < 0.8) {
          // Voting phase or fallback: Vote for someone
          const targetId =
            aliveOthers[Math.floor(Math.random() * aliveOthers.length)];
          console.log(`[${agentIdForLog}] Deciding to VOTE for ${targetId}`);
          return { type: 'vote', targetPlayerId: targetId };
        } else {
          // Final fallback
          console.log(`[${agentIdForLog}] Deciding NO ACTION for day.`);
          return { type: 'noAction' };
        }
      case 'Night':
        const selfRole = gameState.self.role;
        // Filter potential targets: non-mafia and not self
        const potentialTargets = aliveOthers.filter(
          (id) => !gameState.mafiaPlayerIds?.has(id) && id !== this.id
        );
        // Select any alive player other than self (removed unused variable)
        // const anyAliveTarget = aliveOthers.length > 0
        //     ? aliveOthers[Math.floor(Math.random() * aliveOthers.length)]
        //     : null; // Handle case where no others are alive

        if (selfRole === RoleName.Mafia && potentialTargets.length > 0) {
          const targetId =
            potentialTargets[
              Math.floor(Math.random() * potentialTargets.length)
            ];
          console.log(
            `[${agentIdForLog} - MAFIA] Deciding to KILL ${targetId}`
          );
          return { type: 'mafiaKill', targetPlayerId: targetId };
        } else if (selfRole === RoleName.Doctor && aliveOthers.length > 0) {
          // Simple AI: 70% chance to save a random non-mafia player, 30% chance no save
          if (Math.random() < 0.7 && potentialTargets.length > 0) {
            const targetId =
              potentialTargets[
                Math.floor(Math.random() * potentialTargets.length)
              ];
            console.log(
              `[${agentIdForLog} - DOCTOR] Deciding to SAVE ${targetId}`
            );
            return { type: 'doctorSave', targetPlayerId: targetId };
          }
          console.log(`[${agentIdForLog} - DOCTOR] Deciding NO SAVE`);
          return { type: 'doctorSave', targetPlayerId: null };
        } else if (selfRole === RoleName.Seer && aliveOthers.length > 0) {
          // Simple AI: 70% chance to investigate a random player (not self), 30% no investigation
          const targetsToInvestigate = aliveOthers.filter(
            (id) => id !== this.id
          );
          if (Math.random() < 0.7 && targetsToInvestigate.length > 0) {
            const targetId =
              targetsToInvestigate[
                Math.floor(Math.random() * targetsToInvestigate.length)
              ];
            console.log(
              `[${agentIdForLog} - SEER] Deciding to INVESTIGATE ${targetId}`
            );
            return { type: 'seerInvestigate', targetPlayerId: targetId };
          }
          console.log(`[${agentIdForLog} - SEER] Deciding NO INVESTIGATION`);
          return { type: 'seerInvestigate', targetPlayerId: null };
        }
        // Villagers (or roles with no targets/decided no action) do nothing specific at night
        console.log(`[${agentIdForLog}] Deciding NO ACTION for night.`);
        return { type: 'noAction' };

      default:
        console.log(
          `[${agentIdForLog}] No action defined for phase ${gameState.phase}`
        );
        return { type: 'noAction' };
    }
  }
}
