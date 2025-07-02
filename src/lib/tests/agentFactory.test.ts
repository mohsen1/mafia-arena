// src/lib/tests/agentFactory.test.ts
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createAgentInstance } from '@/lib/agentFactory';
import type { AgentConfig } from '@/lib/interfaces/persistence.types';
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer';
import type { CustomProviderConfig } from '@/lib/utils/providerUtils';
import { OpenAIAgent } from '@/lib/engine/agents/OpenAIAgent';
import { HumanAgent } from '@/lib/engine/agents/HumanAgent';
// Import DummyAgent correctly based on its actual location
import { DummyAIAgent } from '@/lib/engine/agents/DummyAIAgent'; // Assuming this is the correct path

// Mock agent constructors to verify they are called
vi.mock('@/lib/engine/agents/OpenAIAgent');
vi.mock('@/lib/engine/agents/HumanAgent');
vi.mock('@/lib/engine/agents/DummyAIAgent'); // Mock the actual DummyAgent path
vi.mock('@/lib/engine/agents/MockAIAgent');
vi.mock('@/lib/engine/agents/ClaudeAgent');
vi.mock('@/lib/engine/agents/GeminiAgent');
// Mock other agents like ClaudeAgent, GeminiAgent if/when implemented and tested

// Mock the getDecryptedApiKey function
vi.mock('@/app/actions/api-keys.actions', () => ({
  getDecryptedApiKey: vi.fn().mockResolvedValue(null)
}))

// Mock the models import
vi.mock('@/lib/models', () => ({
  openAIProviders: [
    {
      value: 'openai',
      endpoint: 'https://api.openai.com/v1',
      apiKeyEnvVar: 'OPENAI_API_KEY'
    },
    {
      value: 'groq',
      endpoint: 'https://api.groq.com/openai/v1',
      apiKeyEnvVar: 'GROQ_API_KEY'
    },
    {
      value: 'ollama_local',
      endpoint: 'http://localhost:11434/v1',
      apiKeyEnvVar: 'OLLAMA_API_KEY'
    }
  ]
}))

// Mock environment variables
const originalEnv = process.env;

describe('createAgentInstance', () => {
  const testPlayerId: PlayerId = 'test-p1';

  beforeEach(() => {
    vi.resetModules(); // Important to reset module cache for env var changes
    process.env = { ...originalEnv }; // Reset env vars
    // Make sure USE_MOCK_AI is not set
    delete process.env.USE_MOCK_AI;
    vi.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv; // Restore original env vars
  });

  it('should create an OpenAIAgent for agentType "OpenAI"', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    const config: AgentConfig = {
      agentType: 'OpenAI',
      modelName: 'gpt-4o-mini',
      providerValue: 'openai',
    };
    await createAgentInstance(config, testPlayerId);
    expect(OpenAIAgent).toHaveBeenCalledTimes(1);
    expect(OpenAIAgent).toHaveBeenCalledWith(
      testPlayerId,
      'gpt-4o-mini',
      'https://api.openai.com/v1',
      'test-openai-key'
    );
  });

  it('should create an OpenAIAgent for agentType "Groq"', async () => {
    process.env.GROQ_API_KEY = 'test-groq-key';
    const config: AgentConfig = {
      agentType: 'Groq',
      modelName: 'llama3-8b-8192',
      providerValue: 'groq',
    };
    await createAgentInstance(config, testPlayerId);
    expect(OpenAIAgent).toHaveBeenCalledTimes(1);
    expect(OpenAIAgent).toHaveBeenCalledWith(
      testPlayerId,
      'llama3-8b-8192',
      'https://api.groq.com/openai/v1',
      'test-groq-key'
    );
  });

  it('should create an OpenAIAgent for agentType "Ollama" without API key', async () => {
    // No API key needed for default local Ollama
    const config: AgentConfig = {
      agentType: 'Ollama',
      modelName: 'llama3:latest',
      providerValue: 'ollama_local',
    };
    await createAgentInstance(config, testPlayerId);
    expect(OpenAIAgent).toHaveBeenCalledTimes(1);
    expect(OpenAIAgent).toHaveBeenCalledWith(
      testPlayerId,
      'llama3:latest',
      'http://localhost:11434/v1',
      undefined
    );
  });

  it('should create an OpenAIAgent for agentType "Ollama" with custom endpoint', async () => {
    // Test custom Ollama endpoint configuration
    const config: AgentConfig = {
      agentType: 'Ollama',
      modelName: 'llama3:latest',
      providerValue: 'ollama_local',
    };
    const customConfig: CustomProviderConfig = {
      ollamaEndpoint: 'https://custom-ollama-server.com:8080/v1',
    };

    await createAgentInstance(config, testPlayerId, undefined, customConfig);
    expect(OpenAIAgent).toHaveBeenCalledTimes(1);
    expect(OpenAIAgent).toHaveBeenCalledWith(
      testPlayerId,
      'llama3:latest',
      'https://custom-ollama-server.com:8080/v1',
      undefined
    );
  });

  it('should create a HumanAgent for agentType "Human"', async () => {
    const config: AgentConfig = { agentType: 'Human' };
    await createAgentInstance(config, testPlayerId);
    expect(HumanAgent).toHaveBeenCalledTimes(1);
    expect(HumanAgent).toHaveBeenCalledWith(testPlayerId);
  });

  it('should create a DummyAIAgent for agentType "Dummy"', async () => {
    const config: AgentConfig = { agentType: 'Dummy' };
    await createAgentInstance(config, testPlayerId);
    expect(DummyAIAgent).toHaveBeenCalledTimes(1);
    expect(DummyAIAgent).toHaveBeenCalledWith(testPlayerId);
  });

  it('should create a DummyAIAgent for unknown agentType', async () => {
    const config: AgentConfig = {
      agentType: 'UnknownFutureAgent' as AgentConfig['agentType'],
    };
    await createAgentInstance(config, testPlayerId);
    expect(DummyAIAgent).toHaveBeenCalledTimes(1);
    expect(DummyAIAgent).toHaveBeenCalledWith(testPlayerId);
  });

  // Add tests for ClaudeAgent, GeminiAgent etc. when they are fully implemented
  // it('should create a ClaudeAgent for agentType "Claude"', async () => { ... });
});
