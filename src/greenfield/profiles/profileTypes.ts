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

export type GreenfieldProfileId = 'typescript-cli' | 'nextjs-app' | 'android-compose';

/**
 * A single setup or validation command a profile recommends, described but
 * never executed by the orchestrator itself (see buildScaffoldPlan.ts and
 * artifacts/v1.2.0-android-compose-profile-contract.txt). Kept intentionally
 * minimal -- command text, why it exists, whether it is required, and an
 * optional environment caveat -- rather than a general command-execution
 * model, since the orchestrator never runs these commands.
 */
export interface GreenfieldProfileCommand {
  command: string;
  purpose: string;
  required: boolean;
  /** e.g. "requires a connected device or emulator"; omitted when not applicable. */
  environmentNotes?: string;
}

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
  /**
   * Recommended setup commands (e.g. dependency installation). Descriptive
   * only; the orchestrator never executes these (see
   * artifacts/v1.2.0-android-compose-profile-contract.txt). Batch 3 wires
   * these into buildScaffoldPlan.ts in place of its current hardcoded
   * npm-specific logic.
   */
  setupCommands: GreenfieldProfileCommand[];
  /**
   * Recommended validation commands (e.g. typecheck/build/test). Descriptive
   * only; the orchestrator never executes these. Batch 3 wires these into
   * buildScaffoldPlan.ts in place of its current keyword-sniffing logic.
   */
  validationCommands: GreenfieldProfileCommand[];
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
