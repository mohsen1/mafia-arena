import { RoleName } from '@/lib/engine/interfaces/IRole';

export interface AvatarOptions {
  seed: string; // Unique identifier for consistent generation
  role?: RoleName;
  gender?: 'male' | 'female' | 'neutral';
  age?: 'young' | 'middle' | 'old';
  theme?: string;
  style?: 'realistic' | 'cartoon' | 'pixel' | 'abstract';
}

export interface AvatarColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}

// Color palettes for different roles and themes
const ROLE_COLORS: Record<RoleName, AvatarColors> = {
  [RoleName.Villager]: {
    primary: '#8B4513', // Brown
    secondary: '#DEB887', // Burlywood
    accent: '#228B22', // Forest Green
    background: '#F5DEB3', // Wheat
  },
  [RoleName.Mafia]: {
    primary: '#2F4F4F', // Dark Slate Gray
    secondary: '#696969', // Dim Gray
    accent: '#8B0000', // Dark Red
    background: '#1C1C1C', // Very Dark Gray
  },
  [RoleName.Seer]: {
    primary: '#4B0082', // Indigo
    secondary: '#9370DB', // Medium Purple
    accent: '#FFD700', // Gold
    background: '#E6E6FA', // Lavender
  },
  [RoleName.Doctor]: {
    primary: '#006400', // Dark Green
    secondary: '#90EE90', // Light Green
    accent: '#FF6347', // Tomato (for medical cross)
    background: '#F0FFF0', // Honeydew
  },
};

// Generate a hash from string for consistent randomization
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// Get a seeded random number between 0 and 1
function seededRandom(seed: string, index: number = 0): number {
  const hash = hashString(seed + index);
  return (hash % 1000) / 1000;
}

// Generate initials from name
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

// Generate avatar SVG
export function generateAvatarSVG(options: AvatarOptions): string {
  const colors = options.role
    ? ROLE_COLORS[options.role]
    : {
        primary: `hsl(${seededRandom(options.seed) * 360}, 70%, 50%)`,
        secondary: `hsl(${seededRandom(options.seed, 1) * 360}, 60%, 70%)`,
        accent: `hsl(${seededRandom(options.seed, 2) * 360}, 80%, 60%)`,
        background: `hsl(${seededRandom(options.seed, 3) * 360}, 30%, 90%)`,
      };

  const style = options.style || 'abstract';

  if (style === 'abstract') {
    return generateAbstractAvatar(options.seed, colors);
  } else if (style === 'pixel') {
    return generatePixelAvatar(options.seed, colors);
  } else {
    return generateGeometricAvatar(options.seed, colors);
  }
}

// Generate abstract pattern avatar
function generateAbstractAvatar(seed: string, colors: AvatarColors): string {
  const shapes = [];
  const shapeCount = 3 + Math.floor(seededRandom(seed, 10) * 3);

  for (let i = 0; i < shapeCount; i++) {
    const shapeType = Math.floor(seededRandom(seed, 20 + i) * 3);
    const x = seededRandom(seed, 30 + i) * 80 + 10;
    const y = seededRandom(seed, 40 + i) * 80 + 10;
    const size = seededRandom(seed, 50 + i) * 30 + 20;
    const rotation = seededRandom(seed, 60 + i) * 360;
    const opacity = 0.3 + seededRandom(seed, 70 + i) * 0.7;
    const color = i % 2 === 0 ? colors.primary : colors.secondary;

    if (shapeType === 0) {
      // Circle
      shapes.push(
        `<circle cx="${x}" cy="${y}" r="${size / 2}" fill="${color}" opacity="${opacity}" />`
      );
    } else if (shapeType === 1) {
      // Rectangle
      shapes.push(
        `<rect x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" fill="${color}" opacity="${opacity}" transform="rotate(${rotation} ${x} ${y})" />`
      );
    } else {
      // Triangle
      const points = `${x},${y - size / 2} ${x - size / 2},${y + size / 2} ${x + size / 2},${y + size / 2}`;
      shapes.push(
        `<polygon points="${points}" fill="${color}" opacity="${opacity}" transform="rotate(${rotation} ${x} ${y})" />`
      );
    }
  }

  return `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="${colors.background}" />
      <g style="mix-blend-mode: multiply">
        ${shapes.join('\n')}
      </g>
      <circle cx="50" cy="50" r="45" fill="none" stroke="${colors.accent}" stroke-width="2" opacity="0.5" />
    </svg>
  `;
}

// Generate pixel art avatar
function generatePixelAvatar(seed: string, colors: AvatarColors): string {
  const gridSize = 8;
  const pixelSize = 100 / gridSize;
  const pixels = [];

  // Generate symmetric pattern
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize / 2; x++) {
      if (seededRandom(seed, y * gridSize + x) > 0.5) {
        const color =
          seededRandom(seed, 100 + y * gridSize + x) > 0.5
            ? colors.primary
            : colors.secondary;

        // Left side
        pixels.push(
          `<rect x="${x * pixelSize}" y="${y * pixelSize}" width="${pixelSize}" height="${pixelSize}" fill="${color}" />`
        );

        // Right side (mirror)
        pixels.push(
          `<rect x="${(gridSize - x - 1) * pixelSize}" y="${y * pixelSize}" width="${pixelSize}" height="${pixelSize}" fill="${color}" />`
        );
      }
    }
  }

  return `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="${colors.background}" />
      ${pixels.join('\n')}
      <rect width="100" height="100" fill="none" stroke="${colors.accent}" stroke-width="2" />
    </svg>
  `;
}

// Generate geometric pattern avatar
function generateGeometricAvatar(seed: string, colors: AvatarColors): string {
  const patterns = [];
  const patternType = Math.floor(seededRandom(seed, 200) * 3);

  if (patternType === 0) {
    // Concentric circles
    for (let i = 0; i < 4; i++) {
      const radius = 40 - i * 10;
      const color = i % 2 === 0 ? colors.primary : colors.secondary;
      patterns.push(
        `<circle cx="50" cy="50" r="${radius}" fill="${color}" opacity="${0.8 - i * 0.1}" />`
      );
    }
  } else if (patternType === 1) {
    // Radiating lines
    const lineCount = 8;
    for (let i = 0; i < lineCount; i++) {
      const angle = (i / lineCount) * Math.PI * 2;
      const x2 = 50 + Math.cos(angle) * 45;
      const y2 = 50 + Math.sin(angle) * 45;
      const color = i % 2 === 0 ? colors.primary : colors.secondary;
      patterns.push(
        `<line x1="50" y1="50" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="3" opacity="0.7" />`
      );
    }
    patterns.push(`<circle cx="50" cy="50" r="15" fill="${colors.accent}" />`);
  } else {
    // Nested squares
    for (let i = 0; i < 4; i++) {
      const size = 80 - i * 20;
      const offset = (100 - size) / 2;
      const rotation = i * 15;
      const color = i % 2 === 0 ? colors.primary : colors.secondary;
      patterns.push(
        `<rect x="${offset}" y="${offset}" width="${size}" height="${size}" fill="${color}" opacity="${0.8 - i * 0.1}" transform="rotate(${rotation} 50 50)" />`
      );
    }
  }

  return `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="${colors.background}" />
      <g>
        ${patterns.join('\n')}
      </g>
    </svg>
  `;
}

// Generate avatar data URL
export function generateAvatarDataURL(options: AvatarOptions): string {
  const svg = generateAvatarSVG(options);
  const base64 = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${base64}`;
}

// Generate fallback avatar with initials
export function generateInitialsAvatar(
  name: string,
  backgroundColor?: string,
  textColor?: string
): string {
  const initials = getInitials(name);
  const bg = backgroundColor || `hsl(${hashString(name) % 360}, 70%, 50%)`;
  const color = textColor || '#ffffff';

  const svg = `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="${bg}" />
      <text x="50" y="50" font-family="Arial, sans-serif" font-size="36" font-weight="bold" 
            text-anchor="middle" dominant-baseline="central" fill="${color}">
        ${initials}
      </text>
    </svg>
  `;

  const base64 = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${base64}`;
}
