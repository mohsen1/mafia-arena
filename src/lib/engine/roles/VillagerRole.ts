import { RoleName } from "../interfaces/IRole";
import { BaseRole } from "./Role";

export class VillagerRole extends BaseRole {
    readonly name = RoleName.Villager;
    readonly allegiance = 'Town';
    readonly canPerformNightAction = false;
    readonly description = "A regular Town member. Tries to identify and eliminate the Mafia during the day.";
}
