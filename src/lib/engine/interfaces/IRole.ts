export enum RoleName {
  Mafia = 'Mafia',
  Villager = 'Villager',
  Doctor = 'Doctor',
  Seer = 'Seer', // Detective equivalent
}

export type Allegiance = 'Town' | 'Mafia';

export interface IRole {
  readonly name: RoleName;
  readonly allegiance: Allegiance;
  readonly canPerformNightAction: boolean; // Does this role act at night?
  readonly description: string;

  // Potential future permission flags
  // readonly canKill?: boolean;
  // readonly canInvestigate?: boolean;
}
