import { RoleName, type IRole } from "../interfaces/IRole";

export class DoctorRole implements IRole {
    readonly name = RoleName.Doctor;
    readonly allegiance = 'Town';
    readonly canPerformNightAction = true;
    readonly description = "During the night, you can choose one player to save from being killed.";
} 