// Platform-neutral starter profile contracts for the v1.1.0 Greenfield
// Bootstrap Foundation.
//
// Neither historical source (app-dev-starter-kit, my-dev-kit-alpha) has a
// profile catalog concept -- this is new design surface
// (REWRITE_FOR_ORCHESTRATOR, see artifacts/greenfield-porting-map.txt,
// subsystem "Starter profile resolution"). GreenfieldProfileSelection is the
// minimal orchestrator-native intermediate type chosen in
// artifacts/greenfield-starter-bridge-decision.txt in place of porting
// my-dev-kit-alpha's StarterConfig.

export type GreenfieldProfileId = 'typescript-cli' | 'nextjs-app';

/**
 * A supported starter profile. Describes enough information to guide later
 * bootstrap-bundle and scaffold-planning work without generating the scaffold
 * directly.
 */
export interface GreenfieldProfile {
  id: GreenfieldProfileId;
  displayName: string;
  category: string;
  supportedProjectKind: string;
  stackAssumptions: string[];
  templateTargets: string[];
  documentationExpectations: string[];
  testExpectations: string[];
  validationExpectations: string[];
  scaffoldPlanningHints: string[];
  unsupportedConditions: string[];
  notesForBootstrapBundle: string;
}

export type GreenfieldProfileResolutionStatus = 'selected' | 'unresolved' | 'unsupported';

/**
 * The result of resolving a starter profile from a normalized brief.
 *
 * `profile` is present only when `status === 'selected'`. When `status` is
 * `'unsupported'`, the caller must not silently substitute a default profile
 * (artifacts/greenfield-starter-bridge-decision.txt, "What Batch 3 must
 * preserve").
 */
export interface GreenfieldProfileSelection {
  status: GreenfieldProfileResolutionStatus;
  profile?: GreenfieldProfile;
  /** The raw profile id the brief requested, when one was requested. */
  requestedProfileId?: string;
  /** Human-readable explanation of why this status was reached. */
  reason: string;
  /** Notes suitable for feeding artifacts/stack-decision.txt. */
  stackDecisionNotes: string[];
}
