// src/lib/engine/tests/core/utils.test.ts
import { describe, it, expect } from 'vitest';
import { assignRoles } from '@/lib/engine/core/utils';
import { MafiaRole } from '@/lib/engine/roles/MafiaRole';
import { DoctorRole } from '@/lib/engine/roles/DoctorRole';
import { SeerRole } from '@/lib/engine/roles/SeerRole';
import { VillagerRole } from '@/lib/engine/roles/VillagerRole';

describe('assignRoles', () => {
    it('should throw an error for fewer than 3 players', () => {
        expect(() => assignRoles(2)).toThrow('Cannot assign roles for fewer than 3 players.');
        expect(() => assignRoles(0)).toThrow('Cannot assign roles for fewer than 3 players.');
    });

    it('should return the correct number of roles for the player count', () => {
        expect(assignRoles(5).length).toBe(5);
        expect(assignRoles(7).length).toBe(7);
        expect(assignRoles(10).length).toBe(10);
    });

    it('should assign correct role counts for 5 players (1 Mafia, 1 Doctor, 1 Seer, 2 Villagers)', () => {
        // Run multiple times to account for shuffling
        for (let i = 0; i < 10; i++) {
            const roles = assignRoles(5);
            expect(roles.filter(r => r instanceof MafiaRole).length).toBe(1);
            expect(roles.filter(r => r instanceof DoctorRole).length).toBe(1);
            expect(roles.filter(r => r instanceof SeerRole).length).toBe(1);
            expect(roles.filter(r => r instanceof VillagerRole).length).toBe(2);
        }
    });

    it('should assign correct role counts for 7 players (2 Mafia, 1 Doctor, 1 Seer, 3 Villagers)', () => {
        // Using example ratio: floor(7 / 3.5) = 2 Mafia
        for (let i = 0; i < 10; i++) {
            const roles = assignRoles(7);
            expect(roles.filter(r => r instanceof MafiaRole).length).toBe(2);
            expect(roles.filter(r => r instanceof DoctorRole).length).toBe(1);
            expect(roles.filter(r => r instanceof SeerRole).length).toBe(1);
            expect(roles.filter(r => r instanceof VillagerRole).length).toBe(3);
        }
    });

    it('should assign correct role counts for 3 players (1 Mafia, 2 Villagers)', () => {
        // Edge case: floor(3 / 3.5) = 0, but max(1, 0) = 1 Mafia. No Doc/Seer.
        for (let i = 0; i < 10; i++) {
            const roles = assignRoles(3);
            expect(roles.filter(r => r instanceof MafiaRole).length).toBe(1);
            expect(roles.filter(r => r instanceof DoctorRole).length).toBe(0);
            expect(roles.filter(r => r instanceof SeerRole).length).toBe(0);
            expect(roles.filter(r => r instanceof VillagerRole).length).toBe(2);
        }
    });

    it('should return instances of IRole', () => {
        const roles = assignRoles(5);
        roles.forEach(role => {
            expect(role).toHaveProperty('name');
            expect(role).toHaveProperty('allegiance');
            expect(role).toHaveProperty('canPerformNightAction');
            expect(role).toHaveProperty('description');
        });
    });
});