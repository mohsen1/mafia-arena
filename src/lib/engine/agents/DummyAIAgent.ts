import type { IAgent, PlayerAction } from '../interfaces/IAgent';
import type { VisibleGameState } from '../interfaces/GameState';
import type { PlayerId } from '../interfaces/IPlayer';
import { RoleName } from '../interfaces/IRole';
import { Persona, DEFAULT_PERSONA } from '../interfaces/Persona';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class DummyAIAgent implements IAgent {
  readonly id: PlayerId;
  readonly agentName = 'DummyAI';
  persona: Persona;

  constructor(id: PlayerId) {
    this.id = id;
    this.persona = DEFAULT_PERSONA;
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

        // 🎯 IMPROVED: More strategic messaging based on game state
        if (canMessage) {
          // Always message during Introduction phase
          if (gameState.round === 1 && Math.random() < 0.95) {
            const introMessages = [
              `Hello everyone! I am ${this.persona.name}. ${this.persona.backstory} I hope we can work together to find the truth.`,
              `Greetings, I'm ${this.persona.name}. These are dark times for our ${gameState.themeName || 'village'}. We must be vigilant.`,
              `My name is ${this.persona.name}. I've lived here all my life, and I won't let evil destroy our community.`,
            ];
            const message =
              introMessages[Math.floor(Math.random() * introMessages.length)];
            console.log(
              `[${agentIdForLog}] Deciding to SEND MESSAGE (Introduction): ${message}`
            );
            return { type: 'message', content: message };
          }

          // Discussion phase: Share strategic thoughts
          if (!canVote && Math.random() < 0.85) {
            const discussionMessages = [
              `I've been observing carefully. Some players have been unusually quiet. What do you all think?`,
              `Based on the voting patterns, I have my suspicions. We need to act decisively.`,
              `The ${gameState.self.role === RoleName.Mafia ? 'town seems confused' : 'mafia are among us'}. Let's analyze who's been acting strangely.`,
              `I think we should focus on players who haven't contributed much to the discussion.`,
            ];
            const message =
              discussionMessages[
                Math.floor(Math.random() * discussionMessages.length)
              ];
            console.log(
              `[${agentIdForLog}] Deciding to SEND MESSAGE (Discussion): ${message}`
            );
            return { type: 'message', content: message };
          }
        }

        // 🎯 IMPROVED: Always vote when possible, with strategic targeting
        if (canVote && aliveOthers.length > 0) {
          // Mafia: Target non-mafia players strategically
          if (
            gameState.self.role === RoleName.Mafia &&
            gameState.mafiaPlayerIds
          ) {
            const nonMafiaPlayers = aliveOthers.filter(
              (id) => !gameState.mafiaPlayerIds?.has(id)
            );
            if (nonMafiaPlayers.length > 0) {
              const targetId =
                nonMafiaPlayers[
                  Math.floor(Math.random() * nonMafiaPlayers.length)
                ];
              console.log(
                `[${agentIdForLog} - MAFIA] Strategically voting for non-mafia: ${targetId}`
              );
              return { type: 'vote', targetPlayerId: targetId };
            }
          }

          // Town: Vote for someone (random for DummyAI, but always vote)
          const targetId =
            aliveOthers[Math.floor(Math.random() * aliveOthers.length)];
          console.log(`[${agentIdForLog}] Deciding to VOTE for ${targetId}`);
          return { type: 'vote', targetPlayerId: targetId };
        }

        // Only return noAction if truly no actions available
        console.log(
          `[${agentIdForLog}] No valid actions available for day phase.`
        );
        return { type: 'noAction' };

      case 'Night':
      case 'FirstNight':
        const selfRole = gameState.self.role;

        // 🎯 IMPROVED: More decisive night actions
        if (
          selfRole === RoleName.Mafia &&
          allowedActions?.includes('mafiaKill')
        ) {
          // Mafia: Always kill when possible
          const potentialVictims = aliveOthers.filter(
            (id) => !gameState.mafiaPlayerIds?.has(id)
          );
          if (potentialVictims.length > 0) {
            const targetId =
              potentialVictims[
                Math.floor(Math.random() * potentialVictims.length)
              ];
            console.log(
              `[${agentIdForLog} - MAFIA] Deciding to KILL ${targetId}`
            );
            return { type: 'mafiaKill', targetPlayerId: targetId };
          }
        } else if (
          selfRole === RoleName.Doctor &&
          allowedActions?.includes('doctorSave')
        ) {
          // Doctor: Always save someone (90% others, 10% self)
          if (aliveOthers.length > 0) {
            const saveOthers = Math.random() < 0.9;
            const targetId = saveOthers
              ? aliveOthers[Math.floor(Math.random() * aliveOthers.length)]
              : this.id;
            console.log(
              `[${agentIdForLog} - DOCTOR] Deciding to SAVE ${targetId}`
            );
            return { type: 'doctorSave', targetPlayerId: targetId };
          } else {
            // Save self if no others alive
            console.log(
              `[${agentIdForLog} - DOCTOR] Deciding to SAVE self (no others alive)`
            );
            return { type: 'doctorSave', targetPlayerId: this.id };
          }
        } else if (
          selfRole === RoleName.Seer &&
          allowedActions?.includes('seerInvestigate')
        ) {
          // Seer: Always investigate someone
          if (aliveOthers.length > 0) {
            const targetId =
              aliveOthers[Math.floor(Math.random() * aliveOthers.length)];
            console.log(
              `[${agentIdForLog} - SEER] Deciding to INVESTIGATE ${targetId}`
            );
            return { type: 'seerInvestigate', targetPlayerId: targetId };
          }
        }

        // Only return noAction if role has no night ability
        console.log(
          `[${agentIdForLog}] No night action available for ${selfRole}.`
        );
        return { type: 'noAction' };

      default:
        console.log(
          `[${agentIdForLog}] No action defined for phase ${gameState.phase}`
        );
        return { type: 'noAction' };
    }
  }
}
