// Import all character images for Next.js optimization
// These imports ensure the images are properly processed by Next.js build system

// Special images
import modImage from '../../../public/images/characters/mod.png';

// Male Young
import maleYoung0 from '../../../public/images/characters/male/young/unnamed.png';
import maleYoung1 from '../../../public/images/characters/male/young/unnamed-0.png';
import maleYoung2 from '../../../public/images/characters/male/young/unnamed-1.png';
import maleYoung3 from '../../../public/images/characters/male/young/unnamed-2.png';
import maleYoung4 from '../../../public/images/characters/male/young/unnamed-3.png';
import maleYoung5 from '../../../public/images/characters/male/young/unnamed-4.png';
import maleYoung6 from '../../../public/images/characters/male/young/unnamed-6.png';

// Male Old
import maleOld1 from '../../../public/images/characters/male/old/unnamed-2.png';
import maleOld2 from '../../../public/images/characters/male/old/unnamed-3.png';
import maleOld3 from '../../../public/images/characters/male/old/unnamed-7.png';
import maleOld4 from '../../../public/images/characters/male/old/unnamed-9.png';
import maleOld5 from '../../../public/images/characters/male/old/unnamed-10.png';
import maleOld6 from '../../../public/images/characters/male/old/unnamed-11.png';

// Female Young
import femaleYoung0 from '../../../public/images/characters/female/young/unnamed.png';
import femaleYoung1 from '../../../public/images/characters/female/young/unnamed-1.png';
import femaleYoung2 from '../../../public/images/characters/female/young/unnamed-3.png';
import femaleYoung3 from '../../../public/images/characters/female/young/unnamed-4.png';
import femaleYoung4 from '../../../public/images/characters/female/young/unnamed-5.png';
import femaleYoung5 from '../../../public/images/characters/female/young/unnamed-6.png';
import femaleYoung6 from '../../../public/images/characters/female/young/unnamed-7.png';
import femaleYoung7 from '../../../public/images/characters/female/young/unnamed-8.png';
import femaleYoung8 from '../../../public/images/characters/female/young/unnamed-9.png';

// Female Old
import femaleOld0 from '../../../public/images/characters/female/old/unnamed.png';
import femaleOld1 from '../../../public/images/characters/female/old/unnamed-1.png';
import femaleOld2 from '../../../public/images/characters/female/old/unnamed-8.png';
import femaleOld3 from '../../../public/images/characters/female/old/unnamed-12.png';
import femaleOld4 from '../../../public/images/characters/female/old/unnamed-13.png';
import femaleOld5 from '../../../public/images/characters/female/old/unnamed-14.png';

// Export character images organized by category
export const CHARACTER_IMAGES = {
  special: {
    moderator: modImage,
  },
  male: {
    young: [
      { src: maleYoung0, path: '/images/characters/male/young/unnamed.png' },
      { src: maleYoung1, path: '/images/characters/male/young/unnamed-0.png' },
      { src: maleYoung2, path: '/images/characters/male/young/unnamed-1.png' },
      { src: maleYoung3, path: '/images/characters/male/young/unnamed-2.png' },
      { src: maleYoung4, path: '/images/characters/male/young/unnamed-3.png' },
      { src: maleYoung5, path: '/images/characters/male/young/unnamed-4.png' },
      { src: maleYoung6, path: '/images/characters/male/young/unnamed-6.png' },
    ],
    old: [
      { src: maleOld1, path: '/images/characters/male/old/unnamed-2.png' },
      { src: maleOld2, path: '/images/characters/male/old/unnamed-3.png' },
      { src: maleOld3, path: '/images/characters/male/old/unnamed-7.png' },
      { src: maleOld4, path: '/images/characters/male/old/unnamed-9.png' },
      { src: maleOld5, path: '/images/characters/male/old/unnamed-10.png' },
      { src: maleOld6, path: '/images/characters/male/old/unnamed-11.png' },
    ],
  },
  female: {
    young: [
      {
        src: femaleYoung0,
        path: '/images/characters/female/young/unnamed.png',
      },
      {
        src: femaleYoung1,
        path: '/images/characters/female/young/unnamed-1.png',
      },
      {
        src: femaleYoung2,
        path: '/images/characters/female/young/unnamed-3.png',
      },
      {
        src: femaleYoung3,
        path: '/images/characters/female/young/unnamed-4.png',
      },
      {
        src: femaleYoung4,
        path: '/images/characters/female/young/unnamed-5.png',
      },
      {
        src: femaleYoung5,
        path: '/images/characters/female/young/unnamed-6.png',
      },
      {
        src: femaleYoung6,
        path: '/images/characters/female/young/unnamed-7.png',
      },
      {
        src: femaleYoung7,
        path: '/images/characters/female/young/unnamed-8.png',
      },
      {
        src: femaleYoung8,
        path: '/images/characters/female/young/unnamed-9.png',
      },
    ],
    old: [
      { src: femaleOld0, path: '/images/characters/female/old/unnamed.png' },
      { src: femaleOld1, path: '/images/characters/female/old/unnamed-1.png' },
      { src: femaleOld2, path: '/images/characters/female/old/unnamed-8.png' },
      { src: femaleOld3, path: '/images/characters/female/old/unnamed-12.png' },
      { src: femaleOld4, path: '/images/characters/female/old/unnamed-13.png' },
      { src: femaleOld5, path: '/images/characters/female/old/unnamed-14.png' },
    ],
  },
};

// Get all character image paths as a flat array for UI components
export const getAllCharacterImagePaths = (): string[] => {
  const paths: string[] = ['/images/characters/mod.png'];

  // Add all categorized images
  Object.values(CHARACTER_IMAGES.male).forEach((ageGroup) => {
    paths.push(...ageGroup.map((img) => img.path));
  });

  Object.values(CHARACTER_IMAGES.female).forEach((ageGroup) => {
    paths.push(...ageGroup.map((img) => img.path));
  });

  return paths;
};

// Helper to get a character image by path
export const getCharacterImageByPath = (path: string) => {
  if (path === '/images/characters/mod.png') {
    return CHARACTER_IMAGES.special.moderator;
  }

  // Search through all categories
  for (const gender of ['male', 'female'] as const) {
    for (const age of ['young', 'old'] as const) {
      const found = CHARACTER_IMAGES[gender][age].find(
        (img) => img.path === path
      );
      if (found) {
        return found.src;
      }
    }
  }

  return null;
};
