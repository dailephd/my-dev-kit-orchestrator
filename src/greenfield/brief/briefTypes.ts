// Brief contract types for the v1.1.0 Greenfield Bootstrap Foundation.
//
// Ported and adapted from my-dev-kit-alpha's src/newProject/briefTypes.ts
// (see .my-dev-kit-orchestrator/runs/20260705T092513-v1-1-0-batch-1-greenfield-source-compari/
// artifacts/greenfield-porting-map.txt, subsystem "Brief types and schema", PORT_FROM_MY_DEV_KIT).
//
// Terminology:
// - "brief" = raw platform-neutral inputs describing a new project idea
// - "normalized brief" = deterministic internal shape derived from those inputs
// This module does not define profile-catalog types (see
// src/greenfield/profiles/profileTypes.ts) or bootstrap-bundle types (deferred
// to a later batch per artifacts/greenfield-starter-bridge-decision.txt).

// ─── Raw brief input ───────────────────────────────────────────────────────────

export interface GreenfieldProjectBrief {
  /** Required: the raw, free-text project idea. */
  rawIdea: string;
  /** Optional: human-readable project name, when already known. */
  projectName?: string;
  /** Optional: what the project is meant to achieve. */
  productGoal?: string;
  /** Optional: who the project is for. */
  usersOrAudience?: string;
  /** Optional: the primary workflow the project must support. */
  coreWorkflow?: string;
  /** Optional: known constraints the project must respect. */
  constraints?: string[];
  /** Optional: explicit non-goals for the project. */
  nonGoals?: string[];
  /** Optional: preferred technology stack entries. */
  preferredStack?: string[];
  /** Optional: preferred starter profile id (e.g. "typescript-cli"). */
  preferredProfile?: string;
  /** Optional: target platform (e.g. "web", "cli", "server"). */
  platformTarget?: string;
  /**
   * Optional (v1.3.1 Batch 1): requested project type, orthogonal to
   * `preferredProfile` (e.g. "fullstack-web"). Not required for legacy or
   * non-web projects; see src/greenfield/profiles/profileTypes.ts for the
   * currently implemented values.
   */
  projectType?: string;
  /**
   * Optional (v1.3.1 Batch 1): requested web framework, orthogonal to
   * `preferredProfile` (e.g. "nextjs"). Not required for legacy or non-web
   * projects; see src/greenfield/profiles/profileTypes.ts for the currently
   * implemented values.
   */
  webFramework?: string;
  /** Optional: documentation preferences. */
  documentationPreferences?: string[];
  /** Optional: testing expectations. */
  testingExpectations?: string[];
}

// ─── Warnings ───────────────────────────────────────────────────────────────────

/**
 * Bounded set of warning kinds produced during brief normalization.
 * Warnings indicate missing specificity, not hard errors.
 */
export type GreenfieldBriefWarningKind =
  | 'sparse-idea'
  | 'missing-project-name'
  | 'candidate-name-inferred'
  | 'missing-product-goal'
  | 'missing-users-or-audience'
  | 'missing-core-workflow'
  | 'missing-stack'
  | 'missing-profile-preference';

export interface GreenfieldBriefWarning {
  kind: GreenfieldBriefWarningKind;
  message: string;
}

// ─── Unresolved questions ───────────────────────────────────────────────────────

/** A field the brief left ambiguous or unresolved, preserved explicitly rather than guessed. */
export interface GreenfieldBriefUnresolved {
  field: string;
  reason: string;
}

// ─── Normalized brief output ────────────────────────────────────────────────────

/**
 * The stable, deterministic normalized brief shape produced by
 * normalizeProjectBrief(). Fields prefixed with `candidate` are derived from
 * the raw idea text and are not authoritative unless clearly sourced from an
 * explicit brief field.
 */
export interface NormalizedGreenfieldBrief {
  rawIdea: string;
  candidateProjectName?: string;
  productGoal?: string;
  usersOrAudience?: string;
  coreWorkflow?: string;
  constraints: string[];
  nonGoals: string[];
  preferredStack: string[];
  preferredProfile?: string;
  platformTarget?: string;
  /** v1.3.1 Batch 1: orthogonal to preferredProfile; see GreenfieldProjectBrief.projectType. */
  projectType?: string;
  /** v1.3.1 Batch 1: orthogonal to preferredProfile; see GreenfieldProjectBrief.webFramework. */
  webFramework?: string;
  documentationPreferences: string[];
  testingExpectations: string[];
  /** Fields the brief left ambiguous, preserved explicitly rather than guessed. */
  unresolved: GreenfieldBriefUnresolved[];
}

export interface GreenfieldBriefNormalizationResult {
  normalized: NormalizedGreenfieldBrief;
  warnings: GreenfieldBriefWarning[];
}
