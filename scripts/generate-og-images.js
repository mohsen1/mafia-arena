#!/usr/bin/env node
/**
 * Generate social share images and favicons from logo.png
 * 
 * Usage: node scripts/generate-og-images.js
 * 
 * Requires: pnpm add -D sharp
 * 
 * Generates:
 *   - og-image.png (1200x630) - Social share card for Twitter, Facebook, iMessage
 *   - apple-touch-icon.png (180x180) - iOS home screen icon
 *   - favicon-16.png, favicon-32.png, favicon-48.png - Browser favicons
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '../frontend/public');

// Cream background color matching the logo
const BG_COLOR = { r: 250, g: 250, b: 247, alpha: 1 };

async function generateImages() {
  try {
    const sharp = (await import('sharp')).default;
    
    const logoPath = join(publicDir, 'logo.jpeg');
    
    // =====================
    // OG Image (1200x630)
    // =====================
    const ogWidth = 1200;
    const ogHeight = 630;
    const logoSize = 400;
    const padding = 80;
    
    const logo = await sharp(logoPath)
      .resize(logoSize, logoSize, { fit: 'contain', background: BG_COLOR })
      .toBuffer();
    
    await sharp({
      create: {
        width: ogWidth,
        height: ogHeight,
        channels: 4,
        background: BG_COLOR
      }
    })
    .composite([
      {
        input: logo,
        left: padding,
        top: Math.floor((ogHeight - logoSize) / 2)
      },
      {
        input: Buffer.from(`
          <svg width="${ogWidth - logoSize - padding * 3}" height="${ogHeight}">
            <style>
              .title { font-family: system-ui, -apple-system, sans-serif; font-size: 64px; font-weight: 700; fill: #1a1a2e; }
              .subtitle { font-family: system-ui, -apple-system, sans-serif; font-size: 24px; fill: #64748b; }
              .domain { font-family: system-ui, -apple-system, sans-serif; font-size: 20px; fill: #94a3b8; }
            </style>
            <text x="0" y="240" class="title">Mafia Arena</text>
            <text x="0" y="290" class="subtitle">LLMs playing social deduction</text>
            <text x="0" y="330" class="subtitle">against each other</text>
            <text x="0" y="420" class="domain">mafia-arena.com</text>
          </svg>
        `),
        left: logoSize + padding * 2,
        top: 0
      }
    ])
    .png()
    .toFile(join(publicDir, 'og-image.png'));
    
    console.log('✓ og-image.png (1200x630)');
    
    // =====================
    // Apple Touch Icon (180x180)
    // =====================
    await sharp(logoPath)
      .resize(180, 180, { fit: 'cover', position: 'center' })
      .png()
      .toFile(join(publicDir, 'apple-touch-icon.png'));
    
    console.log('✓ apple-touch-icon.png (180x180)');
    
    // =====================
    // Favicons (16, 32, 48)
    // =====================
    const faviconSizes = [16, 32, 48];
    for (const size of faviconSizes) {
      await sharp(logoPath)
        .resize(size, size, { fit: 'contain', background: BG_COLOR })
        .png()
        .toFile(join(publicDir, `favicon-${size}.png`));
      console.log(`✓ favicon-${size}.png`);
    }
    
    console.log('\n✨ All images generated successfully!');
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      console.log('📦 sharp not installed.');
      console.log('\nTo generate images, run:');
      console.log('  pnpm add -D sharp');
      console.log('  node scripts/generate-og-images.js');
    } else {
      console.error('Error:', err);
    }
  }
}

generateImages();

