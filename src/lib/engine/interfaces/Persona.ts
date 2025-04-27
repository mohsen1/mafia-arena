// Represents a single character persona.
export interface Persona {
  name: string;
  backstory: string;
  personalityTraits: string[];
}

export const DEFAULT_PERSONA: Persona = {
  name: 'Mysterious Figure',
  backstory: 'Their past is shrouded in mystery.',
  personalityTraits: ['Quiet', 'Observant', 'Enigmatic'],
}; 