export interface ModelDefinition {
  title: string;
  value: string;
}

export interface ProviderDefinition {
  title: string;
  value: string;
  endpoint: string;
  apiKeyEnvVar: string;
}

// Example Models (User-friendly names)
export const openAIModels = [
  { title: "GPT-4.1 Mini (Default, Fast)", value: "gpt-4.1-mini" },
  { title: "GPT-4.1 (Advanced)", value: "gpt-4.1" },
  { title: "GPT-4 Turbo", value: "gpt-4-turbo" },
  { title: "GPT-3.5 Turbo", value: "gpt-3.5-turbo" },
];

export const claudeModels = [
  { title: "Claude 3.7 Sonnet (Default)", value: "claude-3-7-sonnet-20250219" },
  { title: "Claude 3.5 Sonnet", value: "claude-3-5-sonnet-20241022" },
  { title: "Claude 3.5 Haiku", value: "claude-3-5-haiku-20241022" },
  { title: "Claude 3 Opus", value: "claude-3-opus-20240229" },
  { title: "Claude 3 Haiku", value: "claude-3-haiku-20240307" },
];

export const geminiModels = [
  {
    title: "Gemini 2.5 Flash (Default)",
    value: "gemini-2.5-flash-preview-04-17",
  },
  { title: "Gemini 2.5 Pro", value: "gemini-2.5-pro-preview-03-25" },
  { title: "Gemini 2.0 Flash", value: "gemini-2.0-flash" },
  { title: "Gemini 2.0 Pro", value: "gemini-2.0-pro" },
];

// Groq Models
export const groqModels = [
  // Production Models
  { title: "Gemma 2 9B IT (Google, Default)", value: "gemma2-9b-it" },
  { title: "Llama 3.3 70B Versatile (Meta)", value: "llama-3.3-70b-versatile" },
  { title: "Llama 3.1 8B Instant (Meta)", value: "llama-3.1-8b-instant" },
  { title: "Llama3 70B (Meta, 8K Context)", value: "llama3-70b-8192" },
  { title: "Llama3 8B (Meta, 8K Context)", value: "llama3-8b-8192" },
  // Preview Models (May be discontinued)
  {
    title: "Llama 4 Maverick 17B (Meta, Preview)",
    value: "meta-llama/llama-4-maverick-17b-128e-instruct",
  },
  {
    title: "Llama 4 Scout 17B (Meta, Preview)",
    value: "meta-llama/llama-4-scout-17b-16e-instruct",
  },
  {
    title: "Deepseek R1 Distill Llama 70B (DeepSeek, Preview)",
    value: "deepseek-r1-distill-llama-70b",
  },
  { title: "Mistral Saba 24B (Mistral, Preview)", value: "mistral-saba-24b" },
  { title: "Qwen QWQ 32B (Alibaba, Preview)", value: "qwen-qwq-32b" },
  { title: "Allam 2 7B (SDAIA, Preview)", value: "allam-2-7b" },
];

// Fireworks AI Models (Selection based on provided list)
// TODO: enhance
export const fireworksModels: ModelDefinition[] = [
  {
    title: "Meta Llama 4 Maverick Instruct (Basic)",
    value: "fireworks/llama4-maverick-instruct-basic",
  },
  {
    title: "Meta Llama 4 Scout Instruct (Basic)",
    value: "fireworks/llama4-scout-instruct-basic",
  },
  {
    title: "Meta Llama 3.1 405B Instruct",
    value: "fireworks/llama-v3p1-405b-instruct",
  },
  {
    title: "DeepSeek R1 (Fast)",
    value: "fireworks/deepseek-r1-fast",
  },
  {
    title: "DeepSeek V3",
    value: "fireworks/deepseek-v3",
  },
  {
    title: "Yi Large",
    value: "yi-01-ai/yi-large",
  },
  {
    title: "Qwen 2.5 72B Instruct",
    value: "fireworks/qwen2p5-72b-instruct",
  },
  {
    title: "Firefunction-v2",
    value: "fireworks/firefunction-v2",
  },
  {
    title: "f1 (Preview)",
    value: "fireworks/f1-preview",
  },
  {
    title: "Mixtral MoE 8x22B Instruct",
    value: "fireworks/mixtral-8x22b-instruct",
  },
  {
    title: "Mixtral MoE 8x7B Instruct",
    value: "fireworks/mixtral-8x7b-instruct",
  },
  {
    title: "Firefunction-v1",
    value: "fireworks/firefunction-v1",
  },
  {
    title: "f1-mini (Preview)",
    value: "fireworks/f1-mini-preview",
  },
  {
    title: "Meta Llama 2 70B Chat",
    value: "fireworks/llama-2-70b-chat",
  },
  {
    title: "Guanaco 65B",
    value: "fireworks/guanaco-65b",
  },
  {
    title: "Xwin-LM 70B",
    value: "fireworks/xwin-lm-70b",
  },
  {
    title: "Vicuna 33B",
    value: "fireworks/vicuna-33b",
  },
  {
    title: "WizardLM 70B",
    value: "fireworks/wizardlm-70b",
  },
  {
    title: "Qwen QwQ 32B (Preview)",
    value: "fireworks/qwen-qwq-32b-preview",
  },
  {
    title: "Falcon 40B Instruct",
    value: "fireworks/falcon-40b-instruct",
  },
];

// Example OpenAI Providers/Endpoints
export const openAIProviders: ProviderDefinition[] = [
  {
    title: "Official OpenAI API",
    value: "openai",
    endpoint: "https://api.openai.com/v1", // Default OpenAI endpoint
    apiKeyEnvVar: "OPENAI_API_KEY", // Expected env var
  },
  {
    title: "Local Ollama",
    value: "ollama_local",
    endpoint: "http://localhost:11434/v1", // Common Ollama endpoint
    apiKeyEnvVar: "OLLAMA_API_KEY", // Ollama might need 'ollama' or can be optional
  },
  {
    title: "Fireworks AI",
    value: "fireworks",
    endpoint: "https://api.fireworks.ai/inference/v1",
    apiKeyEnvVar: "FIREWORKS_API_KEY",
  },
  {
    title: "Groq",
    value: "groq",
    endpoint: "https://api.groq.com/openai/v1", // Groq uses OpenAI-compatible endpoint
    apiKeyEnvVar: "GROQ_API_KEY",
  },
  // Add other providers like Groq, Together AI, custom endpoints etc.
];

export const availableProviders: ProviderDefinition[] = [
  ...openAIProviders,

  // Non-OpenAI Providers
  {
    title: "Claude",
    value: "claude",
    endpoint: "https://api.anthropic.com/v1", // Claude uses Anthropic endpoint
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
  },
  {
    title: "Gemini",
    value: "gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta", // Gemini uses Google endpoint
    apiKeyEnvVar: "GEMINI_API_KEY",
  },
];

// Combine all models into a lookup structure, exported for use
export const availableModelsByProvider: Record<string, ModelDefinition[]> = {
  openai: openAIModels,
  fireworks: fireworksModels,
  groq: groqModels,
  claude: claudeModels,
  gemini: geminiModels,
  ollama_local: [
    { title: "Ollama Local Model", value: "llama3.2" }, // Default Ollama model
    { title: "Codellama", value: "codellama" },
    { title: "Mistral", value: "mistral" },
  ],
};
