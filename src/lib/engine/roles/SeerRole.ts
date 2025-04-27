import { RoleName, type IRole } from "../interfaces/IRole";

export class SeerRole implements IRole {
    readonly name = RoleName.Seer;
    readonly allegiance = 'Town';
    readonly canPerformNightAction = true;
    readonly description = "During the night, you can choose one player to investigate their allegiance (Mafia or Town).";
} 