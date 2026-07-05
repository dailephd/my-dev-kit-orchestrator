// Types for the platform-neutral greenfield scaffold plan.
//
// No historical source has a scaffold-planning concept as a design artifact
// (app-dev-starter-kit and my-dev-kit-alpha only have a static, non-
// authoritative project_tree_template.txt) -- this is new design surface,
// REWRITE_FOR_ORCHESTRATOR per artifacts/greenfield-porting-map.txt. The plan
// is planning-only: it describes what a later, human- or agent-driven
// scaffold-implementation stage should create; it never writes files itself
// (see buildScaffoldPlan.ts).

import { GreenfieldProfileCommand, GreenfieldProfileId } from '../profiles/profileTypes';

export interface GreenfieldScaffoldFileGroup {
  name: string;
  description: string;
  /** Illustrative planned paths. Descriptive only; nothing is written to disk. */
  filePaths: string[];
}

export interface GreenfieldFirstRunnableBehavior {
  description: string;
  entryPoint?: string;
}

export interface GreenfieldScaffoldPlan {
  profileId?: GreenfieldProfileId;
  plannedFileGroups: GreenfieldScaffoldFileGroup[];
  firstRunnableBehavior: GreenfieldFirstRunnableBehavior;
  /**
   * Sourced directly from the selected profile's own `setupCommands`
   * (v1.2.0; see artifacts/v1.2.0-android-compose-profile-contract.txt).
   * Never executed by the orchestrator.
   */
  setupCommands: GreenfieldProfileCommand[];
  /**
   * Sourced directly from the selected profile's own `validationCommands`
   * (v1.2.0). Preserves each command's `required`/`environmentNotes` (e.g.
   * Android Compose's connectedAndroidTest is `required: false` with a
   * device/emulator note). Never executed by the orchestrator.
   */
  validationCommands: GreenfieldProfileCommand[];
  testExpectations: string[];
  documentationExpectations: string[];
  unresolvedDecisions: string[];
  nonGoals: string[];
  /** Warnings when the plan is incomplete (e.g. no profile selected). */
  unsupportedClaims: string[];
}
