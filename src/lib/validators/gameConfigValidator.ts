import type {
  ConfigCharacterSlot,
  Role,
  ValidationResult,
} from "@/lib/types/game";

// Validates the configuration *before* generation attempt
export function validateGameConfiguration(
  slots: ConfigCharacterSlot[],
): ValidationResult {
  const playerCount = slots.length;

  if (playerCount < 5) {
    return { isValid: false, message: `Requires at least 5 players.` };
  }

  // Count selected roles directly
  const roleCounts: Record<Role, number> = {
    Werewolf: 0,
    Seer: 0,
    Doctor: 0,
    Villager: 0,
  };
  slots.forEach((slot) => {
    roleCounts[slot.roleSelection]++; // Use roleSelection directly
  });

  if (roleCounts.Seer > 1) {
    return { isValid: false, message: `Maximum 1 Seer allowed.` };
  }
  if (roleCounts.Doctor > 1) {
    return { isValid: false, message: `Maximum 1 Doctor allowed.` };
  }

  // Example: Check werewolf balance pre-generation
  const nonWerewolves =
    roleCounts.Villager + roleCounts.Seer + roleCounts.Doctor;
  if (roleCounts.Werewolf === 0) {
    return {
      isValid: false,
      message: `At least one Werewolf must be selected.`,
    };
  }
  if (roleCounts.Werewolf >= nonWerewolves) {
    return {
      isValid: false,
      message: `Too many Werewolves (${roleCounts.Werewolf}) relative to others (${nonWerewolves}). Adjust roles.`,
    };
  }

  return {
    isValid: true,
    message: `Configuration looks good (${playerCount} players).`,
  };
}

// Validates the setup *after* characters have been generated.
export function validateGeneratedGameSetup(
  characters: ConfigCharacterSlot[],
): ValidationResult & {
  playerCount: number;
  roleCounts: Record<Role, number>;
} {
  const generatedCharacters = characters.filter(
    (c) => c.isGenerated && c.assignedRole,
  );
  const playerCount = generatedCharacters.length;
  const allSlotsCount = characters.length;

  const errors = characters.filter((c) => c.generationError);
  if (errors.length > 0) {
    return {
      isValid: false,
      message: `Resolve ${errors.length} generation error(s) before starting.`,
      playerCount,
      roleCounts: {} as Record<Role, number>,
    };
  }

  if (playerCount < 5) {
    if (allSlotsCount < 5) {
      return {
        isValid: false,
        message: `Requires at least 5 players (currently ${allSlotsCount}).`,
        playerCount,
        roleCounts: {} as Record<Role, number>,
      };
    }
    return {
      isValid: false,
      message: `Need at least 5 successfully generated players (only ${playerCount} generated). Check for errors.`,
      playerCount,
      roleCounts: {} as Record<Role, number>,
    };
  }

  const roleCounts: Record<Role, number> = {
    Werewolf: 0,
    Seer: 0,
    Doctor: 0,
    Villager: 0,
  };
  generatedCharacters.forEach((c) => {
    if (c.assignedRole) roleCounts[c.assignedRole]++;
  });

  const nonWerewolves =
    roleCounts.Villager + roleCounts.Seer + roleCounts.Doctor;
  if (roleCounts.Werewolf >= nonWerewolves) {
    return {
      isValid: false,
      message: `Too many Werewolves (${roleCounts.Werewolf}) relative to others (${nonWerewolves}). Regenerate or adjust roles.`,
      playerCount,
      roleCounts,
    };
  }
  if (roleCounts.Werewolf === 0) {
    return {
      isValid: false,
      message: `At least one Werewolf is required. Regenerate or adjust roles.`,
      playerCount,
      roleCounts,
    };
  }
  if (roleCounts.Seer > 1) {
    return {
      isValid: false,
      message: `Configuration resulted in too many Seers (${roleCounts.Seer}). Regenerate or adjust roles.`,
      playerCount,
      roleCounts,
    };
  }
  if (roleCounts.Doctor > 1) {
    return {
      isValid: false,
      message: `Configuration resulted in too many Doctors (${roleCounts.Doctor}). Regenerate or adjust roles.`,
      playerCount,
      roleCounts,
    };
  }

  return {
    isValid: true,
    message: `Ready: ${playerCount} players generated.`,
    playerCount,
    roleCounts,
  };
}
