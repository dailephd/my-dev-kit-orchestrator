// Ordered stage-name list for the greenfield workflow mode.
//
// Consumed by src/workflows.ts's buildStages() the same way every other
// mode's stage-name array is consumed (see FEATURE_STAGES, REPAIR_STAGES,
// etc.) -- this does not create a parallel workflow engine; it is data fed
// into the existing one (Batch 1 target architecture, "extend not
// duplicate").
//
// Three stage names are intentionally reused from the shared vocabulary
// already used by every other mode: 'verification', 'judge', and
// 'final-report'. This means their artifact file path is whatever
// src/workflows.ts's ARTIFACT_MAP already defines for those stage names
// (artifacts/verification-report.txt, artifacts/judge-report.txt,
// artifacts/final-report.txt) -- not reports/*.txt as an isolated greenfield
// convention would suggest, because ARTIFACT_MAP is a single flat registry
// keyed by stage name and shared across all modes; giving 'verification' a
// different path for greenfield would break every other mode that already
// depends on that exact path. See reports/batch-4-implementation-report.txt
// ("Deviations") for the full reasoning.
export const GREENFIELD_STAGE_NAMES: string[] = [
  'idea-brief',
  'product-boundary',
  'stack-decision',
  'starter-profile',
  'bootstrap-bundle',
  'project-docs',
  'scaffold-plan',
  'scaffold-implementation',
  'first-vertical-slice',
  'verification',
  'initial-index',
  'judge',
  'final-report',
];
