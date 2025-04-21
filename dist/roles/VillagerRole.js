"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VillagerRole = void 0;
const IRole_1 = require("../interfaces/IRole");
const Role_1 = require("./Role");
class VillagerRole extends Role_1.BaseRole {
    constructor() {
        super(...arguments);
        this.name = IRole_1.RoleName.Villager;
        this.allegiance = 'Town';
        this.canPerformNightAction = false;
        this.description = "A regular Town member. Tries to identify and eliminate the Mafia during the day.";
    }
}
exports.VillagerRole = VillagerRole;
