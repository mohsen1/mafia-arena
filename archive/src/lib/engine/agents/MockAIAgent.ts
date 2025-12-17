import { IAgent, PlayerAction } from '../interfaces/IAgent';
import { VisibleGameState } from '../interfaces/GameState';
import { PlayerId } from '../interfaces/IPlayer';
import { delay, getRandomElement, shuffleArray } from '../core/utils';
import { RoleName } from '../interfaces/IRole';
import { Persona, DEFAULT_PERSONA } from '../interfaces/Persona';

/**
 * A lightweight AI agent used for tests that does not require network access.
 * It generates simple personas and produces deterministic-ish actions so that
 * Playwright tests can run without hitting real AI services.
 */
export class MockAIAgent implements IAgent {
  readonly id: PlayerId;
  readonly agentName = 'MockAIAgent';
  persona: Persona = DEFAULT_PERSONA;

  constructor(id: PlayerId) {
    this.id = id;
  }

  /**
   * Generate a very basic persona based on the theme description.
   * This is only meant for tests so it keeps things simple.
   */
  async generatePersona(
    themeDescription: string,
    language?: string,
    existingNames?: string[]
  ): Promise<void> {
    const names = [
      'Alex',
      'Charlie',
      'Sam',
      'Jamie',
      'Morgan',
      'Taylor',
      'Jordan',
      'Casey',
      'Blake',
      'Riley',
    ];
    const traits = ['Curious', 'Brave', 'Suspicious', 'Loyal', 'Clever'];
    const pickTraits = shuffleArray(traits.slice()).slice(0, 3);

    // Filter out existing names to avoid duplicates
    const availableNames = existingNames
      ? names.filter((name) => !existingNames.includes(name))
      : names;

    // If all names are taken, generate a unique name with a suffix
    let name: string;
    if (availableNames.length > 0) {
      name = getRandomElement(availableNames) || 'Alex';
    } else {
      // Fallback: use base name with ID suffix to ensure uniqueness
      const baseName = getRandomElement(names) || 'Alex';
      name = `${baseName}-${this.id.slice(-4)}`; // Use last 4 chars of ID for uniqueness
    }

    const langNote = language ? ` who speaks ${language}` : '';
    this.persona = {
      name,
      backstory: `A resident of ${themeDescription.toLowerCase()}${langNote}.`,
      personalityTraits: pickTraits,
    };
  }

  async getAction(
    gameState: VisibleGameState,
    allowedActions: PlayerAction['type'][] = []
  ): Promise<PlayerAction> {
    await delay(20 + Math.random() * 30); // small thinking delay
    const aliveOthers = Array.from(gameState.alivePlayerIds).filter(
      (id) => id !== this.id
    );

    if (gameState.phase === 'Day') {
      if (allowedActions.includes('message') && Math.random() < 0.5) {
        return {
          type: 'message',
          content: `${this.persona.name} suspects foul play.`,
        };
      }
      if (allowedActions.includes('vote') && aliveOthers.length > 0) {
        const target = getRandomElement(aliveOthers) || null;
        return { type: 'vote', targetPlayerId: target };
      }
      return { type: 'noAction' };
    }

    if (gameState.phase === 'Night') {
      switch (gameState.self.role) {
        case RoleName.Mafia:
          if (allowedActions.includes('mafiaKill') && aliveOthers.length > 0) {
            return {
              type: 'mafiaKill',
              targetPlayerId: getRandomElement(aliveOthers)!,
            };
          }
          break;
        case RoleName.Doctor:
          if (allowedActions.includes('doctorSave')) {
            return {
              type: 'doctorSave',
              targetPlayerId: getRandomElement(aliveOthers) || null,
            };
          }
          break;
        case RoleName.Seer:
          if (allowedActions.includes('seerInvestigate')) {
            return {
              type: 'seerInvestigate',
              targetPlayerId: getRandomElement(aliveOthers) || null,
            };
          }
          break;
      }
      return { type: 'noAction' };
    }

    return { type: 'noAction' };
  }
}
