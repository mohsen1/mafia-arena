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
  { title: "Gemma 2 9B IT (Google)", value: "gemma2-9b-it" },
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

// Example OpenAI Providers/Endpoints
export const openAIProviders = [
  {
    title: "Official OpenAI API",
    value: "openai",
    endpoint: "https://api.openai.com/v1", // Default OpenAI endpoint
    apiKeyEnvVar: "OPENAI_API_KEY", // Expected env var
  },
  {
    title: "Local Ollama (http://localhost:11434)",
    value: "ollama_local",
    endpoint: "http://localhost:11434/v1", // Common Ollama endpoint
    apiKeyEnvVar: "OLLAMA_API_KEY", // Ollama might need 'ollama' or can be optional
  },
  {
    title: "Fireworks AI (Requires FIREWORKS_API_KEY)",
    value: "fireworks",
    endpoint: "https://api.fireworks.ai/inference/v1",
    apiKeyEnvVar: "FIREWORKS_API_KEY",
  },
  {
    title: "Groq API (Requires GROQ_API_KEY)",
    value: "groq",
    endpoint: "https://api.groq.com/openai/v1", // Groq uses OpenAI-compatible endpoint
    apiKeyEnvVar: "GROQ_API_KEY",
  },
  // Add other providers like Groq, Together AI, custom endpoints etc.
];
