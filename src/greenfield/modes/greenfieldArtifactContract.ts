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
import {
  validateBootstrapBundleArtifact,
  validateIdeaBriefArtifact,
  validateStarterProfileArtifact,
} from './greenfieldStructuredArtifactValidators';

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

export const GREENFIELD_SECTION_REGISTRY: Record<string, SectionRequirements> = {
  IdeaBrief: {
    required: [],
    format: 'json',
    requiredFields: [
      'rawIdea',
      'constraints',
      'nonGoals',
      'preferredStack',
      'documentationPreferences',
      'testingExpectations',
      'unresolved',
      'status',
    ],
    validateJson: validateIdeaBriefArtifact,
  },
  ProductBoundary: { required: ['Artifact', 'Workflow mode', 'Status'] },
  StackDecision: { required: ['Artifact', 'Workflow mode', 'Status'] },
  StarterProfile: {
    required: [],
    format: 'json',
    requiredFields: ['status', 'profile', 'reason', 'stackDecisionNotes'],
    validateJson: validateStarterProfileArtifact,
  },
  GreenfieldBootstrapBundleArtifact: {
    required: [],
    format: 'json',
    requiredFields: [
      'normalizedBrief',
      'selectedProfile',
      'starterProfile',
      'stackDecision',
      'templateTargets',
      'docGenerationInstructions',
      'scaffoldPlanningInputs',
      'validationRules',
      'unresolvedDecisions',
      'fullstackCapability',
      'status',
    ],
    validateJson: validateBootstrapBundleArtifact,
  },
  ProjectDocsReport: { required: ['Artifact', 'Workflow mode', 'Status'] },
  ScaffoldPlan: { required: ['Artifact', 'Workflow mode', 'Status'] },
  ScaffoldImplementationReport: { required: ['Artifact', 'Workflow mode', 'Status'] },
  FirstVerticalSlice: { required: ['Artifact', 'Workflow mode', 'Status'] },
  InitialIndexReport: { required: ['Artifact', 'Workflow mode', 'Status'] },
};
