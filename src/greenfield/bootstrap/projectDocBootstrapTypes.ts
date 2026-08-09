// Types for the platform-neutral project-docs bootstrap runtime.
//
// Adapted in concept from my-dev-kit-alpha's projectDocBootstrapTypes.ts
// (populated/partial/skipped status) but the shape is orchestrator-native:
// docs are generated as structured in-memory sections, not by filling
// markdown template files loaded from disk (see artifacts/greenfield-do-not-
// port-list.txt, "duplicate old/new template layouts").

import { GreenfieldUnresolvedDecision } from './bootstrapBundleTypes';

export type GreenfieldDocStatus = 'generated' | 'partial' | 'skipped';

export interface GreenfieldDocSection {
  heading: string;
  content: string;
}

/** The nine required v1.1.0 project-doc categories (section 9.2). */
export type GreenfieldProjectDocName =
  | 'product-boundary'
  | 'stack-decision'
  | 'starter-profile-summary'
  | 'development-workflow'
  | 'testing-expectations'
  | 'validation-expectations'
  | 'scaffold-planning-notes'
  | 'unresolved-decisions'
  | 'non-goals';

export interface GreenfieldDocTarget {
  docName: GreenfieldProjectDocName;
  status: GreenfieldDocStatus;
  sections: GreenfieldDocSection[];
  unresolvedNotes: string[];
}

export interface GreenfieldComponentDocTarget {
  componentName: string;
  status: GreenfieldDocStatus;
  sections: GreenfieldDocSection[];
  unresolvedNotes: string[];
}

// ─── v1.3.1 Batch 2: standardized common canonical project-document contract ────
//
// The ecosystem-standard document baseline (see
// reports/ecosystem-documentation-standardization-report.txt), now used as the
// generic greenfield bootstrap baseline for every supported starter profile.
// This is additive to (not a replacement of) the nine legacy
// GreenfieldProjectDocName categories above: those categories remain load-
// bearing evidence for the existing readiness/prompt-hash-guarded stage
// instruction content (src/greenfield/readiness/parseGreenfieldEvidence.ts,
// src/instructions/stageInstructionContent.ts) and are left untouched. The
// canonical inventory below is the new, single shared source of truth for
// the common document set; do not duplicate this list per profile,
// project-type, or web-framework.

/**
 * The ecosystem-standard common canonical greenfield document paths, in
 * deterministic bootstrap order. Every supported starter profile receives
 * this exact inventory; profile-specific requirements may only add content
 * to these documents, never remove, rename, or replace one (see
 * validateBootstrapDocs.ts).
 */
export type GreenfieldCanonicalDocumentPath =
  | 'README.md'
  | 'CHANGELOG.md'
  | 'docs/PROJECT_OVERVIEW.md'
  | 'docs/CURRENT_STATE.md'
  | 'docs/ARCHITECTURE.md'
  | 'docs/CONTRACTS.md'
  | 'docs/COMMANDS.md'
  | 'docs/WORKFLOWS.md'
  | 'docs/QUICKSTART.md'
  | 'docs/DEVELOPMENT.md'
  | 'docs/CI_CD.md'
  | 'docs/ROADMAP.md'
  | 'docs/RELEASE.md'
  | 'docs/SECURITY.md'
  | 'docs/DOCUMENTATION_PRESERVATION_POLICY.md';

/** A canonical document's stable, structural responsibility (not copied ecosystem prose). */
export interface GreenfieldCanonicalDocumentDescriptor {
  path: GreenfieldCanonicalDocumentPath;
  responsibility: string;
}

/**
 * The single shared, deterministically ordered registry of the common
 * canonical document inventory. Every path appears exactly once. Extend this
 * array (never a per-profile or per-project-type copy) if the canonical
 * baseline itself ever changes.
 */
export const GREENFIELD_CANONICAL_DOCUMENTS: readonly GreenfieldCanonicalDocumentDescriptor[] = [
  {
    path: 'README.md',
    responsibility:
      'First-contact project identity, value, setup, concise quickstart, current release/state summary, ' +
      'important limitations, and document navigation.',
  },
  { path: 'CHANGELOG.md', responsibility: 'Append-preserving user-visible release history.' },
  {
    path: 'docs/PROJECT_OVERVIEW.md',
    responsibility: 'Stable product thesis, users, use cases, capability areas, and boundaries.',
  },
  {
    path: 'docs/CURRENT_STATE.md',
    responsibility: 'Concise current implementation/release state and next planned direction.',
  },
  {
    path: 'docs/ARCHITECTURE.md',
    responsibility: 'Implemented subsystem ownership, flows, invariants, extension points, and failure boundaries.',
  },
  {
    path: 'docs/CONTRACTS.md',
    responsibility: 'Stable cross-cutting contract map and links to detailed specialized contracts.',
  },
  {
    path: 'docs/COMMANDS.md',
    responsibility: 'Current command/script interface relevant to operating the generated project.',
  },
  { path: 'docs/WORKFLOWS.md', responsibility: 'Operational project workflows.' },
  { path: 'docs/QUICKSTART.md', responsibility: 'Shortest successful first-use path.' },
  {
    path: 'docs/DEVELOPMENT.md',
    responsibility: 'Contributor setup, repository layout, and implementation/testing/validation guidance.',
  },
  {
    path: 'docs/CI_CD.md',
    responsibility: 'Actual continuous-integration and delivery/release-automation boundaries.',
  },
  { path: 'docs/ROADMAP.md', responsibility: 'Future version/product planning.' },
  { path: 'docs/RELEASE.md', responsibility: 'Project release procedure.' },
  { path: 'docs/SECURITY.md', responsibility: 'Project/tool security and trust boundaries.' },
  {
    path: 'docs/DOCUMENTATION_PRESERVATION_POLICY.md',
    responsibility: 'Documentation authority, preservation, relocation, deletion, and anti-drift rules.',
  },
] as const;

/** Derived membership/ordering list for population and validation; do not declare independently. */
export const GREENFIELD_CANONICAL_DOCUMENT_PATHS: readonly GreenfieldCanonicalDocumentPath[] =
  GREENFIELD_CANONICAL_DOCUMENTS.map((d) => d.path);

export interface GreenfieldCanonicalDocumentTarget {
  path: GreenfieldCanonicalDocumentPath;
  status: GreenfieldDocStatus;
  sections: GreenfieldDocSection[];
  unresolvedNotes: string[];
}

export interface GreenfieldProjectDocBootstrapResult {
  targets: GreenfieldDocTarget[];
  componentTargets: GreenfieldComponentDocTarget[];
  /**
   * v1.3.1 Batch 2: the standardized common canonical document baseline.
   * Optional so the existing readiness-evidence reconstruction path
   * (parseGreenfieldEvidence.ts's reconstructProjectDocsBootstrapResult(),
   * which predates this contract and has no rendered-report section to
   * reconstruct it from yet) continues to produce a valid result without
   * this field. bootstrapProjectDocs() always populates it.
   */
  canonicalDocuments?: GreenfieldCanonicalDocumentTarget[];
  unresolvedDecisions: GreenfieldUnresolvedDecision[];
}
