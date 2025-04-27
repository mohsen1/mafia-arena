export interface AIModelConfig {
    id: string; // e.g., 'gpt-4o', 'llama3-70b'
    name: string; // User-friendly name
    providerId: string; // Link to the provider
}

export interface AIProviderConfig {
    id: string; // e.g., 'openai', 'ollama', 'fireworks'
    name: string; // User-friendly name
    apiEndpoint: string; // Base URL for the API
    apiKeyEnvVar?: string; // Optional: Environment variable for the API key
}
