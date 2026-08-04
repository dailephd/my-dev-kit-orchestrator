// Artifact-kind and required-section definitions for the greenfield
// workflow mode's stage-specific (non-shared) stages.
//
// Consumed by src/artifactChecker.ts, which spreads these into its existing
// STAGE_TO_KIND and SECTION_REGISTRY Records rather than creating a second
// artifact-contract system. This is what makes `check`/`check --artifacts`
// automatically cover greenfield artifacts once the mode is registered
// (section 8.5: minimal, unavoidable shared-definition exposure -- not full
// check/export parity, which remains Batch 5 scope).
//
// 'verification', 'judge', and 'final-report' are intentionally excluded
// here: they already have entries in artifactChecker.ts's STAGE_TO_KIND
// (VerificationReport, JudgeReport, FinalReport) and SECTION_REGISTRY,
// reused as-is by greenfield (see greenfieldStages.ts).

import type { SectionRequirements } from '../../artifactChecker';

export const GREENFIELD_STAGE_TO_KIND: Record<string, string> = {
  'idea-brief': 'IdeaBrief',
  'product-boundary': 'ProductBoundary',
  'stack-decision': 'StackDecision',
  'starter-profile': 'StarterProfile',
  'bootstrap-bundle': 'GreenfieldBootstrapBundleArtifact',
  'project-docs': 'ProjectDocsReport',
  'scaffold-plan': 'ScaffoldPlan',
  'scaffold-implementation': 'ScaffoldImplementationReport',
  'first-vertical-slice': 'FirstVerticalSlice',
  'initial-index': 'InitialIndexReport',
};

// v1.3.0 Batch 4: the required lists below stay exactly as approved by
// Batch 1-3 (generic Artifact/Workflow mode/Status only). checkArtifact()
// applies this SECTION_REGISTRY unconditionally to every run, old and new
// alike, with no legacy discriminator -- adding the new Batch 4 structured
// sections (Profile, Files changed, Commands run, per-doc-name sections,
// etc.) here would retroactively fail every pre-Batch-4 run's generic
// artifact check, which the approved compatibility policy forbids. Those
// new sections are optional as far as this generic registry is concerned;
// evaluateGreenfieldReadiness() (src/greenfield/readiness/) enforces them
// with its own artifact-section-presence legacy discriminator instead.
export const GREENFIELD_SECTION_REGISTRY: Record<string, SectionRequirements> = {
  IdeaBrief: { required: ['Artifact', 'Workflow mode', 'Status'] },
  ProductBoundary: { required: ['Artifact', 'Workflow mode', 'Status'] },
  StackDecision: { required: ['Artifact', 'Workflow mode', 'Status'] },
  StarterProfile: { required: ['Artifact', 'Workflow mode', 'Status'] },
  GreenfieldBootstrapBundleArtifact: { required: ['Artifact', 'Workflow mode', 'Status'] },
  ProjectDocsReport: { required: ['Artifact', 'Workflow mode', 'Status'] },
  ScaffoldPlan: { required: ['Artifact', 'Workflow mode', 'Status'] },
  ScaffoldImplementationReport: { required: ['Artifact', 'Workflow mode', 'Status'] },
  FirstVerticalSlice: { required: ['Artifact', 'Workflow mode', 'Status'] },
  InitialIndexReport: { required: ['Artifact', 'Workflow mode', 'Status'] },
};
