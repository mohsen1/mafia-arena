import path from 'node:path';

const BASE_IMAGE_PATH = path.join(
  process.cwd(),
  'public',
  'images',
  'characters'
);

// Predefined list of character images that we know exist based on the actual files
const KNOWN_IMAGES = {
  'male-young': [
    'unnamed.png',
    'unnamed-0.png',
    'unnamed-1.png',
    'unnamed-2.png',
    'unnamed-3.png',
    'unnamed-4.png',
    'unnamed-6.png',
  ],
  'female-young': [
    'unnamed.png',
    'unnamed-1.png',
    'unnamed-3.png',
    'unnamed-4.png',
    'unnamed-5.png',
    'unnamed-6.png',
    'unnamed-7.png',
    'unnamed-8.png',
    'unnamed-9.png',
  ],
  'male-old': [
    'unnamed-1.png',
    'unnamed-2.png',
    'unnamed-3.png',
    'unnamed-6.png',
    'unnamed-7.png',
    'unnamed-8.png',
  ],
  'female-old': [
    'unnamed.png',
    'unnamed-1.png',
    'unnamed-8.png',
    'unnamed-12.png',
    'unnamed-13.png',
    'unnamed-14.png',
  ],
};

let imageCache: Record<string, string[]> = {};
let cacheInitialized = false;
// Track used images to avoid duplicates within a game
const usedImages: Set<string> = new Set();

/**
 * Pre-loads the list of available character images for each category.
 */
async function initializeImageCache(): Promise<void> {
  if (cacheInitialized) {
    console.log('[ImageUtils] Image cache already initialized');
    return;
  }
  console.log('[ImageUtils] Initializing character image cache...');
  console.log('[ImageUtils] Base image path:', BASE_IMAGE_PATH);

  // Use the predefined list instead of reading from file system
  imageCache = KNOWN_IMAGES;
  cacheInitialized = true;
  console.log(
    '[ImageUtils] Image cache initialization complete. Cache contents:',
    Object.entries(imageCache).map(
      ([key, files]) => `${key}: ${files.length} files`
    )
  );
}

/**
 * Reset the used images tracker. Should be called when starting a new game.
 */
export function resetUsedImages(): void {
  usedImages.clear();
  console.log('[ImageUtils] Reset used images tracker');
}

/**
 * Selects a character image path based on gender and age category.
 * Tries to avoid duplicates by tracking used images.
 *
 * @param gender - 'male' or 'female'
 * @param ageCategory - 'young' or 'old'
 * @returns A relative URL path to an image (e.g., '/images/characters/male/old/unnamed-10.png') or null if no suitable image is found.
 */
export async function selectCharacterImage(
  gender: 'male' | 'female',
  ageCategory: 'young' | 'old'
): Promise<string | null> {
  console.log(`[ImageUtils] Selecting image for ${gender} ${ageCategory}`);

  await initializeImageCache();

  const key = `${gender}-${ageCategory}`;
  const availableImages = imageCache[key];

  if (!availableImages || availableImages.length === 0) {
    console.warn(`No images found for category: ${key}`);
    return null;
  }

  console.log(`[ImageUtils] Found ${availableImages.length} images for ${key}`);

  // Filter out already used images
  const unusedImages = availableImages.filter((imageName) => {
    const fullPath = `/images/characters/${gender}/${ageCategory}/${imageName}`;
    return !usedImages.has(fullPath);
  });

  // If all images are used, reset and use all available images
  const imagesToChooseFrom =
    unusedImages.length > 0 ? unusedImages : availableImages;

  if (unusedImages.length === 0) {
    console.log(
      `[ImageUtils] All images in ${key} category have been used, recycling images`
    );
  }

  const randomIndex = Math.floor(Math.random() * imagesToChooseFrom.length);
  const imageName = imagesToChooseFrom[randomIndex];

  const imageUrl = `/images/characters/${gender}/${ageCategory}/${imageName}`;

  // Mark this image as used
  usedImages.add(imageUrl);

  console.log(`[ImageUtils] Selected image: ${imageUrl}`);

  return imageUrl;
}

/**
 * Analyzes a persona to determine appropriate gender and age category for image selection.
 *
 * @param persona - The character persona containing name, backstory, and traits
 * @returns Object with gender and ageCategory
 */
export function analyzePersonaForImage(persona: {
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
 * Get a default character image based on index for testing
 * This ensures we always have valid images even if the dynamic selection fails
 */
export function getDefaultCharacterImage(index: number): string {
  // We know these images exist based on the file listing
  const defaultImages = [
    '/images/characters/male/young/unnamed.png',
    '/images/characters/female/young/unnamed-1.png',
    '/images/characters/male/old/unnamed-1.png',
    '/images/characters/female/old/unnamed-1.png',
    '/images/characters/male/young/unnamed-2.png',
    '/images/characters/female/young/unnamed-5.png',
    '/images/characters/male/old/unnamed-7.png',
    '/images/characters/female/old/unnamed-8.png',
  ];

  return defaultImages[index % defaultImages.length];
}
