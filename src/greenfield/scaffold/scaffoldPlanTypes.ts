// Types for the platform-neutral greenfield scaffold plan.
//
// No historical source has a scaffold-planning concept as a design artifact
// (app-dev-starter-kit and my-dev-kit-alpha only have a static, non-
// authoritative project_tree_template.txt) -- this is new design surface,
// REWRITE_FOR_ORCHESTRATOR per artifacts/greenfield-porting-map.txt. The plan
// is planning-only: it describes what a later, human- or agent-driven
// scaffold-implementation stage should create; it never writes files itself
// (see buildScaffoldPlan.ts).

import { GreenfieldProfileId } from '../profiles/profileTypes';

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
  setupCommands: string[];
  validationCommands: string[];
  testExpectations: string[];
  documentationExpectations: string[];
  unresolvedDecisions: string[];
  nonGoals: string[];
  /** Warnings when the plan is incomplete (e.g. no profile selected). */
  unsupportedClaims: string[];
}
