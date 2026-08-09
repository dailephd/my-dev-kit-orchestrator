// Types for the platform-neutral GreenfieldBootstrapBundle runtime.
//
// Neither historical source's bundle concept fits here: my-dev-kit-alpha's
// buildBootstrapBundle.ts produces a BootstrapBundle that extends TaskBundle
// (its own general-purpose LLM orchestration infra) and embeds a
// non-deterministic `Date.now()`-based id/timestamp, and reads template
// files from disk. Batch 1 labeled this REWRITE_FOR_ORCHESTRATOR (see
// artifacts/greenfield-porting-map.txt); Batch 2's starter bridge decision
// (artifacts/greenfield-starter-bridge-decision.txt) already rejected
// StarterConfig in favor of GreenfieldProfileSelection. This module defines
// the orchestrator-native bundle shape that consumes both without either
// coupling.

import { NormalizedGreenfieldBrief } from '../brief/briefTypes';
import {
  GreenfieldProfileId,
  GreenfieldProfileResolutionStatus,
  GreenfieldProfileSelection,
} from '../profiles/profileTypes';
import { GreenfieldFullstackCapabilitySelection } from '../fullstack/resolveFullstackCapability';

/** A field the bundle-building process left unresolved, preserved rather than guessed. */
export interface GreenfieldUnresolvedDecision {
  field: string;
  reason: string;
}

export type GreenfieldStackDecisionStatus = 'resolved' | 'partially-resolved' | 'unresolved';

/** Platform-neutral expression of the project's stack decision. */
export interface GreenfieldStackDecision {
  status: GreenfieldStackDecisionStatus;
  /** The final stack entries suitable for later scaffold planning; empty when unresolved. */
  chosenStack: string[];
  /** The stack entries the brief explicitly requested, unmodified. */
  userPreferredStack: string[];
  /** Notes explaining how the stack decision was reached. */
  notes: string[];
  /** Profile ids the brief requested but that are not supported (never silently dropped). */
  unsupportedRequests: string[];
}

/** A category of future template/doc/scaffold target, described but not generated. */
export interface GreenfieldTemplateTargetCategory {
  category: string;
  description: string;
  applicable: boolean;
}

/** Compact profile summary suitable for artifacts/starter-profile.json. */
export interface GreenfieldStarterProfileSummary {
  status: GreenfieldProfileResolutionStatus;
  profileId?: GreenfieldProfileId;
  displayName?: string;
  category?: string;
  requestedProfileId?: string;
  reason: string;
}

/** Structured instructions suitable for driving the later project-docs bootstrap stage. */
export interface GreenfieldDocGenerationInstructions {
  productBoundary: string;
  stackDecisionSummary: string;
  testingExpectations: string[];
  validationExpectations: string[];
  knownUncertainties: string[];
}

/** Planning-only inputs for a later scaffold-plan stage. No scaffold is generated here. */
export interface GreenfieldScaffoldPlanningInputs {
  profileId?: GreenfieldProfileId;
  scaffoldPlanningHints: string[];
  templateTargets: string[];
  unresolvedDecisions: string[];
}

/** A declarative rule used to validate bundle/doc completeness (not release/security/publish rules). */
export interface GreenfieldBundleValidationRule {
  id: string;
  description: string;
}

/**
 * The platform-neutral bootstrap bundle: the single artifact-oriented output
 * of Batch 3's bootstrap runtime. Deterministic for a given normalized brief
 * and profile selection (see buildGreenfieldBootstrapBundle.ts).
 */
export interface GreenfieldBootstrapBundle {
  normalizedBrief: NormalizedGreenfieldBrief;
  selectedProfile: GreenfieldProfileSelection;
  starterProfile: GreenfieldStarterProfileSummary;
  stackDecision: GreenfieldStackDecision;
  templateTargets: GreenfieldTemplateTargetCategory[];
  docGenerationInstructions: GreenfieldDocGenerationInstructions;
  scaffoldPlanningInputs: GreenfieldScaffoldPlanningInputs;
  validationRules: GreenfieldBundleValidationRule[];
  unresolvedDecisions: GreenfieldUnresolvedDecision[];
  /**
   * v1.3.1 Batch 3: the resolved full-stack environment/database/Docker
   * capability, when the requested projectType/webFramework/profile
   * combination supports one (see resolveFullstackCapability.ts). Status is
   * 'not-applicable' for ordinary non-full-stack bundles, so this field is
   * always present and never requires a second bundle type.
   */
  fullstackCapability: GreenfieldFullstackCapabilitySelection;
}
