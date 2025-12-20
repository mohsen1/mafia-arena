
# Frontend Design Rules

This rule guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:

- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, Astro, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Typography

Choose fonts that are beautiful, unique, and interesting:

```css
/* ❌ NEVER - Generic, overused fonts */
font-family: Inter, Arial, Roboto, system-ui, sans-serif;

/* ✅ GOOD - Distinctive, characterful choices */
font-family: 'Clash Display', 'Satoshi', sans-serif;
font-family: 'PP Neue Montreal', 'Söhne', sans-serif;
font-family: 'Cabinet Grotesk', 'General Sans', sans-serif;
font-family: 'Fraunces', 'Literata', serif;
font-family: 'Space Mono', 'JetBrains Mono', monospace;
font-family: 'Playfair Display', 'Cormorant Garamond', serif;
```

### Font Pairing Strategy

Pair a distinctive display font with a refined body font:

```css
:root {
  --font-display: 'Clash Display', sans-serif;  /* Headlines, hero text */
  --font-body: 'Satoshi', sans-serif;           /* Body copy, UI elements */
  --font-mono: 'Berkeley Mono', monospace;      /* Code, data, numbers */
}

h1, h2, h3 { font-family: var(--font-display); }
body { font-family: var(--font-body); }
code, .data { font-family: var(--font-mono); }
```

## Color & Theme

Commit to a cohesive aesthetic. Use CSS variables for consistency:

```css
/* ❌ NEVER - Timid, evenly-distributed palettes */
:root {
  --color-1: #6366f1;  /* Indigo */
  --color-2: #8b5cf6;  /* Purple */
  --color-3: #a855f7;  /* Violet - the "AI gradient" trap */
}

/* ✅ GOOD - Dominant colors with sharp accents */
:root {
  /* Dark terminal aesthetic */
  --bg: #0a0a0a;
  --surface: #141414;
  --border: #262626;
  --text: #fafafa;
  --text-muted: #737373;
  --accent: #22d3ee;      /* Single vibrant accent */
  --accent-subtle: #083344;
}

/* ✅ GOOD - Editorial/luxury aesthetic */
:root {
  --bg: #fffbf5;
  --surface: #f7f3ed;
  --text: #1a1a1a;
  --text-muted: #6b6b6b;
  --accent: #c9a227;      /* Gold accent */
  --accent-deep: #8b6914;
}

/* ✅ GOOD - Brutalist/industrial */
:root {
  --bg: #e8e4df;
  --surface: #d4d0cb;
  --text: #0f0f0f;
  --accent: #ff3d00;
  --border: #0f0f0f;
}
```

## Motion & Animation

Use animations for effects and micro-interactions. Focus on high-impact moments:

```css
/* Page load with staggered reveals */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hero { animation: fadeInUp 0.6s ease-out; }
.hero-subtitle { animation: fadeInUp 0.6s ease-out 0.1s backwards; }
.hero-cta { animation: fadeInUp 0.6s ease-out 0.2s backwards; }

/* Hover states that surprise */
.card {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.card:hover {
  transform: translateY(-8px) rotate(-1deg);
}

/* Micro-interactions */
.button {
  position: relative;
  overflow: hidden;
}

.button::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
  transform: translateX(-100%);
  transition: transform 0.5s;
}

.button:hover::before {
  transform: translateX(100%);
}
```

### React/Motion Library

```tsx
import { motion } from 'framer-motion';

const stagger = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

<motion.div variants={stagger} initial="hidden" animate="visible">
  <motion.h1 variants={fadeUp}>Title</motion.h1>
  <motion.p variants={fadeUp}>Subtitle</motion.p>
  <motion.button variants={fadeUp}>CTA</motion.button>
</motion.div>
```

## Spatial Composition

Create unexpected layouts with asymmetry, overlap, and grid-breaking elements:

```css
/* Asymmetric hero layout */
.hero {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 4rem;
  align-items: end;  /* Not center - creates tension */
}

/* Overlapping elements */
.feature-card {
  position: relative;
}

.feature-card::before {
  content: attr(data-number);
  position: absolute;
  top: -2rem;
  left: -1rem;
  font-size: 8rem;
  font-weight: 900;
  opacity: 0.05;
  line-height: 1;
}

/* Grid-breaking accent */
.highlight-section {
  position: relative;
  margin-left: -5vw;
  margin-right: -5vw;
  padding: 4rem 5vw;
  background: var(--accent-subtle);
}

/* Generous negative space */
.section {
  padding: clamp(4rem, 10vh, 8rem) 0;
}

/* Controlled density */
.data-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1px;
  background: var(--border);
}

.data-cell {
  background: var(--surface);
  padding: 1.5rem;
}
```

## Backgrounds & Visual Details

Create atmosphere and depth:

```css
/* Gradient mesh background */
.bg-mesh {
  background: 
    radial-gradient(at 40% 20%, hsla(180, 80%, 50%, 0.3) 0px, transparent 50%),
    radial-gradient(at 80% 0%, hsla(200, 80%, 40%, 0.2) 0px, transparent 50%),
    radial-gradient(at 0% 50%, hsla(160, 80%, 50%, 0.2) 0px, transparent 50%),
    var(--bg);
}

/* Noise texture overlay */
.noise-overlay::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  opacity: 0.03;
  pointer-events: none;
}

/* Geometric pattern */
.pattern-dots {
  background-image: radial-gradient(var(--border) 1px, transparent 1px);
  background-size: 20px 20px;
}

/* Dramatic shadows */
.elevated-card {
  box-shadow: 
    0 1px 2px rgba(0, 0, 0, 0.07),
    0 2px 4px rgba(0, 0, 0, 0.07),
    0 4px 8px rgba(0, 0, 0, 0.07),
    0 8px 16px rgba(0, 0, 0, 0.07),
    0 16px 32px rgba(0, 0, 0, 0.07);
}

/* Glow effect */
.glow {
  box-shadow: 
    0 0 20px var(--accent),
    0 0 40px color-mix(in srgb, var(--accent) 50%, transparent),
    0 0 60px color-mix(in srgb, var(--accent) 25%, transparent);
}

/* Glassmorphism (use sparingly) */
.glass {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
```

## Anti-Patterns to Avoid

```css
/* ❌ NEVER - Generic AI aesthetics */
.ai-slop {
  font-family: Inter, system-ui;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

/* ❌ NEVER - Safe, forgettable choices */
.boring {
  color: #333;
  background: #f5f5f5;
  padding: 20px;
  border-radius: 8px;
}

/* ❌ NEVER - Predictable card pattern */
.every-ai-card {
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}
```

## Mafia Arena Specific Aesthetic

For this project, embrace a **dark terminal/data-visualization aesthetic**:

```css
:root {
  /* Dark terminal base */
  --bg-primary: #0a0a0a;
  --bg-secondary: #111111;
  --bg-tertiary: #1a1a1a;
  
  /* High contrast text */
  --fg-primary: #fafafa;
  --fg-secondary: #a0a0a0;
  --fg-muted: #525252;
  
  /* Game theme colors */
  --mafia: #ef4444;
  --mafia-glow: rgba(239, 68, 68, 0.3);
  --town: #3b82f6;
  --town-glow: rgba(59, 130, 246, 0.3);
  
  /* Data accent */
  --accent: #22d3ee;
  --success: #22c55e;
  --warning: #f59e0b;
  
  /* Borders */
  --border: #262626;
  --border-subtle: #1f1f1f;
}

/* Monospace for data */
body {
  font-family: 'JetBrains Mono', 'Berkeley Mono', monospace;
}

/* Tabular numbers for stats */
.stat, .number, td {
  font-variant-numeric: tabular-nums;
}

/* Subtle scanline effect for retro feel */
.terminal-effect::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.1) 2px,
    rgba(0, 0, 0, 0.1) 4px
  );
  pointer-events: none;
}
```

## Implementation Checklist

Before submitting frontend code, verify:

- [ ] Typography uses distinctive, non-generic fonts
- [ ] Color palette has clear dominant + accent hierarchy
- [ ] At least one "wow moment" animation or interaction
- [ ] Layout has intentional asymmetry or unexpected composition
- [ ] Background creates atmosphere (not solid color)
- [ ] Design has a clear, committed aesthetic direction
- [ ] Code is production-grade and functional
- [ ] No Inter, Roboto, or purple gradients anywhere

Remember: Claude is capable of extraordinary creative work. Don't hold back - show what can truly be created when thinking outside the box and committing fully to a distinctive vision.



----

# 🎨 Mafia Arena: UX/UI Refactoring Plan (Part 1)
**Author:** Senior UX Designer
**Date:** December 21, 2025
**Scope:** Global Navigation, Homepage, Game Consumption, and Visual System

## 1. Executive Summary & Design Principles
The current UI is functional and data-rich, successfully conveying the "Benchmarking" aspect. However, it lacks the "Arena" excitement and narrative layer needed to make the data compelling. The UI is currently "reporting stats" rather than "telling the story of AI social intelligence."

**Core Design Principles for Refactoring:**
1.  **Narrative over Numbers:** Don't just show a win rate; highlight *how* it was won (e.g., "Deception" vs. "Deduction").
2.  **Hierarchy of Speed:** Users scan for the winner first, the model second, and the details third. Our typography must reflect this.
3.  **Accessibility & Color Semantics:** We rely heavily on Red (Mafia) vs. Blue (Town). We must ensure this doesn't clash with Success (Green) vs. Failure (Red) indicators.
4.  **Mobile-Adaptive Data:** Large matrices and tables must degrade gracefully on smaller screens.

---

## 2. Global Visual System Updates
*Refactoring targets: `tailwind.config.mjs`, `global.css`, `Layout.astro`*

### A. Color Semantics Refinement
Currently, Red is used for both "Mafia Team" and "Loss/Danger." This creates cognitive load.
*   **Change:** Shift **Mafia** color slightly towards **Crimson/Rose** (`#e11d48`) and **Town** towards **Indigo** (`#4f46e5`).
*   **Change:** Keep "Success/Win" as **Emerald Green** and "Failure/Loss" as **Muted Slate** rather than red. This decouples "Team Color" from "Outcome."

### B. Typography & Readability
The current `Inter` + `JetBrains Mono` setup is solid, but the density is high.
*   **Action:** Increase base row height in tables by `4px` to allow breathing room.
*   **Action:** Enforce `font-variant-numeric: tabular-nums` on *all* metric columns (Win %, Token Count, Duration) to ensure columns align perfectly visually.

### C. Navigation Bar (`Nav.astro`)
*   **Current:** Static links.
*   **Update:** Add a **"Live Pulse"** indicator. If the backend reports `games_running > 0`, a pulsing red dot should appear next to the "Games" link. This drives traffic to the most engaging content (Live Games).

---

## 3. Homepage / Leaderboard Refactoring
*Refactoring targets: `index.astro`, `LeaderboardTable.astro`, `MatchupMatrix.astro`*

### A. The Hero Section
The "Best Deceiver" / "Best Detective" cards are excellent. Let's elevate them.
*   **Refactor:** Add a **"Featured Matchup"** card between them (or below). Dynamic text: *"Trending: Gemini 3 Flash vs GPT-5.2 - Town win rate dropped 5% this week."* This adds immediate context to the raw numbers.

### B. The "Head-to-Head Matrix" (Heatmap)
*   **Problem:** As seen in screenshots, the matrix is becoming dense. The 90-degree rotated labels are hard to read.
*   **Solution:**
    1.  **Collapse by default:** Show only the top 5 models. Add a clear "Expand Full Matrix" button.
    2.  **Interactive Tooltips:** The current hover state is essential. Ensure it works on touch devices (tap to show).
    3.  **Legend:** Move the "Diagonal = self-play" legend closer to the chart, perhaps as a subtle diagonal line through the empty cells.

### C. Performance Tables (Mafia vs Town)
*   **Problem:** Two separate long tables push content down.
*   **Solution:** **Unified Leaderboard with Toggles.**
    *   Create a single main table.
    *   Add a segmented control at the top: `[ Overall | Mafia Performance | Town Performance ]`.
    *   This prevents the user from having to scroll up and down to compare the same model's performance across roles.

---

## 4. Game List & Details Refactoring
*Refactoring targets: `GameCard.astro`, `games/index.astro`, `games/[id].astro`*

### A. The Games List (`games/index.astro`)
*   **Observation:** The list is text-heavy. The "Matchup" column is hard to scan because it repeats model names.
*   **Refactor:** Switch to a **Card-based Layout** for mobile and a **"Battle" Layout** for desktop.
    *   *Desktop Row Concept:*
        `[Date]  [Model A Logo] vs [Model B Logo]  ->  [Winner Icon] [Duration]`
    *   Replace text names with Logos/Avatars where possible (OpenAI logo, Google logo) with tooltips. Visual recognition is faster than reading text.

### B. Game Detail / Replay (`games/[id]/replay.astro`)
This is the most critical page for the "Transparency" goal.
*   **Problem:** The screenshot shows the transcript is readable but utilitarian. It looks like a debug log.
*   **Solution: The "Chat App" Aesthetic.**
    1.  **Bubbles:** Style the transcript like a messaging app (iMessage/Discord).
        *   **Mafia (Private Chat):** Dark background / distinct border style (dashed?).
        *   **Public Chat:** Standard bubbles. Left align for Player A, Right for Player B? (Or strictly left-align with clear avatars).
    2.  **Phase Dividers:** The current "Round 1" headers are subtle. Make them **Sticky Headers** that persist as you scroll through a long round.
    3.  **Hidden Prompts:** Keep the "System Prompt" hidden behind an "Info" icon toggle (as you have), but highlight *keywords* in the AI's reasoning field if available.
    4.  **Token Cost Ticker:** Move the cost tracking to a sticky footer or header in the replay view. Seeing the cost go up round-by-round creates tension/interest.

---

## 5. Quick Wins (Implementation Plan - Part 1)

If you have 1 hour, do these immediately to improve the visual polish:

1.  **Global CSS:** Add `.tabular-nums { font-variant-numeric: tabular-nums; }` to `global.css` and apply it to every number in the tables.
2.  **Games List:** In `GameCard.astro`, increase the font size of the "Winner" label and bold it. Make the loser 50% opacity. This creates instant visual hierarchy.
3.  **Stats Page:** On the "Win Distribution" bar (Stats Overview), add the actual count inside the bar segments, not just the percentage.
4.  **Navigation:** Add `backdrop-blur-md` and `bg-background/80` to the sticky header in `Layout.astro` to ensure content scrolling underneath doesn't create noise.








# 🎨 Mafia Arena: UX/UI Refactoring Plan (Part 2)
**Author:** Senior UX Designer
**Date:** December 21, 2025
**Scope:** Admin Dashboard, Batch Operations, Mobile Adaptation, and Design System

## 6. Admin & Operator Experience ("Mission Control")
*Refactoring targets: `pages/admin/index.astro`, `pages/admin/batches/*`, `GameRunner.ts` logic visualization*

The Admin panel is functional but feels like a database frontend. It needs to feel like a **Command Center** for managing expensive GPU resources.

### A. Dashboard Overview (`admin/index.astro`)
*   **Problem:** The "System Status" and "Active Batches" are treated with the same visual weight as "Recent Batches."
*   **Solution: The Status HUD (Heads-Up Display).**
    1.  **System Heartbeat:** Create a prominent top-bar component.
        *   *Running:* Green pulsing orb + "System Operational".
        *   *Paused:* Amber striped background + "Circuit Breaker Active".
        *   *Action:* The Pause/Resume button should be a large, distinct toggle, not a small text button.
    2.  **Budget Gauge:** Transform the "Budget Usage" linear bar into a **Radial Gauge** or a "Fuel Tank" visual. Color code it: Green (<50%), Yellow (50-80%), Red (>80%).
    3.  **Live Log Ticker:** Add a small, scrolling terminal-like window showing the last 5 logs (`Game X started`, `Batch Y completed`). This creates a feeling of activity/liveness.

### B. Batch Creation Flow (`admin/batches/new.astro`)
*   **Problem:** The form is long and vertical. The "Estimated Cost" is buried at the bottom, but it changes as you tweak settings at the top.
*   **Solution: Split-Screen Layout (Desktop).**
    *   **Left Column (Controls):** Configuration form.
        *   *Model Selection:* Replace native `<select>` with a **Rich Select Component**. Group by Provider (OpenAI, Anthropic) using their logos as icons.
    *   **Right Column (Simulator):** Sticky "Receipt" panel.
        *   Shows: Total Games, Estimated Time, and **Estimated Cost**.
        *   Update the cost in real-time with a satisfying number animation.
        *   Add a "Budget Warning" if the batch exceeds the remaining daily budget.

### C. Batch Detail View (`admin/batches/[id].astro`)
*   **Problem:** The list of games in a batch is just a table. Hard to see where failures occurred.
*   **Solution: The "Block" Visualization.**
    *   Instead of a list, show a grid of small squares (like GitHub contributions or disk defrag).
    *   **Green:** Town Win
    *   **Red:** Mafia Win
    *   **Gray:** Queued
    *   **Black/X:** Failed
    *   *Interaction:* Hover over a square to see Game ID/Duration. Click to go to replay. This allows assessing a batch of 1,000 games in one glance.

---

## 7. Mobile Responsiveness Strategy
*Refactoring targets: Global CSS, Table Components*

The screenshots show wide data tables that will break on mobile. We need a "Card Fallback" strategy.

### A. The "Card-Table" Pattern
On screens `< 768px`:
*   **Hide the `<table>` headers.**
*   **Transform `<tr>` into a Grid Card.**
*   **Flex key data points.**
    *   *Desktop:* `| Model | Role | Win % | Games |`
    *   *Mobile:*
        ```
        [ Provider Logo ] Model Name
        Role: [Icon] Mafia
        Win Rate: 78% (15 games)
        ```

### B. Complex Matrix Handling
The "Head-to-Head Matrix" cannot function on mobile.
*   **Strategy:** On mobile, hide the heatmap grid entirely. Replace it with a **Dropdown Pair Selector**:
    *   "Select Model A" vs "Select Model B"
    *   Show a single card result: "Model A wins 60% of the time."

---

## 8. Design System Consolidation
*Refactoring targets: `components/ui/*`, `lib/providers.ts`*

To ensure the app looks professional and maintainable, we need to standardize the "atomic" elements.

### A. Provider Identity System
Standardize how we represent models to reduce text clutter.
*   **OpenAI:** Green / Logo
*   **Anthropic:** Amber / Logo
*   **Google:** Blue / Logo
*   **Meta/OpenSource:** Purple / Logo
*   *Action:* Create a `<ProviderLogo provider={p} size="sm" />` component to use in tables, headers, and lists.

### B. Status Badge Standardization
Currently, we have various badges for games, batches, and system status. Unify them:
*   **Neutral/Queued:** `bg-slate-100 text-slate-600`
*   **Active/Running:** `bg-blue-100 text-blue-700` + animate-pulse
*   **Success/Completed:** `bg-emerald-100 text-emerald-700`
*   **Danger/Failed:** `bg-rose-100 text-rose-700`
*   **Warning/Paused:** `bg-amber-100 text-amber-700`

### C. Interaction Feedback
*   **Loading States:** Replace generic spinners with **Skeleton Loaders** that match the shape of the content (Table rows, Cards) to reduce layout shift.
*   **Toast Notifications:** When launching a batch or pausing the system, use a floating Toast (bottom-right) instead of browser alerts.

---

## 9. Implementation Roadmap (Quick Wins - Part 2)

If you have 2 hours, prioritize these changes to the Admin panel:

1.  **Cost Sticky Panel:** In `admin/batches/new.astro`, wrap the "Cost Estimate" div in a `sticky top-4` class and move it to a sidebar layout on desktop.
2.  **Batch Visualization:** In `admin/batches/[id].astro`, add a simple flex-wrap container of colored `div`s (w-4 h-4) representing the games completed so far.
3.  **Provider Logos:** Import SVGs for OpenAI, Anthropic, and Google. Replace the text "provider" column in the Leaderboard with these icons.
4.  **Error States:** Create a dedicated `<ErrorState />` component that looks better than the current red text box, using an icon (AlertTriangle) and a clear "Retry" button.

---

**End of Refactoring Plan.**
*Implementing these changes will transition Mafia Arena from a "Developer Tech Demo" to a "Professional SaaS-tier Benchmark Platform."*

