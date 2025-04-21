export enum RoleName { 
    Mafia = 'Mafia', 
    Villager = 'Villager', 
    Doctor = 'Doctor', 
    Seer = 'Seer' // Detective equivalent
}

export interface IRole {
    readonly name: RoleName;
    readonly allegiance: 'Mafia' | 'Town'; // Or other factions
    readonly canPerformNightAction: boolean; // Does this role act at night?
    readonly description: string;

    // Potential future permission flags
    // readonly canKill?: boolean;
    // readonly canInvestigate?: boolean;
}
