// tests/phases/InitializationPhase.test.ts
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { InitializationPhase } from '@/lib/engine/phases/InitializationPhase';
import { DayPhase } from '@/lib/engine/phases/DayPhase';
import type { Game } from '@/lib/engine/core/Game';
import { MessageVisibility } from '@/lib/engine/interfaces/IMessage';
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer';
import type { IAgent, PlayerAction } from '@/lib/engine/interfaces/IAgent';
import type { Persona } from '@/lib/engine/interfaces/Persona';

// Mock Agent interfaces/classes for testing
class MockLLMAgent implements IAgent {
    id: PlayerId;
    name: string;
    generatePersona: Mock;
    getAction: Mock;
    persona: Persona;
    readonly agentName = "MockLLMAgent";

    constructor(id: PlayerId) { 
        this.id = id;
        this.name = `Agent ${id}`;
        this.persona = { name: `Default ${id}`, backstory: '', personalityTraits: [] };
        this.generatePersona = vi.fn().mockImplementation(async () => {
            const generatedPersona: Persona = { 
                name: `Generated ${id}`,
                backstory: `Backstory for ${id}`,
                personalityTraits: [`Trait ${id}`]
            }; 
            this.persona = generatedPersona;
            return generatedPersona;
        });
        this.getAction = vi.fn();
    }
}

class MockNonLLMAgent implements IAgent {
    id: PlayerId;
    name: string;
    getAction: Mock;
    persona: Persona;
    readonly agentName = "MockNonLLMAgent";

    constructor(id: PlayerId) {
        this.id = id;
        this.name = `Human ${id}`;
        this.persona = { name: `Default ${id}`, backstory: '', personalityTraits: [] };
        this.getAction = vi.fn();
    }
}

// Define a type for the mock player objects
type MockPlayer = {
    id: PlayerId;
    name: string;
    agent: IAgent;
    setName: Mock<(newName: string) => void>;
};

// Mock Game methods used by the phase
const mockLogMessage = vi.fn();
const mockGenRnd = vi.fn();
const mockGetPlayer = vi.fn();
const mockGetPlayers = vi.fn();

describe('InitializationPhase', () => {
    let initPhase: InitializationPhase;
    let mockAgent1: MockLLMAgent;
    let mockAgent2: MockNonLLMAgent;
    let mockAgent3: MockLLMAgent;
    let mockPlayerObj1: MockPlayer;
    let mockPlayerObj2: MockPlayer;
    let mockPlayerObj3: MockPlayer;

    // Mock Game instance with necessary properties/methods
    let mockGameInstance: Partial<Game>;

    beforeEach(() => {
        vi.clearAllMocks();
        initPhase = new InitializationPhase();

        // Create mock agents
        mockAgent1 = new MockLLMAgent('p1');
        mockAgent2 = new MockNonLLMAgent('p2');
        mockAgent3 = new MockLLMAgent('p3');

        // Create mock player objects
        mockPlayerObj1 = {
            id: 'p1',
            name: 'Player 1',
            agent: mockAgent1,
            setName: vi.fn((newName: string) => { mockPlayerObj1.name = newName; })
        };
        mockPlayerObj2 = {
            id: 'p2',
            name: 'Player 2',
            agent: mockAgent2,
            setName: vi.fn((newName: string) => { mockPlayerObj2.name = newName; })
        };
        mockPlayerObj3 = {
            id: 'p3',
            name: 'Player 3',
            agent: mockAgent3,
            setName: vi.fn((newName: string) => { mockPlayerObj3.name = newName; })
        };

        // Setup mockGame behavior
        const playersMap = new Map<PlayerId, MockPlayer>([
            ['p1', mockPlayerObj1],
            ['p2', mockPlayerObj2],
            ['p3', mockPlayerObj3],
        ]);
        mockGetPlayers.mockReturnValue(playersMap);

        // Construct the mock game instance
        mockGameInstance = {
            logMessage: mockLogMessage,
            getPlayers: mockGetPlayers,
            theme: { name: 'Test Theme', description: 'A theme for testing' },
            // Add mocks for methods called by runStep
            isRolesAssigned: vi.fn().mockReturnValue(false),
            markRolesAssigned: vi.fn(),
            isPersonasGenerated: vi.fn().mockReturnValue(false),
            ensurePersonasGenerated: vi.fn().mockResolvedValue(undefined), // ensurePersonasGenerated is async
            markPersonasGenerated: vi.fn(),
            isInitialMemoriesCreated: vi.fn().mockReturnValue(false),
            createInitialAgentMemories: vi.fn(),
            logEvent: vi.fn(),
            setPhaseStep: vi.fn(),
        };
    });

    it('should have type "Init"', () => {
        expect(initPhase.type).toBe('Init');
    });

    it('should orchestrate persona generation and log appropriately', async () => {
        await initPhase.runPhase(mockGameInstance as Game);

        expect(mockLogMessage).toHaveBeenCalledWith(null, "Initializing game...", MessageVisibility.Public, 'Init');
        expect(mockLogMessage).toHaveBeenCalledWith(null, "Generating player personas...", MessageVisibility.Public, 'Init');

        expect(mockAgent1.generatePersona).toHaveBeenCalledTimes(1);
        expect(mockAgent1.generatePersona).toHaveBeenCalledWith('A theme for testing');
        expect(mockAgent3.generatePersona).toHaveBeenCalledTimes(1);
        expect(mockAgent3.generatePersona).toHaveBeenCalledWith('A theme for testing');

        expect(mockPlayerObj1.setName).toHaveBeenCalledWith('Generated p1');
        expect(mockPlayerObj3.setName).toHaveBeenCalledWith('Generated p3');
        expect(mockPlayerObj2.setName).not.toHaveBeenCalled();

        expect(mockLogMessage).toHaveBeenCalledWith(null, "Persona generation complete.", MessageVisibility.Public, 'Init');
        expect(mockLogMessage).toHaveBeenCalledWith(null, "\n## Players", MessageVisibility.Public);
        expect(mockLogMessage).toHaveBeenCalledWith(null, expect.stringContaining(`${mockPlayerObj1.name} (p1)`), MessageVisibility.Public);
        expect(mockLogMessage).toHaveBeenCalledWith(null, expect.stringContaining(`${mockPlayerObj2.name} (p2)`), MessageVisibility.Public);
        expect(mockLogMessage).toHaveBeenCalledWith(null, expect.stringContaining(`${mockPlayerObj3.name} (p3)`), MessageVisibility.Public);

        expect(mockLogMessage).toHaveBeenCalledWith(null, "\n### Init Phase (Round 0)", MessageVisibility.Public);
        expect(mockLogMessage).toHaveBeenCalledWith(null, "Roles assigned. Ready to begin.", MessageVisibility.Public, 'Init');
    });

    it('should transition to DayPhase after runStep completes', async () => {
        // Ensure runStep completes and sets initializationComplete to true
        await initPhase.runStep(mockGameInstance as Game);
        
        const nextPhaseType = initPhase.transition(mockGameInstance as Game);
        expect(nextPhaseType).toBe('Day'); // Check for phase type string 'Day'
    });
}); 