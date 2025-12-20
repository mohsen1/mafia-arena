#!/usr/bin/env node
/**
 * visual-review.js
 *
 * Takes screenshots of Mafia Arena pages and sends them to Gemini
 * for a visual UX/design review using the Files API.
 *
 * Usage:
 *   ./scripts/visual-review.js
 *
 * Prerequisites:
 *   - GOOGLE_API_KEY in .dev.vars
 *   - npm install puppeteer (or use npx)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";

const BASE_URL = "https://mafia-arena-frontend.pages.dev";

const PAGES_TO_CAPTURE = [
  { path: "/", name: "01-homepage", description: "Homepage/Leaderboard with hero cards and performance tables" },
  { path: "/games", name: "02-games-list", description: "Games list with matchups, winners, and pagination" },
  { path: "/games?page=1", name: "03-games-page1", description: "First page of games", clickFirst: true },
  { path: "/analysis", name: "04-analysis", description: "Persona Analysis page (empty state)" },
  { path: "/stats", name: "05-stats-overview", description: "Stats Overview with dashboard cards" },
  { path: "/stats/matchups", name: "06-stats-matchups", description: "Head-to-head matchup matrix" },
  { path: "/stats/costs", name: "07-stats-costs", description: "Cost analysis breakdown" },
  { path: "/stats/trends", name: "08-stats-trends", description: "Activity trends over time" },
  { path: "/about", name: "09-about", description: "About page with tech stack" },
  { path: "/admin", name: "10-admin-login", description: "Admin login form" },
];

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex);
    let value = trimmed.slice(eqIndex + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function getApiKey() {
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const devVars = loadEnvFile(path.join(REPO_ROOT, ".dev.vars"));
  if (devVars.GOOGLE_API_KEY) return devVars.GOOGLE_API_KEY;
  return null;
}

async function captureScreenshots() {
  const screenshotsDir = path.join(REPO_ROOT, "screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  log("\n📸 Capturing screenshots with Puppeteer...", colors.cyan);
  
  // Dynamic import of puppeteer
  let puppeteer;
  try {
    puppeteer = (await import("puppeteer")).default;
  } catch {
    log("Installing puppeteer...", colors.yellow);
    execSync("pnpm add -D puppeteer", { cwd: REPO_ROOT, stdio: "inherit" });
    puppeteer = (await import("puppeteer")).default;
  }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const screenshots = [];

  for (const pageConfig of PAGES_TO_CAPTURE) {
    const url = `${BASE_URL}${pageConfig.path}`;
    log(`  → ${pageConfig.name}: ${url}`, colors.dim);
    
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 500)); // Let animations settle
    
    const filename = `${pageConfig.name}.png`;
    const filepath = path.join(screenshotsDir, filename);
    
    await page.screenshot({ path: filepath, fullPage: false });
    
    screenshots.push({
      path: filepath,
      name: pageConfig.name,
      description: pageConfig.description,
    });
  }

  // Capture dark mode versions
  log("\n🌙 Capturing dark mode...", colors.cyan);
  
  await page.goto(BASE_URL, { waitUntil: "networkidle2" });
  // Click theme toggle
  await page.click('button[aria-label="Toggle theme"], button:has(svg)');
  await new Promise(r => setTimeout(r, 300));

  const darkPages = [
    { path: "/", name: "11-homepage-dark", description: "Homepage in dark mode" },
    { path: "/games", name: "12-games-dark", description: "Games list in dark mode" },
    { path: "/stats", name: "13-stats-dark", description: "Stats in dark mode" },
  ];

  for (const pageConfig of darkPages) {
    const url = `${BASE_URL}${pageConfig.path}`;
    log(`  → ${pageConfig.name}: ${url}`, colors.dim);
    
    await page.goto(url, { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 500));
    
    const filename = `${pageConfig.name}.png`;
    const filepath = path.join(screenshotsDir, filename);
    
    await page.screenshot({ path: filepath, fullPage: false });
    
    screenshots.push({
      path: filepath,
      name: pageConfig.name,
      description: pageConfig.description,
    });
  }

  // Capture a game detail and replay page
  log("\n🎮 Capturing game detail pages...", colors.cyan);
  
  // Go back to light mode
  await page.goto(BASE_URL, { waitUntil: "networkidle2" });
  await page.click('button[aria-label="Toggle theme"], button:has(svg)').catch(() => {});
  await new Promise(r => setTimeout(r, 300));
  
  await page.goto(`${BASE_URL}/games`, { waitUntil: "networkidle2" });
  
  // Click first game row
  const gameLink = await page.$("table tbody tr");
  if (gameLink) {
    await gameLink.click();
    await page.waitForNavigation({ waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 500));
    
    const filepath = path.join(screenshotsDir, "14-game-detail.png");
    await page.screenshot({ path: filepath, fullPage: false });
    screenshots.push({
      path: filepath,
      name: "14-game-detail",
      description: "Individual game result page",
    });

    // Click replay button if exists
    const replayBtn = await page.$('a[href*="replay"]');
    if (replayBtn) {
      await replayBtn.click();
      await page.waitForNavigation({ waitUntil: "networkidle2" });
      await new Promise(r => setTimeout(r, 500));
      
      const replayPath = path.join(screenshotsDir, "15-game-replay.png");
      await page.screenshot({ path: replayPath, fullPage: false });
      screenshots.push({
        path: replayPath,
        name: "15-game-replay",
        description: "Game replay transcript",
      });
    }
  }

  await browser.close();
  
  log(`\n${colors.green}✓ Captured ${screenshots.length} screenshots${colors.reset}`);
  return screenshots;
}

async function uploadToGemini(apiKey, filepath) {
  const filename = path.basename(filepath);
  const fileData = fs.readFileSync(filepath);
  const base64Data = fileData.toString("base64");
  
  // Upload file
  const uploadUrl = `${GEMINI_API_URL}/files?key=${apiKey}`;
  
  const metadata = {
    file: {
      displayName: filename,
    },
  };
  
  // Use resumable upload for larger files
  const initResponse = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": fileData.length.toString(),
      "X-Goog-Upload-Header-Content-Type": "image/png",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { displayName: filename } }),
  });
  
  if (!initResponse.ok) {
    const err = await initResponse.text();
    throw new Error(`Failed to init upload: ${err}`);
  }
  
  const uploadUri = initResponse.headers.get("X-Goog-Upload-URL");
  
  // Upload the actual data
  const uploadResponse = await fetch(uploadUri, {
    method: "PUT",
    headers: {
      "Content-Length": fileData.length.toString(),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: fileData,
  });
  
  if (!uploadResponse.ok) {
    const err = await uploadResponse.text();
    throw new Error(`Failed to upload: ${err}`);
  }
  
  const result = await uploadResponse.json();
  return result.file;
}

async function askGeminiWithImages(apiKey, screenshots, question) {
  log("\n📤 Uploading images to Gemini...", colors.cyan);
  
  const uploadedFiles = [];
  for (const screenshot of screenshots) {
    log(`  → Uploading ${screenshot.name}...`, colors.dim);
    const file = await uploadToGemini(apiKey, screenshot.path);
    uploadedFiles.push({
      ...screenshot,
      fileUri: file.uri,
      mimeType: file.mimeType,
    });
  }
  
  log(`\n${colors.green}✓ Uploaded ${uploadedFiles.length} images${colors.reset}`);
  
  // Build multimodal request
  const parts = [];
  
  // Add each image with description
  for (const file of uploadedFiles) {
    parts.push({
      fileData: {
        mimeType: file.mimeType,
        fileUri: file.fileUri,
      },
    });
    parts.push({
      text: `[Screenshot: ${file.name}] ${file.description}`,
    });
  }
  
  // Add the question
  parts.push({ text: `\n\n${question}` });
  
  const requestBody = {
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    systemInstruction: {
      parts: [{
        text: `You are an expert UX designer and frontend developer reviewing a web application called "Mafia Arena" - an AI benchmark platform that has Large Language Models play the social deduction game Mafia against each other.

You have been provided with screenshots of all the key pages. Analyze the visual design, UX patterns, information architecture, and overall polish.

Be specific in your feedback - reference exact elements you see in the screenshots. Be critical but constructive.`,
      }],
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
  };
  
  log("\n🤖 Asking Gemini for visual review...", colors.cyan);
  
  const response = await fetch(`${GEMINI_API_URL}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${err}`);
  }
  
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!text) {
    throw new Error("No response from Gemini");
  }
  
  return text;
}

async function main() {
  const apiKey = getApiKey();
  if (!apiKey) {
    log("Error: GOOGLE_API_KEY not found in .dev.vars", colors.red);
    process.exit(1);
  }
  
  log(`${colors.cyan}${colors.bright}🎭 Mafia Arena Visual Review${colors.reset}`, colors.cyan);
  log(`${colors.dim}Capturing screenshots and sending to Gemini for UX analysis${colors.reset}\n`);
  
  // Capture screenshots
  const screenshots = await captureScreenshots();
  
  // Send to Gemini for review
  const question = `Please provide a comprehensive UX and visual design review covering:

1. **Visual Design Quality**: Typography, color scheme, spacing, visual hierarchy, card designs
2. **Information Architecture**: Is the navigation intuitive? Can users find what they need?
3. **Data Visualization**: Are the leaderboards, tables, and stats presented clearly?
4. **Empty States**: How well does any empty state communicate next steps?
5. **Game Replay UX**: Is the transcript readable and easy to follow?
6. **Dark/Light Mode**: Is the theme implementation consistent?
7. **Responsiveness**: Any obvious issues from the desktop viewport?
8. **Overall Polish**: Does it feel production-ready?
9. **Specific Issues**: Call out any UX problems or visual inconsistencies
10. **Top 10 Recommendations**: Concrete improvements to prioritize

Be thorough and specific - reference what you see in the actual screenshots.`;

  const review = await askGeminiWithImages(apiKey, screenshots, question);
  
  console.log(`\n${colors.green}${colors.bright}━━━ Visual Review ━━━${colors.reset}\n`);
  console.log(review);
  console.log(`\n${colors.green}━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
  
  // Save review to file
  const reviewPath = path.join(REPO_ROOT, "screenshots", "visual-review.md");
  fs.writeFileSync(reviewPath, `# Mafia Arena Visual Review\n\n${review}`);
  log(`📝 Review saved to: screenshots/visual-review.md`, colors.green);
}

main().catch((err) => {
  log(`Error: ${err.message}`, colors.red);
  console.error(err);
  process.exit(1);
});

