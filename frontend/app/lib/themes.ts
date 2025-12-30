/**
 * Theme configuration for Mafia Arena games.
 * Single source of truth for theme colors, icons, and descriptions.
 */

export type ThemeKey = 'noir' | 'victorian' | 'modern' | 'fantasy';

export interface ThemeConfig {
  label: string;
  iconType: 'feather' | 'scroll' | 'building' | 'sparkles';
  classes: string;
  description: string;
}

export const THEME_CONFIG: Record<string, ThemeConfig> = {
  noir: {
    label: 'Noir',
    iconType: 'feather',
    classes: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
    description: 'A dark, atmospheric setting inspired by 1940s detective fiction. Characters speak in hard-boiled prose, shadows lurk around every corner, and trust is a currency nobody can afford.',
  },
  victorian: {
    label: 'Victorian',
    iconType: 'scroll',
    classes: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    description: 'Set in the gaslit streets of 19th century London. Characters are bound by rigid social hierarchy, proper etiquette masks deadly intentions, and secrets fester beneath respectable facades.',
  },
  modern: {
    label: 'Modern',
    iconType: 'building',
    classes: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
    description: 'A contemporary corporate thriller setting. Power plays unfold in glass towers, alliances shift in boardrooms, and the deadliest weapons are information and influence.',
  },
  fantasy: {
    label: 'Fantasy',
    iconType: 'sparkles',
    classes: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
    description: 'A realm of magic and mystery where guilds vie for power. Ancient prophecies guide the righteous while dark sorcery empowers the corrupted. Every spell cast could reveal—or conceal—the truth.',
  },
};

export function getTheme(key?: string | null): ThemeConfig {
  return THEME_CONFIG[key || 'noir'] || THEME_CONFIG.noir;
}


