"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MafiaRole = void 0;
const IRole_1 = require("../interfaces/IRole");
const Role_1 = require("./Role");
class MafiaRole extends Role_1.BaseRole {
    constructor() {
        super(...arguments);
        this.name = IRole_1.RoleName.Mafia;
        this.allegiance = 'Mafia';
        this.canPerformNightAction = true;
        this.description = "Member of the Mafia. Works with other Mafia members to kill Town members at night.";
    }
}
exports.MafiaRole = MafiaRole;
