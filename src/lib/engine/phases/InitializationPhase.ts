import { AbstractGamePhase } from './AbstractGamePhase';
import type { Game } from '../core/Game';
import type { GamePhaseType } from '../interfaces/IGamePhase';
import { DayPhase } from './DayPhase'; // Import next phase
import  { MessageVisibility } from '../interfaces/IMessage';
import { HumanAgent } from '../agents/HumanAgent'; // Import HumanAgent
import debug from 'debug';

const log = debug('mafia:phases:init');

export class InitializationPhase extends AbstractGamePhase {
    readonly type: GamePhaseType = 'Init';

    async runPhase(game: Game): Promise<void> {
        game.logMessage(null, "Initializing game...", MessageVisibility.Public, this.type);

        // --- Persona Generation --- //
        game.logMessage(null, "Generating player personas...", MessageVisibility.Public, this.type);
        const personaPromises: Promise<void>[] = [];

        for (const player of game.getPlayers().values()) {
           const agent = player.agent;
           if (agent.generatePersona) { // Check if the method exists
               const promise = agent.generatePersona(game.theme.description)
                   .then(() => {
                       // Persona generated and stored in agent.persona
                       // Update Player name IF persona generation was successful and name is valid
                       if (agent.persona && typeof agent.persona.name === 'string' && agent.persona.name.trim() !== '') {
                           player.setName(agent.persona.name); // Use the new setter method
                           log(`Agent ${player.id} generated persona: ${agent.persona.name}`);
                       } else {
                           // Handle fallback case where persona gen failed internally in agent
                           log(`Agent ${player.id} failed to generate valid persona name, using default: ${player.name}`);
                       }
                   })
                   .catch(error => {
                       // Log error from the generatePersona call itself (if it wasn't handled internally)
                       log(`Error generating persona for agent ${player.id}: %O`, error);
                       // Ensure fallback name is used (agent should handle internal fallback ideally)
                       // Player name remains unchanged in this case
                       log(`Agent ${player.id} continuing with default name due to generation error: ${player.name}`);
                   });
               personaPromises.push(promise);
           } else if (agent instanceof HumanAgent) {
                // Optionally prompt human for name? For now, just use the default.
                // player.setName("You"); // Example
                 log(`Player ${player.id} is Human, using assigned name: ${player.name}`);
           } else { // Dummy Agent, etc.
                 log(`Player ${player.id} (${agent.agentName}) using default identity: ${player.name}`);
           }
        }

        try {
            await Promise.all(personaPromises); // Wait for all LLM agents to finish generating
            game.logMessage(null, "Persona generation complete.", MessageVisibility.Public, this.type);
        } catch (error) {
             log("Error during Promise.all for persona generation: %O", error);
             // Even if Promise.all has an error, the individual catches should have handled fallbacks.
             game.logMessage(null, "Persona generation had errors, continuing with defaults where needed.", MessageVisibility.Public, this.type);
        }

        // --- Original Init Phase Logic (e.g., logging players) ---
        // Log final player list with potentially updated names
        game.logMessage(null, "\n## Players", MessageVisibility.Public);
        for (const player of game.getPlayers().values()) {
            game.logMessage(null, `- ${player.name} (${player.id})`, MessageVisibility.Public);
        }

        game.logMessage(null, "\n### Init Phase (Round 0)", MessageVisibility.Public);
        game.logMessage(null, "Roles assigned. Ready to begin.", MessageVisibility.Public, this.type);
    }

    transition(_game: Game): AbstractGamePhase {
        // After initialization, always go to the first Day phase
        return new DayPhase();
    }
}
