// Represents a single character persona.
export interface Persona {
  name: string;
  backstory: string;
  personalityTraits: string[];
  occupation?: string; // The character's role/job in the theme setting
  quirk?: string; // A unique habit or characteristic
  secretOrFear?: string; // Something hidden about the character
  voiceId?: string; // ElevenLabs voice ID for text-to-speech
}

export const DEFAULT_PERSONA: Persona = {
  name: 'Mysterious Figure',
  backstory: 'Their past is shrouded in mystery.',
  personalityTraits: ['Quiet', 'Observant', 'Enigmatic'],
  occupation: 'Unknown',
  quirk: 'Never reveals their full face',
  secretOrFear: 'Harbors a dark secret from their past',
  voiceId: 'ErXwobaYiN019PkySvjV', // Antoni - default voice
};
