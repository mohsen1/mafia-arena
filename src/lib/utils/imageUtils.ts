import fs from "node:fs/promises";
import path from "node:path";

const BASE_IMAGE_PATH = path.join(
  process.cwd(),
  "public",
  "images",
  "characters",
);

// Cache image file lists to avoid repeated fs calls
let imageCache: Record<string, string[]> = {};
let cacheInitialized = false;

/**
 * Pre-loads the list of available character images for each category.
 */
async function initializeImageCache(): Promise<void> {
  if (cacheInitialized) return;
  console.log("Initializing character image cache...");
  imageCache = {};
  const genders = ["male", "female"];
  const ages = ["young", "old"];

  for (const gender of genders) {
    for (const age of ages) {
      const dirPath = path.join(BASE_IMAGE_PATH, gender, age);
      const key = `${gender}-${age}`;
      try {
        // Check if directory exists before trying to read
        await fs.access(dirPath);
        const files = await fs.readdir(dirPath);
        // Filter for image files (e.g., png, jpg)
        imageCache[key] = files.filter((f) => f.match(/\.(png|jpe?g|webp)$/i));
        console.log(`Cached ${imageCache[key].length} images for ${key}`);
      } catch (error) {
        // Check if it's an error object with a code property
        if (
          error instanceof Error &&
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          console.warn(`Image directory not found, skipping cache: ${dirPath}`);
          imageCache[key] = [];
        } else {
          // For other errors, log more seriously
          console.error(`Error reading image directory ${dirPath}:`, error);
          imageCache[key] = []; // Ensure cache entry exists but is empty
        }
      }
    }
  }
  cacheInitialized = true;
  console.log("Image cache initialization complete.");
}

/**
 * Selects a random character image path based on gender and age category.
 *
 * @param gender - 'male' or 'female'
 * @param ageCategory - 'young' or 'old'
 * @returns A relative URL path to an image (e.g., '/images/characters/male/old/unnamed-10.png') or null if no suitable image is found.
 */
export async function selectCharacterImage(
  gender: "male" | "female",
  ageCategory: "young" | "old",
): Promise<string | null> {
  await initializeImageCache(); // Ensure cache is loaded

  const key = `${gender}-${ageCategory}`;
  const availableImages = imageCache[key];

  if (!availableImages || availableImages.length === 0) {
    console.warn(`No images found for category: ${key}`);
    return null; // No images available for this combination
  }

  // Select a random image from the list
  const randomIndex = Math.floor(Math.random() * availableImages.length);
  const imageName = availableImages[randomIndex];

  // Construct the relative URL path
  const imageUrl = `/images/characters/${gender}/${ageCategory}/${imageName}`;

  return imageUrl;
}

// Initialize cache on module load (can be adjusted if needed)
// Note: Top-level await might not be supported everywhere,
// calling initializeImageCache() before first use in selectCharacterImage is safer.
// initializeImageCache();
