import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_IMAGE_PATH = path.join(
  process.cwd(),
  'public',
  'images',
  'characters'
);

let imageCache: Record<string, string[]> = {};
let cacheInitialized = false;

/**
 * Pre-loads the list of available character images for each category.
 */
async function initializeImageCache(): Promise<void> {
  if (cacheInitialized) return;
  console.log('Initializing character image cache...');
  imageCache = {};
  const genders = ['male', 'female'];
  const ages = ['young', 'old'];

  for (const gender of genders) {
    for (const age of ages) {
      const dirPath = path.join(BASE_IMAGE_PATH, gender, age);
      const key = `${gender}-${age}`;
      try {
        await fs.access(dirPath);
        const files = await fs.readdir(dirPath);
        imageCache[key] = files.filter((f) => f.match(/\.(png|jpe?g|webp)$/i));
        console.log(`Cached ${imageCache[key].length} images for ${key}`);
      } catch (error) {
        if (
          error instanceof Error &&
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ENOENT'
        ) {
          console.warn(`Image directory not found, skipping cache: ${dirPath}`);
          imageCache[key] = [];
        } else {
          console.error(`Error reading image directory ${dirPath}:`, error);
          imageCache[key] = [];
        }
      }
    }
  }
  cacheInitialized = true;
  console.log('Image cache initialization complete.');
}

/**
 * Selects a random character image path based on gender and age category.
 *
 * @param gender - 'male' or 'female'
 * @param ageCategory - 'young' or 'old'
 * @returns A relative URL path to an image (e.g., '/images/characters/male/old/unnamed-10.png') or null if no suitable image is found.
 */
export async function selectCharacterImage(
  gender: 'male' | 'female',
  ageCategory: 'young' | 'old'
): Promise<string | null> {
  await initializeImageCache();

  const key = `${gender}-${ageCategory}`;
  const availableImages = imageCache[key];

  if (!availableImages || availableImages.length === 0) {
    console.warn(`No images found for category: ${key}`);
    return null;
  }

  const randomIndex = Math.floor(Math.random() * availableImages.length);
  const imageName = availableImages[randomIndex];

  const imageUrl = `/images/characters/${gender}/${ageCategory}/${imageName}`;

  return imageUrl;
}
