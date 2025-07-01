import { AbstractGamePhase } from './AbstractGamePhase';
import type { Game } from '../core/Game';
import type { GamePhaseType } from '../interfaces/IGamePhase';
import { HumanAgent } from '../agents/HumanAgent';
import debug from 'debug';

const log = debug('mafia:phases:init');

export class InitializationPhase extends AbstractGamePhase {
  readonly type: GamePhaseType = 'Init';
  private initializationComplete = false;

  async runStep(game: Game): Promise<void> {
    if (!game.isRolesAssigned()) {
      game.markRolesAssigned();
    }

    if (!game.isPersonasGenerated()) {
      await game.ensurePersonasGenerated();
      game.markPersonasGenerated();
    }

    if (!game.isInitialMemoriesCreated()) {
      game.createInitialAgentMemories();
    }

    this.initializationComplete = true;
    game.setPhaseStep('SetupComplete');
  }

  async runPhase(game: Game): Promise<void> {
    const generatedNames: string[] = [];
    const maxRetries = 3;

    for (const player of game.getPlayers().values()) {
      const agent = player.agent;
      if (agent.generatePersona) {
        let attempts = 0;
        let success = false;

        while (attempts < maxRetries && !success) {
          attempts++;
          try {
            await agent.generatePersona(
              game.theme.description,
              game.language,
              generatedNames
            );

            if (
              agent.persona &&
              typeof agent.persona.name === 'string' &&
              agent.persona.name.trim() !== ''
            ) {
              const generatedName = agent.persona.name.trim();
              
              // Check for duplicate names
              if (generatedNames.includes(generatedName)) {
                log(
                  `Agent ${player.id} generated duplicate name "${generatedName}" (attempt ${attempts}/${maxRetries}). Retrying...`
                );
                if (attempts >= maxRetries) {
                  // Final attempt failed, use a unique fallback name
                  const fallbackName = `${player.name}-${player.id.slice(-4)}`;
                  log(
                    `Agent ${player.id} failed to generate unique name after ${maxRetries} attempts. Using fallback: ${fallbackName}`
                  );
                  player.setName(fallbackName);
                  generatedNames.push(fallbackName);
                  success = true;
                }
                // Continue to next attempt
              } else {
                // Success! Unique name generated
                player.setName(generatedName);
                generatedNames.push(generatedName);
                log(
                  `Agent ${player.id} generated unique persona: ${generatedName}`
                );
                success = true;
              }
            } else {
              log(
                `Agent ${player.id} failed to generate valid persona name (attempt ${attempts}/${maxRetries}), using default: ${player.name}`
              );
              if (attempts >= maxRetries) {
                generatedNames.push(player.name);
                success = true;
              }
            }
          } catch (error) {
            log(`Error generating persona for agent ${player.id} (attempt ${attempts}/${maxRetries}): %O`, error);
            if (attempts >= maxRetries) {
              log(
                `Agent ${player.id} continuing with default name due to generation error: ${player.name}`
              );
              generatedNames.push(player.name);
              success = true;
            }
          }
        }
      } else if (agent instanceof HumanAgent) {
        log(
          `Player ${player.id} is Human, using assigned name: ${player.name}`
        );
        generatedNames.push(player.name);
      } else {
        log(
          `Player ${player.id} (${agent.agentName}) using default identity: ${player.name}`
        );
        generatedNames.push(player.name);
      }
    }

    log(`Persona generation complete. Generated names: ${generatedNames.join(', ')}`);
  }

  transition(): GamePhaseType {
    if (this.initializationComplete) {
      return 'Day';
    }
    console.warn(
      '[InitPhase] Transition called before initialization complete. Remaining in Init.'
    );
    return 'Init';
  }
}
