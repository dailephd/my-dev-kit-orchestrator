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
 * v1.3.0 Batch 2 (corrected): the closed, centrally defined vocabulary of
 * documentation terminology tags a profile may declare in
 * `GreenfieldProfile.allowedDocumentationTerminology`. This is the single
 * canonical source of truth -- profile definitions and
 * validateBootstrapDocs.ts both reference these named values (or the
 * derived `GREENFIELD_DOCUMENTATION_TERMINOLOGY_TAGS` list for membership
 * checks) rather than declaring independent literal strings. Extending the
 * vocabulary (a genuinely new documentation domain, not a new profile)
 * means adding one entry here plus the corresponding rule in
 * validateBootstrapDocs.ts; it does not mean adding a profile-ID branch.
 */
export const GREENFIELD_DOCUMENTATION_TERMINOLOGY = {
  ANDROID_JETPACK: 'android-jetpack',
  NEXTJS_REACT: 'nextjs-react',
} as const;

export type GreenfieldDocumentationTerminologyTag =
  (typeof GREENFIELD_DOCUMENTATION_TERMINOLOGY)[keyof typeof GREENFIELD_DOCUMENTATION_TERMINOLOGY];

/** Derived membership list for runtime validation; do not declare independently. */
export const GREENFIELD_DOCUMENTATION_TERMINOLOGY_TAGS: readonly GreenfieldDocumentationTerminologyTag[] =
  Object.values(GREENFIELD_DOCUMENTATION_TERMINOLOGY);

/**
 * v1.3.1 Batch 1: the closed, centrally defined vocabulary of project types a
 * greenfield brief may explicitly request via `projectType`, orthogonal to
 * starter-profile identity. `fullstack-web` is the first and only implemented
 * value; do not add further values without a separately approved contract
 * (see docs/ROADMAP.md, v1.3.1).
 */
export const GREENFIELD_PROJECT_TYPE = {
  FULLSTACK_WEB: 'fullstack-web',
} as const;

export type GreenfieldProjectType = (typeof GREENFIELD_PROJECT_TYPE)[keyof typeof GREENFIELD_PROJECT_TYPE];

/** Derived membership list for runtime validation; do not declare independently. */
export const GREENFIELD_PROJECT_TYPES: readonly GreenfieldProjectType[] =
  Object.values(GREENFIELD_PROJECT_TYPE);

/**
 * v1.3.1 Batch 1: the closed, centrally defined vocabulary of web frameworks
 * a greenfield brief may explicitly request via `webFramework`, orthogonal to
 * starter-profile identity. `nextjs` is the first and only implemented value;
 * do not add further values without a separately approved contract.
 */
export const GREENFIELD_WEB_FRAMEWORK = {
  NEXTJS: 'nextjs',
} as const;

export type GreenfieldWebFramework = (typeof GREENFIELD_WEB_FRAMEWORK)[keyof typeof GREENFIELD_WEB_FRAMEWORK];

/** Derived membership list for runtime validation; do not declare independently. */
export const GREENFIELD_WEB_FRAMEWORKS: readonly GreenfieldWebFramework[] =
  Object.values(GREENFIELD_WEB_FRAMEWORK);

/**
 * A single setup or validation command a profile recommends, described but
 * never executed by the orchestrator itself (see buildScaffoldPlan.ts and
 * artifacts/v1.2.0-android-compose-profile-contract.txt). Kept intentionally
 * minimal -- command text, why it exists, whether it is required, and an
 * optional environment caveat -- rather than a general command-execution
 * model, since the orchestrator never runs these commands.
 */
/**
 * v1.3.1 Batch 4: the lifecycle phase a command belongs to, when that
 * distinction matters (currently only for full-stack capability commands --
 * see src/greenfield/fullstack/fullstackCapabilityTypes.ts). Declared here,
 * not in the fullstack module, so profileTypes.ts stays the single owner of
 * GreenfieldProfileCommand and its extension fields, avoiding a circular
 * import (fullstack already depends on profileTypes for this type).
 */
export type GreenfieldCommandLifecyclePhase = 'development' | 'test' | 'production';

export interface GreenfieldProfileCommand {
  command: string;
  purpose: string;
  required: boolean;
  /** e.g. "requires a connected device or emulator"; omitted when not applicable. */
  environmentNotes?: string;
  /**
   * v1.3.1 Batch 4: optional; the lifecycle phase this command belongs to.
   * Omitted for existing typescript-cli/nextjs-app/android-compose profile
   * commands, which do not need this distinction and are unaffected.
   */
  lifecyclePhase?: GreenfieldCommandLifecyclePhase;
  /**
   * v1.3.1 Batch 4: optional; true when the command is destructive (e.g. a
   * guarded database reset). Used by scaffold-plan validation to reject a
   * destructive command scoped to `lifecyclePhase: 'production'`. Omitted
   * for existing profile commands, none of which are destructive.
   */
  destructive?: boolean;
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
  /**
   * v1.3.0 Batch 2 (corrected): bounded tags, drawn only from
   * `GREENFIELD_DOCUMENTATION_TERMINOLOGY_TAGS`, naming the platform/
   * framework terminology this profile's generated documentation is
   * allowed to use. Replaces the previous hardcoded
   * `selectedProfileId === 'android-compose'` branch in
   * validateBootstrapDocs.ts with profile-owned data; most profiles declare
   * no special terminology and use an empty array. TypeScript enforces this
   * at the built-in profile definitions; validateGreenfieldProfile()
   * additionally rejects unsupported or duplicate values at runtime for
   * externally constructed or malformed profile objects.
   */
  allowedDocumentationTerminology: readonly GreenfieldDocumentationTerminologyTag[];
  /**
   * v1.3.1 Batch 1: machine-readable declaration of which explicit
   * `projectType` values (see `GREENFIELD_PROJECT_TYPES`) this profile can
   * represent when a brief requests both a `projectType` and this profile
   * together (see resolveGreenfieldProfile.ts). Most profiles declare none.
   * Absence of `projectType` on the brief means this contract is not
   * evaluated; it does not affect existing profile resolution behavior.
   */
  compatibleProjectTypes: readonly GreenfieldProjectType[];
  /**
   * v1.3.1 Batch 1: machine-readable declaration of which explicit
   * `webFramework` values (see `GREENFIELD_WEB_FRAMEWORKS`) this profile can
   * represent when a brief requests both a `webFramework` and this profile
   * together. Most profiles declare none. Absence of `webFramework` on the
   * brief means this contract is not evaluated.
   */
  compatibleWebFrameworks: readonly GreenfieldWebFramework[];
  /**
   * v1.3.0 Batch 3: profile-owned target expectations, validated by
   * validateGreenfieldProfile() (structural shape) and consumed by
   * validateGreenfieldScaffoldPlan() (plan conformance). Per PSE-010,
   * `templateTargets` above is preserved unchanged as the existing public
   * contract that buildScaffoldPlan.ts and existing tests already consume;
   * `targetExpectations` adapts those same current values into required
   * exact expectations during this compatibility migration rather than
   * replacing or duplicating `templateTargets`'s meaning.
   */
  targetExpectations: readonly GreenfieldTargetExpectation[];
}

/**
 * v1.3.0 Batch 3: PseudocodePacket Decision 1 -- a bounded combination of
 * exact normalized paths and anchored bounded patterns, with `category`
 * retained as descriptive/grouping metadata only (it can never by itself
 * satisfy an expectation; see targetPathMatching.ts).
 */
export type GreenfieldTargetExpectationMatcherKind = 'exact' | 'bounded-pattern';

export interface GreenfieldTargetExpectationMatcher {
  kind: GreenfieldTargetExpectationMatcherKind;
  /** Root-relative normalized path (`kind: 'exact'`) or anchored bounded pattern (`kind: 'bounded-pattern'`). */
  value: string;
}

/** `file` by default; `directory` evidence is unsupported in v1.3.0 (PseudocodePacket, target expectation shape). */
export type GreenfieldTargetEvidenceKind = 'file';

export interface GreenfieldTargetExpectation {
  /** Stable profile-local identifier. */
  id: string;
  /** Descriptive semantic group (e.g. configuration, source, test, documentation, entry-point). Metadata only. */
  category: string;
  matcher: GreenfieldTargetExpectationMatcher;
  required: boolean;
  /** Nonblank corrective context. */
  purpose: string;
  evidenceKind: GreenfieldTargetEvidenceKind;
  /** Optional bounded profile-owned metadata; no shared allowlist entries are approved in v1.3.0. */
  extension?: Readonly<Record<string, string>>;
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
