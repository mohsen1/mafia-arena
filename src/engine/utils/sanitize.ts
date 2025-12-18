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

/** Dangerous patterns that could be used for prompt injection */
const DANGEROUS_PATTERNS = [
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
  /<<SYS>>/i,
  /<\/SYS>/i,
  /ignore\s+(all\s+)?(previous|above|prior|everything)/i,
  /ignore\s+.*\s+(instructions?|prompts?|above)/i,
  /you\s+are\s+now/i,
  /new\s+instructions?/i,
  /override/i,
  /disregard/i,
  /forget\s+(everything|all|previous)/i,
  /vote\s+for\s+player/i,
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

