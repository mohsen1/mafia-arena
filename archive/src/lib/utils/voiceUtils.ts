/**
 * Voice ID assignment utility for characters using ElevenLabs voice library
 * Assigns appropriate voice IDs based on character age and gender analysis
 */

// ElevenLabs Voice ID mappings from Issue #111
const ELEVENLABS_VOICES = {
  'male-young': [
    'ErXwobaYiN019PkySvjV', // Antoni - well-rounded young male, American accent
    'CYw3kZ02Hs0563khs1Fj', // Dave - young male, British (Essex) accent
    'g5CIjZEefAph4nQFvHAz', // Ethan - young male, American accent, ASMR
    'bVMeCyTHy58xNoL34h3p', // Jeremy - excited young male, American-Irish accent
    'TxGEqnHWrfWFTfGW9XjX', // Josh - deep young male, American accent
    'TX3LPaxmHKxFdv7VOQHJ', // Liam - young male, American accent, versatile
    'yoZ06aMxZJJ28mfd3POQ', // Sam - raspy young male, American accent
    'GBv7mTt0atIp3Br8iCZE', // Thomas - calm young male, American accent
    'zcAOhNBS3c14rBihAFp1', // Giovanni - young male, English-Italian accent
  ],
  'male-old': [
    'D38z5RcWu1voky8WS1ja', // Fin - old male, Irish accent, sailor character
    'ZQe5CZNOzWyzPSCn5a3c', // James - calm old male, Australian accent (recommended for wise old man)
    't0jbNlBVZ17f02VDIeMI', // Jessie - raspy old male, American accent
    'flq6f7yk4E4fJM5XTYuZ', // Michael - old male, American accent, clear articulate
    'knrPHWnBmmDHMoiMeP3l', // Santa Claus - old male, warm jovial tone
    'pqHfZKP75CvOlQylNhV4', // Bill - strong middle-aged male, American accent
    'Zlb1dXrM653N07WRdFW3', // Joseph - middle-aged male, British accent
  ],
  'female-young': [
    'AZnzlk1XvdvUeBnXmlld', // Domi - strong young female, American accent
    'ThT5KcBeYPX3keUQqHPh', // Dorothy - pleasant young female, British accent
    'LcfcDJNUP1GQjkzn1xUU', // Emily - calm young female, American accent
    'jsCqWAovK2LkecY7zXl4', // Freya - young female, American accent, versatile
    'jBpfuIE2acCO8z3wKNLl', // Gigi - childish young female, American accent
    'oWAxZDx7w5VEj9dCyTzz', // Grace - young female, American Southern accent
    '21m00Tcm4TlvDq8ikWAM', // Rachel - calm young female, American accent
    'EXAVITQu4vr4xnSDxMaL', // Sarah - soft young female, American accent
    'XrExE9yKIg1WjnnlVkGX', // Matilda - warm young female, American accent
  ],
  'female-old': [
    'Xb7hH8MSUJpSbSDYk0k2', // Alice - confident adult female, British accent
    'XB0fDUnXU5powFXDhCwa', // Charlotte - seductive middle-aged female, English-Swedish accent
    'z9fAnlkpzviPz146aGWa', // Glinda - middle-aged female, American accent, witch character
    'pFZP5JQG7iQjIQuC4Bku', // Lily - raspy middle-aged female, British accent
    'pMsXgVXv3BLzUgSXRplE', // Serena - pleasant middle-aged female, American accent
  ],
};

// Special voice for moderator/wise characters
const WISE_OLD_MAN_VOICE = 'ZQe5CZNOzWyzPSCn5a3c'; // James - calm old male, Australian accent

// Track used voice IDs to avoid duplicates within a game
const usedVoiceIds: Set<string> = new Set();

/**
 * Reset the used voice IDs tracker. Should be called when starting a new game.
 */
export function resetUsedVoiceIds(): void {
  usedVoiceIds.clear();
  console.log('[VoiceUtils] Reset used voice IDs tracker');
}

/**
 * Selects a voice ID based on gender and age category.
 * Tries to avoid duplicates by tracking used voice IDs.
 *
 * @param gender - 'male' or 'female'
 * @param ageCategory - 'young' or 'old'
 * @param isWiseCharacter - true if this character should use the special wise old man voice
 * @returns ElevenLabs voice ID string
 */
export function selectCharacterVoiceId(
  gender: 'male' | 'female',
  ageCategory: 'young' | 'old',
  isWiseCharacter: boolean = false
): string {
  console.log(
    `[VoiceUtils] Selecting voice for ${gender} ${ageCategory}${isWiseCharacter ? ' (wise character)' : ''}`
  );

  // Special case for wise characters (moderator, etc.)
  if (isWiseCharacter) {
    console.log(`[VoiceUtils] Using wise old man voice: ${WISE_OLD_MAN_VOICE}`);
    return WISE_OLD_MAN_VOICE;
  }

  const key = `${gender}-${ageCategory}` as keyof typeof ELEVENLABS_VOICES;
  const availableVoices = ELEVENLABS_VOICES[key];

  if (!availableVoices || availableVoices.length === 0) {
    console.warn(`No voices found for category: ${key}`);
    // Fallback to a default voice
    return 'ErXwobaYiN019PkySvjV'; // Antoni - young male default
  }

  console.log(`[VoiceUtils] Found ${availableVoices.length} voices for ${key}`);

  // Filter out already used voice IDs
  const unusedVoices = availableVoices.filter(
    (voiceId: string) => !usedVoiceIds.has(voiceId)
  );

  // If all voices are used, reset and use all available voices
  const voicesToChooseFrom =
    unusedVoices.length > 0 ? unusedVoices : availableVoices;

  if (unusedVoices.length === 0) {
    console.log(
      `[VoiceUtils] All voices in ${key} category have been used, recycling voices`
    );
  }

  const randomIndex = Math.floor(Math.random() * voicesToChooseFrom.length);
  const selectedVoiceId = voicesToChooseFrom[randomIndex];

  // Mark this voice as used
  usedVoiceIds.add(selectedVoiceId);

  console.log(`[VoiceUtils] Selected voice ID: ${selectedVoiceId}`);

  return selectedVoiceId;
}

/**
 * Analyzes a persona to determine appropriate gender and age category for voice selection.
 * Reuses the same logic as the image analysis for consistency.
 *
 * @param persona - The character persona containing name, backstory, and traits
 * @returns Object with gender and ageCategory
 */
export function analyzePersonaForVoice(persona: {
  name: string;
  backstory: string;
  personalityTraits: string[];
}): { gender: 'male' | 'female'; ageCategory: 'young' | 'old' } {
  const personaText =
    `${persona.name} ${persona.backstory} ${persona.personalityTraits.join(' ')}`.toLowerCase();

  // Gender detection based on common indicators
  let gender: 'male' | 'female' = 'male';
  if (
    personaText.match(
      /\b(she|her|hers|woman|lady|girl|mother|daughter|sister|wife|mrs|ms|miss|female)\b/
    )
  ) {
    gender = 'female';
  } else if (
    personaText.match(
      /\b(he|him|his|man|boy|father|son|brother|husband|mr|male)\b/
    )
  ) {
    gender = 'male';
  } else {
    // If no clear gender indicators, default to male (could be made random)
    gender = 'male';
  }

  // Age detection based on common indicators
  let ageCategory: 'young' | 'old' = 'young';
  if (
    personaText.match(
      /\b(young|youth|teenage|child|kid|student|apprentice|junior|novice|maiden)\b/
    )
  ) {
    ageCategory = 'young';
  } else if (
    personaText.match(
      /\b(old|elderly|senior|veteran|experienced|wise|retired|grandfather|grandmother|elder|ancient)\b/
    )
  ) {
    ageCategory = 'old';
  } else if (
    personaText.match(
      /\b(middle-aged|adult|parent|established|seasoned|mature)\b/
    )
  ) {
    // For middle-aged, lean towards old
    ageCategory = 'old';
  } else {
    // If no clear age indicators, default to young
    ageCategory = 'young';
  }

  return { gender, ageCategory };
}

/**
 * Get a default voice ID based on index for testing
 * This ensures we always have valid voice IDs even if the dynamic selection fails
 */
export function getDefaultVoiceId(index: number): string {
  const defaultVoices = [
    'ErXwobaYiN019PkySvjV', // Antoni - young male
    'LcfcDJNUP1GQjkzn1xUU', // Emily - young female
    'flq6f7yk4E4fJM5XTYuZ', // Michael - old male
    'Xb7hH8MSUJpSbSDYk0k2', // Alice - adult female
    'TxGEqnHWrfWFTfGW9XjX', // Josh - young male
    'ThT5KcBeYPX3keUQqHPh', // Dorothy - young female
    'ZQe5CZNOzWyzPSCn5a3c', // James - old male
    'pMsXgVXv3BLzUgSXRplE', // Serena - middle-aged female
  ];

  return defaultVoices[index % defaultVoices.length];
}

/**
 * Check if a character should be considered "wise" based on their role or persona
 * @param role - The character's role (e.g., 'Moderator', 'Seer', etc.)
 * @param persona - The character's persona
 * @returns true if character should use wise voice
 */
export function isWiseCharacter(
  role?: string,
  persona?: { name: string; backstory: string; personalityTraits: string[] }
): boolean {
  // Moderator always gets wise voice
  if (role === 'Moderator') {
    return true;
  }

  // Check persona for wise characteristics
  if (persona) {
    const personaText =
      `${persona.name} ${persona.backstory} ${persona.personalityTraits.join(' ')}`.toLowerCase();

    if (
      personaText.match(
        /\b(wise|sage|elder|mentor|teacher|philosopher|oracle|mystic|learned|scholarly)\b/
      )
    ) {
      return true;
    }
  }

  return false;
}
