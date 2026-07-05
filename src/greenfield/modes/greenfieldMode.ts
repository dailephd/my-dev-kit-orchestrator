// Artifact-file-path definitions for the greenfield workflow mode's
// stage-specific (non-shared) stages.
//
// Consumed by src/workflows.ts, which spreads this into its existing
// ARTIFACT_MAP Record rather than creating a second artifact-map registry.
// Only the 10 stage names unique to greenfield are listed here;
// 'verification', 'judge', and 'final-report' (see greenfieldStages.ts)
// intentionally reuse the artifact paths ARTIFACT_MAP already defines for
// those shared stage names, so they are not repeated here to avoid two
// sources of truth for the same path.

export const GREENFIELD_MODE = 'greenfield' as const;

export const GREENFIELD_ARTIFACT_MAP: Record<string, string> = {
  'idea-brief': 'artifacts/idea-brief.json',
  'product-boundary': 'artifacts/product-boundary.txt',
  'stack-decision': 'artifacts/stack-decision.txt',
  'starter-profile': 'artifacts/starter-profile.json',
  'bootstrap-bundle': 'artifacts/bootstrap-bundle.json',
  'project-docs': 'artifacts/project-docs-report.txt',
  'scaffold-plan': 'artifacts/scaffold-plan.txt',
  'scaffold-implementation': 'reports/scaffold-implementation-report.txt',
  'first-vertical-slice': 'artifacts/first-vertical-slice.txt',
  'initial-index': 'reports/initial-index-report.txt',
};
