// v1.3.0 Batch 4: the sole disk/lifecycle-reading boundary for greenfield
// readiness. Resolves the selected profile from the existing structured
// bootstrap-bundle.json artifact, reads the existing native text artifacts,
// reuses the existing artifact-lifecycle stale detection, and delegates all
// evaluation to the pure evaluateGreenfieldReadiness(). Read-only; does not
// execute commands or write artifacts. scaffold-plan.txt is a rendered
// prose artifact (not a structured GreenfieldScaffoldPlan serialization),
// so plan conformance is intentionally not re-derived from disk here --
// evaluateGreenfieldReadiness() accepts an in-memory plan only when a
// caller already has one.
import * as fs from 'fs';
import * as path from 'path';
import { RunMetadata } from '../../run';
import { readArtifactStateFile, getUpstreamArtifacts, isArtifactStale } from '../../artifactLifecycle';
import { SUPPORTED_PROFILES } from '../profiles/resolveGreenfieldProfile';
import { GreenfieldProfileId } from '../profiles/profileTypes';
import { evaluateGreenfieldReadiness } from './evaluateGreenfieldReadiness';
import { GreenfieldReadinessResult } from './greenfieldReadinessTypes';

const SCAFFOLD_IMPLEMENTATION_REPORT_FILE = 'reports/scaffold-implementation-report.txt';
const FIRST_VERTICAL_SLICE_FILE = 'artifacts/first-vertical-slice.txt';
const VERIFICATION_REPORT_FILE = 'reports/verification-report.txt';
const PROJECT_DOCS_REPORT_FILE = 'artifacts/project-docs-report.txt';
const BOOTSTRAP_BUNDLE_FILE = 'artifacts/bootstrap-bundle.json';

function readTextIfExists(runFolder: string, relativePath: string): string | undefined {
  const fullPath = path.join(runFolder, relativePath);
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch {
    return undefined;
  }
}

function resolveSelectedProfileId(runFolder: string): GreenfieldProfileId | undefined {
  const raw = readTextIfExists(runFolder, BOOTSTRAP_BUNDLE_FILE);
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as { selectedProfile?: { profile?: { id?: string } } };
    const id = parsed.selectedProfile?.profile?.id;
    return typeof id === 'string' && id in SUPPORTED_PROFILES ? (id as GreenfieldProfileId) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Evaluates readiness for a greenfield run. Returns `undefined` for a
 * non-greenfield run, or when no profile has been selected yet (nothing to
 * evaluate; that is a normal, earlier-stage state, not a readiness defect).
 */
export function checkGreenfieldRunReadiness(meta: RunMetadata): GreenfieldReadinessResult | undefined {
  if (meta.mode !== 'greenfield') {
    return undefined;
  }

  const profileId = resolveSelectedProfileId(meta.runFolder);
  if (!profileId) {
    return undefined;
  }
  const profile = SUPPORTED_PROFILES[profileId];

  const stateFile = readArtifactStateFile(meta.runFolder);
  const scaffoldReportUpstream = getUpstreamArtifacts(meta.stages, SCAFFOLD_IMPLEMENTATION_REPORT_FILE);
  const sliceUpstream = getUpstreamArtifacts(meta.stages, FIRST_VERTICAL_SLICE_FILE);

  return evaluateGreenfieldReadiness({
    profile,
    scaffoldImplementationReportContent: readTextIfExists(meta.runFolder, SCAFFOLD_IMPLEMENTATION_REPORT_FILE),
    scaffoldImplementationReportStale: isArtifactStale(
      meta.runFolder,
      SCAFFOLD_IMPLEMENTATION_REPORT_FILE,
      scaffoldReportUpstream,
      stateFile,
    ),
    firstVerticalSliceContent: readTextIfExists(meta.runFolder, FIRST_VERTICAL_SLICE_FILE),
    firstVerticalSliceStale: isArtifactStale(meta.runFolder, FIRST_VERTICAL_SLICE_FILE, sliceUpstream, stateFile),
    verificationReportContent: readTextIfExists(meta.runFolder, VERIFICATION_REPORT_FILE),
    projectDocsReportContent: readTextIfExists(meta.runFolder, PROJECT_DOCS_REPORT_FILE),
    projectRoot: resolveAccessibleProjectRoot(meta.projectRoot),
  });
}

function resolveAccessibleProjectRoot(projectRoot: string | undefined): string | undefined {
  if (!projectRoot) {
    return undefined;
  }
  try {
    return fs.statSync(projectRoot).isDirectory() ? projectRoot : undefined;
  } catch {
    return undefined; // 6.2: corroboration is optional -- an inaccessible root simply disables it.
  }
}
