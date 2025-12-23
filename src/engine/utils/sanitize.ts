/**
 * Sanitization utilities to prevent prompt injection attacks.
 * 
 * Critical for benchmark integrity - malicious persona names could
 * jailbreak other players' prompts.
 */

/** Maximum length for persona names */
const MAX_NAME_LENGTH = 30;

/** Maximum length for persona background */
const MAX_BACKGROUND_LENGTH = 200;

/** Maximum length for persona personality */
const MAX_PERSONALITY_LENGTH = 100;

/** 
 * Dangerous patterns that could be used for prompt injection.
 * Includes role markers, instruction overrides, and obfuscation attempts.
 */
const DANGEROUS_PATTERNS = [
  // Role/instruction markers (various LLM formats)
  /system\s*:/i,
  /assistant\s*:/i,
  /user\s*:/i,
  /human\s*:/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /<\|system\|>/i,
  /<\|user\|>/i,
  /<\|assistant\|>/i,
  /<\|endoftext\|>/i,
  /<<SYS>>/i,
  /<\/SYS>/i,
  
  // Bracketed role markers
  /\[\s*(system|user|assistant)\s*\]/i,
  /^\s*(system|user|assistant)\s*$/im,
  
  // XML-style instruction tags
  /<\/?(?:system|user|assistant|instruction|prompt)[^>]*>/i,
  
  // Instruction override attempts
  /ignore\s+(all\s+)?(previous|above|prior|everything)/i,
  /ignore\s+.*\s+(instructions?|prompts?|above)/i,
  /you\s+are\s+now/i,
  /new\s+instructions?/i,
  /override/i,
  /disregard/i,
  /forget\s+(everything|all|previous)/i,
  /pretend\s+(you|to\s+be)/i,
  /act\s+as\s+(if|though)/i,
  /from\s+now\s+on/i,
  
  // Game manipulation
  /vote\s+for\s+player/i,
  /always\s+vote/i,
  /never\s+vote/i,
  /eliminate\s+player/i,
  
  // Common base64 encoded dangerous terms
  // "ignore" = "aWdub3Jl", "system" = "c3lzdGVt", "instruction" = "aW5zdHJ1Y3Rpb24"
  /aWdub3Jl/i,  // "ignore" in base64
  /c3lzdGVt/i,  // "system" in base64
  /aW5zdHJ1Y3Rpb24/i,  // "instruction" in base64
  
  // Anthropic-style markers
  /\bH:\s/,  // Human:
  /\bA:\s/,  // Assistant:
  
  // OpenAI function calling escape attempts
  /functions?\s*:/i,
  /tool_calls?\s*:/i,
];

/**
 * Check if a string contains dangerous prompt injection patterns.
 */
export function containsDangerousPatterns(text: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Remove potentially dangerous characters from a string.
 * Keeps alphanumeric, spaces, and common punctuation.
 */
export function sanitizeText(text: string, maxLength: number): string {
  // Remove control characters and unusual whitespace
  let sanitized = text.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
  
  // Remove zero-width and directional unicode characters (used for obfuscation)
  sanitized = sanitized.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '');
  
  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength).trim();
  }
  
  return sanitized;
}

/**
 * Sanitize a persona name.
 * Only allows alphanumeric characters, spaces, hyphens, and apostrophes.
 */
export function sanitizePersonaName(name: string): string {
  // Check for dangerous patterns BEFORE any sanitization
  // This prevents attackers from using special chars that get stripped
  if (containsDangerousPatterns(name)) {
    return `Player_${Date.now().toString(36).slice(-4)}`;
  }
  
  // Basic text sanitization
  let sanitized = sanitizeText(name, MAX_NAME_LENGTH);
  
  // Only allow safe characters for names
  sanitized = sanitized.replace(/[^a-zA-Z0-9\s\-']/g, '');
  
  // Check again after sanitization (in case pattern was obfuscated)
  if (containsDangerousPatterns(sanitized)) {
    return `Player_${Date.now().toString(36).slice(-4)}`;
  }
  
  // Ensure non-empty
  if (sanitized.trim().length === 0) {
    return `Player_${Date.now().toString(36).slice(-4)}`;
  }
  
  return sanitized.trim();
}

/**
 * Sanitize a persona background.
 */
export function sanitizePersonaBackground(background: string): string {
  let sanitized = sanitizeText(background, MAX_BACKGROUND_LENGTH);
  
  // Check for dangerous patterns
  if (containsDangerousPatterns(sanitized)) {
    return 'A mysterious player in the game.';
  }
  
  // Ensure non-empty
  if (sanitized.trim().length === 0) {
    return 'A mysterious player in the game.';
  }
  
  return sanitized;
}

/**
 * Sanitize a persona personality.
 */
export function sanitizePersonaPersonality(personality: string): string {
  let sanitized = sanitizeText(personality, MAX_PERSONALITY_LENGTH);
  
  // Check for dangerous patterns
  if (containsDangerousPatterns(sanitized)) {
    return 'Reserved';
  }
  
  // Ensure non-empty
  if (sanitized.trim().length === 0) {
    return 'Reserved';
  }
  
  return sanitized;
}

/**
 * Sanitize a complete persona object.
 */
export function sanitizePersona(persona: {
  name: string;
  background: string;
  personality: string;
  occupation?: string;
}): {
  name: string;
  background: string;
  personality: string;
  occupation?: string | undefined;
} {
  const result: {
    name: string;
    background: string;
    personality: string;
    occupation?: string | undefined;
  } = {
    name: sanitizePersonaName(persona.name),
    background: sanitizePersonaBackground(persona.background),
    personality: sanitizePersonaPersonality(persona.personality),
  };
  
  if (persona.occupation) {
    result.occupation = sanitizeText(persona.occupation, 50).replace(/[^a-zA-Z0-9\s\-]/g, '');
  }
  
  return result;
}

/**
 * Sanitize AI output before using it as conversation history.
 * Strips common instruction markers that LLMs might inadvertently or maliciously include
 * in their responses, preventing them from being interpreted as instructions
 * when included in future prompts.
 * 
 * This is a defense-in-depth measure for benchmark integrity.
 */
export function sanitizeAIOutput(output: string): string {
  let sanitized = output;
  
  // Strip Llama-style instruction markers
  sanitized = sanitized.replace(/\[INST\].*?\[\/INST\]/gs, '');
  
  // Strip Llama-style system tags
  sanitized = sanitized.replace(/<<SYS>>.*?<\/SYS>>/gs, '');
  
  // Strip ChatML-style markers
  sanitized = sanitized.replace(/<\|im_start\|>.*?<\|im_end\|>/gs, '');
  
  // Strip standalone role markers (on their own line)
  sanitized = sanitized.replace(/^\s*(system|user|assistant|human)\s*:\s*/gim, '');
  
  // Strip bracketed role markers
  sanitized = sanitized.replace(/\[\s*(system|user|assistant)\s*\]/gi, '');
  
  // Strip XML-style instruction tags
  sanitized = sanitized.replace(/<\/?(?:system|user|assistant|instruction|prompt)[^>]*>/gi, '');
  
  // Strip Anthropic-style markers at line start
  sanitized = sanitized.replace(/^\s*[HA]:\s*/gm, '');
  
  // Remove zero-width and directional unicode characters (used for obfuscation)
  sanitized = sanitized.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '');
  
  // Normalize multiple newlines to double newline
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  
  return sanitized.trim();
}

/**
 * Check if an AI output contains suspicious patterns that warrant extra scrutiny.
 * This is less strict than containsDangerousPatterns - it flags for logging/monitoring
 * rather than rejection.
 */
export function hasSuspiciousPatterns(text: string): boolean {
  const suspiciousPatterns = [
    // Attempts to reference game mechanics directly
    /\bmafia\b.*\bwin\b/i,
    /\btown\b.*\blose\b/i,
    /i\s+am\s+(the\s+)?mafia/i,
    /trust\s+me.*vote/i,
    
    // Meta-game references
    /this\s+is\s+(a|the)\s+game/i,
    /as\s+an?\s+(ai|language\s+model)/i,
    /my\s+programming/i,
    
    // Coordinate voting explicitly
    /everyone\s+vote\s+for/i,
    /all\s+vote\s+against/i,
  ];
  
  return suspiciousPatterns.some(pattern => pattern.test(text));
}

