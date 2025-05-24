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
        const personaPromises: Promise<void>[] = [];

        for (const player of game.getPlayers().values()) {
           const agent = player.agent;
           if (agent.generatePersona) {
               const promise = agent.generatePersona(game.theme.description, game.language)
                   .then(() => {
                       if (agent.persona && typeof agent.persona.name === 'string' && agent.persona.name.trim() !== '') {
                           player.setName(agent.persona.name);
                           log(`Agent ${player.id} generated persona: ${agent.persona.name}`);
                       } else {
                           log(`Agent ${player.id} failed to generate valid persona name, using default: ${player.name}`);
                       }
                   })
                   .catch(error => {
                       log(`Error generating persona for agent ${player.id}: %O`, error);
                       log(`Agent ${player.id} continuing with default name due to generation error: ${player.name}`);
                   });
               personaPromises.push(promise);
           } else if (agent instanceof HumanAgent) {
                 log(`Player ${player.id} is Human, using assigned name: ${player.name}`);
           } else {
                 log(`Player ${player.id} (${agent.agentName}) using default identity: ${player.name}`);
           }
        }

        try {
            await Promise.all(personaPromises);
        } catch (error) {
             log("Error during Promise.all for persona generation: %O", error);
        }
    }

    transition(): GamePhaseType {
        if (this.initializationComplete) {
            return 'Day';
        } 
        console.warn("[InitPhase] Transition called before initialization complete. Remaining in Init.");
        return 'Init';
    }
}
