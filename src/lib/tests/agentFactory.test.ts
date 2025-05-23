// src/lib/tests/agentFactory.test.ts
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createAgentInstance } from '@/lib/agentFactory';
import type { AgentConfig } from '@/lib/interfaces/persistence.types';
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer';
import { OpenAIAgent } from '@/lib/engine/agents/OpenAIAgent';
import { HumanAgent } from '@/lib/engine/agents/HumanAgent';
// Import DummyAgent correctly based on its actual location
import { DummyAIAgent } from '@/lib/engine/agents/DummyAIAgent'; // Assuming this is the correct path

// Mock agent constructors to verify they are called
vi.mock('@/lib/engine/agents/OpenAIAgent');
vi.mock('@/lib/engine/agents/HumanAgent');
vi.mock('@/lib/engine/agents/DummyAIAgent'); // Mock the actual DummyAgent path
// Mock other agents like ClaudeAgent, GeminiAgent if/when implemented and tested

// Mock environment variables
const originalEnv = process.env;

describe('createAgentInstance', () => {
    const testPlayerId: PlayerId = 'test-p1';

    beforeEach(() => {
        vi.resetModules(); // Important to reset module cache for env var changes
        process.env = { ...originalEnv }; // Reset env vars
        vi.clearAllMocks();
    });

    afterAll(() => {
        process.env = originalEnv; // Restore original env vars
    });

    it('should create an OpenAIAgent for agentType "OpenAI"', () => {
        process.env.OPENAI_API_KEY = 'test-openai-key';
        const config: AgentConfig = { agentType: 'OpenAI', modelName: 'gpt-4o-mini', providerValue: 'openai' };
        createAgentInstance(config, testPlayerId);
        expect(OpenAIAgent).toHaveBeenCalledTimes(1);
        expect(OpenAIAgent).toHaveBeenCalledWith(testPlayerId, 'gpt-4o-mini', 'https://api.openai.com/v1', 'test-openai-key');
    });

    it('should create an OpenAIAgent for agentType "Groq"', () => {
        process.env.GROQ_API_KEY = 'test-groq-key';
        const config: AgentConfig = { agentType: 'Groq', modelName: 'llama3-8b-8192', providerValue: 'groq' };
        createAgentInstance(config, testPlayerId);
        expect(OpenAIAgent).toHaveBeenCalledTimes(1);
        expect(OpenAIAgent).toHaveBeenCalledWith(testPlayerId, 'llama3-8b-8192', 'https://api.groq.com/openai/v1', 'test-groq-key');
    });

     it('should create an OpenAIAgent for agentType "Ollama" without API key', () => {
         // No API key needed for default local Ollama
         const config: AgentConfig = { agentType: 'Ollama', modelName: 'llama3:latest', providerValue: 'ollama_local' };
         createAgentInstance(config, testPlayerId);
         expect(OpenAIAgent).toHaveBeenCalledTimes(1);
         expect(OpenAIAgent).toHaveBeenCalledWith(testPlayerId, 'llama3:latest', 'http://localhost:11434/v1', undefined);
     });

    it('should create a HumanAgent for agentType "Human"', () => {
        const config: AgentConfig = { agentType: 'Human' };
        createAgentInstance(config, testPlayerId);
        expect(HumanAgent).toHaveBeenCalledTimes(1);
        expect(HumanAgent).toHaveBeenCalledWith(testPlayerId);
    });

    it('should create a DummyAIAgent for agentType "Dummy"', () => {
        const config: AgentConfig = { agentType: 'Dummy' };
        createAgentInstance(config, testPlayerId);
        expect(DummyAIAgent).toHaveBeenCalledTimes(1);
        expect(DummyAIAgent).toHaveBeenCalledWith(testPlayerId);
    });

    it('should create a DummyAIAgent and warn for unknown agentType', () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const config: AgentConfig = { agentType: 'UnknownFutureAgent' as any }; // Cast to any to allow unknown type for test
        createAgentInstance(config, testPlayerId);
        expect(DummyAIAgent).toHaveBeenCalledTimes(1);
        expect(DummyAIAgent).toHaveBeenCalledWith(testPlayerId);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown agentType "UnknownFutureAgent"'));
        consoleSpy.mockRestore();
    });

    // Add tests for ClaudeAgent, GeminiAgent etc. when they are fully implemented
    // it('should create a ClaudeAgent for agentType "Claude"', () => { ... });
});