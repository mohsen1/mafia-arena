import type { RoleName, IRole } from "../interfaces/IRole";

export abstract class BaseRole implements IRole {
    abstract readonly name: RoleName;
    abstract readonly allegiance: 'Mafia' | 'Town';
    abstract readonly canPerformNightAction: boolean;
    abstract readonly description: string;
}
