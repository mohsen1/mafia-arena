// tests/phases/InitializationPhase.test.ts
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { InitializationPhase } from '@/lib/engine/phases/InitializationPhase';
import { DayPhase } from '@/lib/engine/phases/DayPhase';
import type { Game } from '@/lib/engine/core/Game';
// Removed Player import as we mock the instance, not the class
import { MessageVisibility } from '@/lib/engine/interfaces/IMessage';
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer';
import { DEFAULT_PERSONA } from '@/lib/engine/interfaces/Persona';
import { type IAgent, type PlayerAction } from '@/lib/engine/interfaces/IAgent';
import type { Persona } from '@/lib/engine/interfaces/Persona';
import { RoleName } from '@/lib/engine/interfaces/IRole';

// Mock Agent interfaces/classes for testing
interface MockableAgent extends IAgent {
    generatePersona?: Mock;
    getAction: Mock;
}

class MockLLMAgent implements MockableAgent {
    readonly id: PlayerId;
    readonly agentName = 'MockLLMAgent';
    isLLM = true as const; // Mark as LLM
    persona: Persona | undefined = undefined;
    generatePersona = vi.fn().mockImplementation(async (themeDesc: string) => {
        this.persona = { name: `Generated ${this.id}`, backstory: `Theme: ${themeDesc}`, personalityTraits: ['Generated'] };
    });
    getAction = vi.fn().mockResolvedValue({ type: 'noAction' });
    updateMemory = vi.fn().mockResolvedValue(undefined); // Add missing method if needed by IAgent
    constructor(id: PlayerId) { this.id = id; }
}

class MockNonLLMAgent implements MockableAgent {
    readonly id: PlayerId;
    readonly agentName = 'MockNonLLMAgent';
    isLLM = false as const; // Mark as non-LLM
    persona: Persona | undefined = undefined;
    generatePersona = undefined; // Non-LLM doesn't generate persona
    getAction = vi.fn().mockResolvedValue({ type: 'noAction' });
    updateMemory = vi.fn().mockResolvedValue(undefined); // Add missing method if needed by IAgent
    constructor(id: PlayerId) { this.id = id; }
}

// Mock Player interface
interface MockPlayer {
    id: PlayerId;
    name: string;
    agent: MockLLMAgent | MockNonLLMAgent;
    setName: Mock;
    getRole: () => RoleName;
    setPersona: (persona: Persona) => void;
}

// Mock Game methods used by the phase
const mockLogMessage = vi.fn();
const mockGetPlayers = vi.fn();

describe('InitializationPhase', () => {
    let initPhase: InitializationPhase;
    let mockAgent1: MockLLMAgent;
    let mockAgent2: MockNonLLMAgent;
    let mockAgent3: MockLLMAgent;
    // Mock plain player-like objects with the properties needed by the phase
    let mockPlayerObj1: { id: PlayerId, name: string, agent: MockLLMAgent, setName: Mock };
    let mockPlayerObj2: { id: PlayerId, name: string, agent: MockNonLLMAgent, setName: Mock };
    let mockPlayerObj3: { id: PlayerId, name: string, agent: MockLLMAgent, setName: Mock };

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
            setName: vi.fn((newName: string) => { mockPlayerObj1.name = newName; }) // Modify the mock object's name
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
        const playersMap = new Map<PlayerId, any>([
            ['p1', mockPlayerObj1],
            ['p2', mockPlayerObj2],
            ['p3', mockPlayerObj3],
        ]);
        mockGetPlayers.mockReturnValue(playersMap as any); // Return the map of mock objects

        // Construct the mock game instance
        mockGameInstance = {
            logMessage: mockLogMessage,
            getPlayers: mockGetPlayers,
            theme: { name: 'Test Theme', description: 'A theme for testing' },
        };
    });

    it('should have type "Init"', () => {
        expect(initPhase.type).toBe('Init');
    });

    it('should orchestrate persona generation and log appropriately', async () => {
        // Pass the correctly typed partial mock
        await initPhase.runPhase(mockGameInstance as Game);

        // 1. Check initial log messages
        expect(mockLogMessage).toHaveBeenCalledWith(null, "Initializing game...", MessageVisibility.Public, 'Init');
        expect(mockLogMessage).toHaveBeenCalledWith(null, "Generating player personas...", MessageVisibility.Public, 'Init');

        // 2. Verify generatePersona was called for LLM agents
        expect(mockAgent1.generatePersona).toHaveBeenCalledTimes(1);
        expect(mockAgent1.generatePersona).toHaveBeenCalledWith('A theme for testing');
        expect(mockAgent3.generatePersona).toHaveBeenCalledTimes(1);
        expect(mockAgent3.generatePersona).toHaveBeenCalledWith('A theme for testing');

        // 3. Verify player names were updated via setName for successful generation
        expect(mockPlayerObj1.setName).toHaveBeenCalledWith('Generated p1');
        expect(mockPlayerObj3.setName).toHaveBeenCalledWith('Generated p3');
        expect(mockPlayerObj2.setName).not.toHaveBeenCalled();

        // 4. Check final log messages
        expect(mockLogMessage).toHaveBeenCalledWith(null, "Persona generation complete.", MessageVisibility.Public, 'Init');
        expect(mockLogMessage).toHaveBeenCalledWith(null, "\n## Players", MessageVisibility.Public);
        // Check names in the final log (accessing the mock object's name property)
        expect(mockLogMessage).toHaveBeenCalledWith(null, expect.stringContaining(`${mockPlayerObj1.name} (p1)`), MessageVisibility.Public);
        expect(mockLogMessage).toHaveBeenCalledWith(null, expect.stringContaining(`${mockPlayerObj2.name} (p2)`), MessageVisibility.Public);
        expect(mockLogMessage).toHaveBeenCalledWith(null, expect.stringContaining(`${mockPlayerObj3.name} (p3)`), MessageVisibility.Public);

        expect(mockLogMessage).toHaveBeenCalledWith(null, "\n### Init Phase (Round 0)", MessageVisibility.Public);
        expect(mockLogMessage).toHaveBeenCalledWith(null, "Roles assigned. Ready to begin.", MessageVisibility.Public, 'Init');
    });

    it('should transition to DayPhase', () => {
        const nextPhase = initPhase.transition(mockGameInstance as Game);
        expect(nextPhase).toBeInstanceOf(DayPhase);
    });
}); 