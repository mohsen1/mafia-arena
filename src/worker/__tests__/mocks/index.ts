/**
 * Mock exports for E2E testing.
 */

export {
  ScriptedWorkerProvider,
  createScriptedProviders,
  type ScriptedAction,
  type CallLogEntry,
} from './ScriptedWorkerProvider.js';

export {
  STANDARD_GAME_CONFIG,
  DISCUSSION_GAME_CONFIG,
  setupTownWinsScenario,
  setupMafiaWinsScenario,
  setupParseErrorScenario,
  setupSlowResponseScenario,
  setupHighTokenScenario,
  createScenarioProviders,
  setSharedProviders,
  getSharedProviders,
  clearSharedProviders,
  getOrCreateProvider,
} from './scenarios.js';

