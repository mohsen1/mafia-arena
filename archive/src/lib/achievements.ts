import { RoleName } from '@/lib/engine/interfaces/IRole';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string; // Emoji or icon name
  category: 'gameplay' | 'social' | 'milestone' | 'special';
  points: number;
  hidden?: boolean; // Hidden until unlocked
  unlockedAt?: Date;
}

export interface AchievementProgress {
  achievementId: string;
  progress: number;
  maxProgress: number;
  unlockedAt?: Date;
}

export interface UserAchievements {
  userId: string;
  achievements: AchievementProgress[];
  totalPoints: number;
}

// Achievement definitions
export const ACHIEVEMENTS: Achievement[] = [
  // Gameplay Achievements
  {
    id: 'first-win',
    name: 'First Victory',
    description: 'Win your first game',
    icon: '🏆',
    category: 'gameplay',
    points: 10,
  },
  {
    id: 'survivor',
    name: 'Survivor',
    description: 'Survive until the end of a game',
    icon: '🛡️',
    category: 'gameplay',
    points: 5,
  },
  {
    id: 'detective',
    name: 'Detective',
    description: 'Correctly identify a werewolf as a villager',
    icon: '🔍',
    category: 'gameplay',
    points: 15,
  },
  {
    id: 'perfect-seer',
    name: 'Perfect Seer',
    description: 'Win as Seer after investigating all werewolves',
    icon: '🔮',
    category: 'gameplay',
    points: 25,
  },
  {
    id: 'lifesaver',
    name: 'Lifesaver',
    description: 'Save 3 different players in a single game as Doctor',
    icon: '💊',
    category: 'gameplay',
    points: 20,
  },
  {
    id: 'master-deceiver',
    name: 'Master Deceiver',
    description: 'Win as Werewolf without any suspicion votes against you',
    icon: '🎭',
    category: 'gameplay',
    points: 30,
  },
  {
    id: 'unanimous-vote',
    name: 'Unanimous Decision',
    description: 'Lead a unanimous vote against a werewolf',
    icon: '🗳️',
    category: 'gameplay',
    points: 15,
  },

  // Social Achievements
  {
    id: 'first-blood',
    name: 'First Blood',
    description: 'Be the first to vote in a game',
    icon: '🩸',
    category: 'social',
    points: 5,
  },
  {
    id: 'peacemaker',
    name: 'Peacemaker',
    description: 'Convince others to change their vote',
    icon: '☮️',
    category: 'social',
    points: 10,
  },
  {
    id: 'eloquent-speaker',
    name: 'Eloquent Speaker',
    description: 'Send 50 messages in a single game',
    icon: '💬',
    category: 'social',
    points: 10,
  },
  {
    id: 'trusted-ally',
    name: 'Trusted Ally',
    description: 'Never receive a vote against you in 5 consecutive games',
    icon: '🤝',
    category: 'social',
    points: 25,
  },

  // Milestone Achievements
  {
    id: 'veteran-10',
    name: 'Veteran Player',
    description: 'Complete 10 games',
    icon: '🎖️',
    category: 'milestone',
    points: 10,
  },
  {
    id: 'veteran-50',
    name: 'Seasoned Veteran',
    description: 'Complete 50 games',
    icon: '🏅',
    category: 'milestone',
    points: 25,
  },
  {
    id: 'veteran-100',
    name: 'Werewolf Master',
    description: 'Complete 100 games',
    icon: '👑',
    category: 'milestone',
    points: 50,
  },
  {
    id: 'win-streak-5',
    name: 'On Fire',
    description: 'Win 5 games in a row',
    icon: '🔥',
    category: 'milestone',
    points: 20,
  },
  {
    id: 'win-streak-10',
    name: 'Unstoppable',
    description: 'Win 10 games in a row',
    icon: '⚡',
    category: 'milestone',
    points: 40,
  },
  {
    id: 'role-master-villager',
    name: 'Village Elder',
    description: 'Win 10 games as Villager',
    icon: '👴',
    category: 'milestone',
    points: 15,
  },
  {
    id: 'role-master-werewolf',
    name: 'Alpha Wolf',
    description: 'Win 10 games as Werewolf',
    icon: '🐺',
    category: 'milestone',
    points: 20,
  },
  {
    id: 'role-master-seer',
    name: 'Oracle',
    description: 'Win 10 games as Seer',
    icon: '👁️',
    category: 'milestone',
    points: 20,
  },
  {
    id: 'role-master-doctor',
    name: 'Chief Physician',
    description: 'Win 10 games as Doctor',
    icon: '⚕️',
    category: 'milestone',
    points: 20,
  },

  // Special Achievements
  {
    id: 'early-adopter',
    name: 'Early Adopter',
    description: 'Play during the first month of launch',
    icon: '🌟',
    category: 'special',
    points: 15,
    hidden: true,
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    description: 'Play a game between 2 AM and 5 AM',
    icon: '🦉',
    category: 'special',
    points: 10,
    hidden: true,
  },
  {
    id: 'multilingual',
    name: 'Multilingual',
    description: 'Play games in 5 different languages',
    icon: '🌍',
    category: 'special',
    points: 15,
  },
  {
    id: 'theme-explorer',
    name: 'Theme Explorer',
    description: 'Play games in 10 different themes',
    icon: '🎨',
    category: 'special',
    points: 15,
  },
  {
    id: 'ai-whisperer',
    name: 'AI Whisperer',
    description: 'Play with all available AI models',
    icon: '🤖',
    category: 'special',
    points: 20,
  },
  {
    id: 'perfect-game',
    name: 'Perfect Game',
    description: 'Win without any town members dying (as Town)',
    icon: '💯',
    category: 'special',
    points: 30,
    hidden: true,
  },
  {
    id: 'comeback-king',
    name: 'Comeback King',
    description: 'Win after being down to 2 town members',
    icon: '🔄',
    category: 'special',
    points: 25,
    hidden: true,
  },
];

// Helper functions
export function getAchievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

export function getAchievementsByCategory(
  category: Achievement['category']
): Achievement[] {
  return ACHIEVEMENTS.filter((a) => a.category === category);
}

export function calculateTotalPoints(
  achievements: AchievementProgress[]
): number {
  return achievements
    .filter((a) => a.unlockedAt !== undefined)
    .reduce((total, a) => {
      const achievement = getAchievementById(a.achievementId);
      return total + (achievement?.points || 0);
    }, 0);
}

export function getNextMilestone(
  currentValue: number,
  milestones: number[]
): number | null {
  const sorted = milestones.sort((a, b) => a - b);
  return sorted.find((m) => m > currentValue) || null;
}

// Achievement checking functions
export interface GameStats {
  gamesPlayed: number;
  gamesWon: number;
  currentStreak: number;
  roleWins: Record<RoleName, number>;
  survivedGames: number;
  messagesPerGame: Record<string, number>;
  votesReceived: Record<string, number>;
  correctWerewolfIdentifications: number;
  playedThemes: Set<string>;
  playedLanguages: Set<string>;
  playedAIModels: Set<string>;
}

export function checkAchievements(
  stats: GameStats,
  currentAchievements: AchievementProgress[]
): AchievementProgress[] {
  const newAchievements: AchievementProgress[] = [];
  const existingIds = new Set(currentAchievements.map((a) => a.achievementId));

  // Check each achievement
  ACHIEVEMENTS.forEach((achievement) => {
    if (existingIds.has(achievement.id)) return;

    let unlocked = false;
    let progress = 0;
    let maxProgress = 1;

    switch (achievement.id) {
      case 'first-win':
        unlocked = stats.gamesWon >= 1;
        break;
      case 'survivor':
        unlocked = stats.survivedGames >= 1;
        break;
      case 'detective':
        unlocked = stats.correctWerewolfIdentifications >= 1;
        break;
      case 'veteran-10':
        progress = stats.gamesPlayed;
        maxProgress = 10;
        unlocked = stats.gamesPlayed >= 10;
        break;
      case 'veteran-50':
        progress = stats.gamesPlayed;
        maxProgress = 50;
        unlocked = stats.gamesPlayed >= 50;
        break;
      case 'veteran-100':
        progress = stats.gamesPlayed;
        maxProgress = 100;
        unlocked = stats.gamesPlayed >= 100;
        break;
      case 'win-streak-5':
        progress = stats.currentStreak;
        maxProgress = 5;
        unlocked = stats.currentStreak >= 5;
        break;
      case 'win-streak-10':
        progress = stats.currentStreak;
        maxProgress = 10;
        unlocked = stats.currentStreak >= 10;
        break;
      case 'role-master-villager':
        progress = stats.roleWins[RoleName.Villager] || 0;
        maxProgress = 10;
        unlocked = (stats.roleWins[RoleName.Villager] || 0) >= 10;
        break;
      case 'role-master-werewolf':
        progress = stats.roleWins[RoleName.Mafia] || 0;
        maxProgress = 10;
        unlocked = (stats.roleWins[RoleName.Mafia] || 0) >= 10;
        break;
      case 'role-master-seer':
        progress = stats.roleWins[RoleName.Seer] || 0;
        maxProgress = 10;
        unlocked = (stats.roleWins[RoleName.Seer] || 0) >= 10;
        break;
      case 'role-master-doctor':
        progress = stats.roleWins[RoleName.Doctor] || 0;
        maxProgress = 10;
        unlocked = (stats.roleWins[RoleName.Doctor] || 0) >= 10;
        break;
      case 'multilingual':
        progress = stats.playedLanguages.size;
        maxProgress = 5;
        unlocked = stats.playedLanguages.size >= 5;
        break;
      case 'theme-explorer':
        progress = stats.playedThemes.size;
        maxProgress = 10;
        unlocked = stats.playedThemes.size >= 10;
        break;
      case 'ai-whisperer':
        progress = stats.playedAIModels.size;
        maxProgress = 4; // Assuming 4 AI models
        unlocked = stats.playedAIModels.size >= 4;
        break;
    }

    if (unlocked || progress > 0) {
      newAchievements.push({
        achievementId: achievement.id,
        progress,
        maxProgress,
        unlockedAt: unlocked ? new Date() : undefined,
      });
    }
  });

  return [...currentAchievements, ...newAchievements];
}
