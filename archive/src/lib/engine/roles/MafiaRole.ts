import { RoleName } from '../interfaces/IRole';
import { BaseRole } from './Role';

export class MafiaRole extends BaseRole {
  readonly name = RoleName.Mafia;
  readonly allegiance = 'Mafia';
  readonly canPerformNightAction = true;
  readonly description =
    'Member of the Mafia. Works with other Mafia members to kill Town members at night.';
}
