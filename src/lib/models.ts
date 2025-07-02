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

// Updated OpenAI Models (Section 3 of the guide)
export const openAIModels: ModelDefinition[] = [
  // GPT-4.1 Series (Latest, API Optimized)
  { title: 'GPT-4.1 (Advanced, API Optimized)', value: 'gpt-4.1' },
  {
    title: 'GPT-4.1 Mini (Default, Fast, API Optimized)',
    value: 'gpt-4.1-mini',
  },
  {
    title: 'GPT-4.1 Nano (Fastest, Cost-Effective, API Optimized)',
    value: 'gpt-4.1-nano',
  },

  // GPT-4o Series (Strong Multimodal, Audio I/O)
  { title: 'GPT-4o (Flagship Multimodal)', value: 'gpt-4o' },
  { title: 'GPT-4o Mini (Cost-Effective Multimodal)', value: 'gpt-4o-mini' },

  // Reasoning ('o') Series - Note: May require Responses API or specific tiers
  { title: 'OpenAI o1-pro (Max Reasoning, Responses API)', value: 'o1-pro' },
  { title: 'OpenAI o1 (Advanced Reasoning)', value: 'o1' },
  { title: 'OpenAI o1-mini (Fast Reasoning)', value: 'o1-mini' },
  { title: 'OpenAI o3 (Deep Reasoning, Responses API)', value: 'o3' },
  { title: 'OpenAI o3-mini (Balanced Reasoning)', value: 'o3-mini' },
  {
    title: 'OpenAI o4-mini (Fast & Efficient Reasoning, Responses API, RFT)',
    value: 'o4-mini',
  },

  // Other Widely Used Models
  { title: 'GPT-4 Turbo (Legacy, High Intelligence)', value: 'gpt-4-turbo' },
  { title: 'GPT-3.5 Turbo (Legacy, Cost-Effective)', value: 'gpt-3.5-turbo' },
  {
    title: 'GPT-3.5 Turbo Instruct (Legacy, Completions)',
    value: 'gpt-3.5-turbo-instruct',
  },
];

// Updated Claude Models (Section 4 of the guide)
export const claudeModels: ModelDefinition[] = [
  // Claude 4 Series (Latest Generation)
  {
    title: 'Claude 4 Sonnet (High Performance, Gen 4)',
    value: 'claude-sonnet-4-20250514',
  },

  // Current Claude 3.x Series
  {
    title: 'Claude 3.7 Sonnet (Default, Extended Thinking)',
    value: 'claude-3-7-sonnet-20250219',
  },
  {
    title: 'Claude 3.5 Sonnet (Intelligent, Upgraded)',
    value: 'claude-3-5-sonnet-20241022',
  },
  {
    title: 'Claude 3.5 Haiku (Fastest, Agile)',
    value: 'claude-3-5-haiku-20241022',
  },
  {
    title: 'Claude 3 Opus (Powerful, Complex Tasks)',
    value: 'claude-3-opus-20240229',
  },
  { title: 'Claude 3 Haiku (Fast, Compact)', value: 'claude-3-haiku-20240307' },
];

// Updated Gemini Models (Section 5 of the guide)
export const geminiModels: ModelDefinition[] = [
  // Gemini 2.5 Series (Default - Most Advanced)
  {
    title: 'Gemini 2.5 Flash Lite (Default, Fast, Cost-Efficient)',
    value: 'gemini-2.5-flash-lite-preview-06-17',
  },
  {
    title: 'Gemini 2.5 Pro (Most Powerful Thinking, Preview)',
    value: 'gemini-2.5-pro-preview-05-06',
  },
  {
    title: 'Gemini 2.5 Flash (Best Price-Performance, Preview)',
    value: 'gemini-2.5-flash-preview-05-20',
  },

  // Gemini 2.0 Series
  {
    title: 'Gemini 2.0 Flash (Fast, 1M Context, Tool Use)',
    value: 'gemini-2.0-flash',
  },
  {
    title: 'Gemini 2.0 Flash-Lite (Cost-Efficient, Low Latency)',
    value: 'gemini-2.0-flash-lite',
  },

  // Gemini 1.5 Series (Versatile Option)
  {
    title: 'Gemini 1.5 Flash (Fast, Versatile Multimodal)',
    value: 'gemini-1.5-flash',
  },
];

// Updated Groq Models (Section 6 of the guide)
export const groqModels: ModelDefinition[] = [
  // Production Models
  { title: 'Gemma 2 9B IT (Google, Default)', value: 'gemma2-9b-it' },
  { title: 'Llama 3.3 70B Versatile (Meta)', value: 'llama-3.3-70b-versatile' },
  { title: 'Llama 3.1 8B Instant (Meta)', value: 'llama-3.1-8b-instant' },
  { title: 'Llama3 70B (Meta, 8K Context)', value: 'llama3-70b-8192' },
  { title: 'Llama3 8B (Meta, 8K Context)', value: 'llama3-8b-8192' },

  // Preview Models (May be discontinued, use with caution in production)
  {
    title: 'Llama 4 Maverick 17B (Meta, Vision, Preview)',
    value: 'meta-llama/llama-4-maverick-17b-128e-instruct',
  },
  {
    title: 'Llama 4 Scout 17B (Meta, Vision, Preview)',
    value: 'meta-llama/llama-4-scout-17b-16e-instruct',
  },
  {
    title: 'Deepseek R1 Distill Llama 70B (DeepSeek, Preview)',
    value: 'deepseek-r1-distill-llama-70b',
  },
  { title: 'Mistral Saba 24B (Mistral, Preview)', value: 'mistral-saba-24b' },
  { title: 'Qwen QWQ 32B (Alibaba, Preview)', value: 'qwen-qwq-32b' },
  { title: 'Allam 2 7B (SDAIA, Preview)', value: 'allam-2-7b' },
];

// Updated Fireworks AI Models (Section 7 of the guide)
export const fireworksModels: ModelDefinition[] = [
  // Llama Series (Meta, hosted by Fireworks)
  {
    title: 'Meta Llama 4 Maverick Instruct (Basic, Vision, 10M Context)',
    value: 'accounts/fireworks/models/llama4-maverick-instruct-basic',
  },
  {
    title: 'Meta Llama 4 Scout Instruct (Basic, Vision, 10M Context)',
    value: 'accounts/fireworks/models/llama4-scout-instruct-basic',
  },
  {
    title: 'Meta Llama 3.1 405B Instruct (Very Large)',
    value: 'accounts/fireworks/models/llama-v3p1-405b-instruct',
  },
  {
    title: 'Meta Llama 2 70B Chat',
    value: 'accounts/fireworks/models/llama-v2-70b-chat',
  },

  // Qwen Models (Hosted by Fireworks)
  {
    title: 'Qwen3 30B-A3B (Alibaba)',
    value: 'accounts/fireworks/models/qwen3-30b-a3b',
  },
  {
    title: 'Qwen3 235B-A22B (Alibaba, Very Large)',
    value: 'accounts/fireworks/models/qwen3-235b-a22b',
  },
  {
    title: 'Qwen 2.5 72B Instruct (Alibaba)',
    value: 'accounts/fireworks/models/qwen2p5-72b-instruct',
  },

  // DeepSeek Models (Hosted by Fireworks)
  {
    title: 'DeepSeek R1 (Fast)',
    value: 'accounts/fireworks/models/deepseek-r1-fast',
  },
  {
    title: 'DeepSeek V3',
    value: 'accounts/fireworks/models/deepseek-v3',
  },

  // Yi Models (01.AI, Hosted by Fireworks)
  {
    title: 'Yi Large (01.AI, Multilingual)',
    value: 'accounts/yi-01-ai/models/yi-large',
  },

  // Fireworks Proprietary Models
  {
    title: 'Firefunction-v2 (Function Calling Optimized)',
    value: 'accounts/fireworks/models/firefunction-v2',
  },
  {
    title: 'Firefunction-v1 (Function Calling)',
    value: 'accounts/fireworks/models/firefunction-v1',
  },

  // Mistral Models (Hosted by Fireworks)
  {
    title: 'Mixtral MoE 8x22B Instruct',
    value: 'accounts/fireworks/models/mixtral-8x22b-instruct',
  },
  {
    title: 'Mixtral MoE 8x7B Instruct',
    value: 'accounts/fireworks/models/mixtral-8x7b-instruct',
  },
];

// Updated Ollama Local Models (Section 8 of the guide)
export const ollama_local: ModelDefinition[] = [
  // General Purpose Models
  {
    title: 'Llama 3.1 (Meta, Gen Purpose, 8B Instr Q5_K_M)',
    value: 'llama3.1:8b-instruct-q5_K_M',
  },
  {
    title: 'Llama 3.1 (Meta, Gen Purpose, 70B Instr Q4_K_M)',
    value: 'llama3.1:70b-instruct-q4_K_M',
  },
  {
    title: 'Mistral (MistralAI, Fast, 7B Instruct v0.3)',
    value: 'mistral:7b-instruct-v0.3',
  },
  { title: 'Gemma 3 (Google, Efficient, 9B Instruct)', value: 'gemma3:9b-it' },
  {
    title: 'Qwen3 (Alibaba, General, 8B Chat Q5_K_M)',
    value: 'qwen3:8b-chat-q5_K_M',
  },
  {
    title: 'Phi-4 Mini (Microsoft, Small, Reasoning, 3.8B Q4_K_M)',
    value: 'phi4-mini-reasoning:3.8b-q4_K_M',
  },
  {
    title: 'Mixtral 8x7B (MistralAI, MoE, Instruct Q5_K_M)',
    value: 'mixtral:8x7b-instruct-v0.1-q5_K_M',
  },

  // Coding Models
  {
    title: 'Codellama (Meta, Coding, 7B Instruct Q5_K_M)',
    value: 'codellama:7b-instruct-q5_K_M',
  },
  {
    title: 'DeepSeek Coder V2 (DeepSeek, Adv Coding, 16B Q5_K_M)',
    value: 'deepseek-coder-v2:16b-instruct-q5_K_M',
  },
  { title: 'Devstral (Coding Agent, 24B Tools)', value: 'devstral:24b-tools' },
  { title: 'StarCoder2 (Coding, 3B)', value: 'starcoder2:3b' },

  // Multimodal Models
  {
    title: 'LLaVA (Vision-Language, Llama3 Base)',
    value: 'llava-llama3:latest',
  },
  { title: 'Qwen2.5 VL (Alibaba, Vision-Language)', value: 'qwen2.5vl:latest' },
  {
    title: 'Llama 4 (Meta, Multimodal, Latest Preview)',
    value: 'llama4:latest',
  },

  // Specialized Models
  {
    title: 'Nomic Embed Text (Embedding, Latest)',
    value: 'nomic-embed-text:latest',
  },

  // Legacy/Simple Options
  { title: 'Llama3.2 (Default)', value: 'llama3.2' },
  { title: 'Codellama (Simple)', value: 'codellama' },
  { title: 'Mistral (Simple)', value: 'mistral' },
];

// Updated Provider Definitions (Section 2 of the guide)
export const openAIProviders: ProviderDefinition[] = [
  {
    title: 'Official OpenAI API',
    value: 'openai',
    endpoint: 'https://api.openai.com/v1',
    apiKeyEnvVar: 'OPENAI_API_KEY',
  },
  {
    title: 'Groq',
    value: 'groq',
    endpoint: 'https://api.groq.com/openai/v1',
    apiKeyEnvVar: 'GROQ_API_KEY',
  },
  {
    title: 'Fireworks AI',
    value: 'fireworks',
    endpoint: 'https://api.fireworks.ai/inference/v1',
    apiKeyEnvVar: 'FIREWORKS_API_KEY',
  },
  {
    title: 'Local Ollama',
    value: 'ollama_local',
    endpoint: 'http://localhost:11434/v1',
    apiKeyEnvVar: 'OLLAMA_API_KEY',
  },
];

export const availableProviders: ProviderDefinition[] = [
  ...openAIProviders,

  // Non-OpenAI Providers
  {
    title: 'Claude',
    value: 'claude',
    endpoint: 'https://api.anthropic.com/v1',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
  },
  {
    title: 'Gemini',
    value: 'gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyEnvVar: 'GEMINI_API_KEY',
  },
];

// Updated Model Lookup Structure (Section 9 of the guide)
export const availableModelsByProvider: Record<string, ModelDefinition[]> = {
  // OpenAI-Compatible Providers
  openai: openAIModels,
  fireworks: fireworksModels,
  groq: groqModels,
  ollama_local: ollama_local,

  // Other Providers
  claude: claudeModels,
  gemini: geminiModels,
};
