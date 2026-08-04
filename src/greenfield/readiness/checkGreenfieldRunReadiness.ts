// v1.3.0 Batch 4 (corrected): the sole disk/lifecycle-reading boundary for
// greenfield readiness. Resolves the selected profile from the existing
// structured bootstrap-bundle.json artifact, reads the existing native text
// artifacts, reuses the existing artifact-lifecycle stale detection, and
// delegates all evaluation to the pure evaluateGreenfieldReadiness().
// Read-only; does not execute commands or write artifacts. scaffold-plan.txt
// is a rendered prose artifact; it is parsed via
// parseGreenfieldScaffoldPlanArtifact() (parseGreenfieldEvidence.ts) into a
// GreenfieldScaffoldPlan before being handed to evaluateGreenfieldReadiness(),
// the same "read text, parse bounded sections, reconstruct the in-memory
// shape" pattern this file already uses for bootstrap-bundle.json and (via
// the evaluator) the other native text artifacts.
import * as fs from 'fs';
import * as path from 'path';
import { RunMetadata } from '../../run';
import { readArtifactStateFile, getUpstreamArtifacts, isArtifactStale } from '../../artifactLifecycle';
import { parseArtifact } from '../../artifactChecker';
import { SUPPORTED_PROFILES } from '../profiles/resolveGreenfieldProfile';
import { GreenfieldProfileId } from '../profiles/profileTypes';
import { evaluateGreenfieldReadiness } from './evaluateGreenfieldReadiness';
import { parseGreenfieldScaffoldPlanArtifact } from './parseGreenfieldEvidence';
import { GreenfieldReadinessResult } from './greenfieldReadinessTypes';
import { GreenfieldScaffoldPlan } from '../scaffold/scaffoldPlanTypes';

const SCAFFOLD_PLAN_FILE = 'artifacts/scaffold-plan.txt';
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

function readScaffoldPlan(runFolder: string): GreenfieldScaffoldPlan | undefined {
  const raw = readTextIfExists(runFolder, SCAFFOLD_PLAN_FILE);
  if (raw === undefined) {
    // File absent entirely. evaluateGreenfieldReadiness() only skips plan
    // validation when the caller supplies no plan at all; for a legacy run
    // that is correct (the plan predates the structured template). For a
    // non-legacy run this still needs a defined plan so
    // validateGreenfieldScaffoldPlan() can report GF_PLAN_PROFILE_MISMATCH
    // instead of the gap silently passing -- an empty parse (all sections
    // absent) reconstructs to profileId: undefined, which does exactly that.
    return parseGreenfieldScaffoldPlanArtifact(parseArtifact(''));
  }
  return parseGreenfieldScaffoldPlanArtifact(parseArtifact(raw));
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
    scaffoldPlan: readScaffoldPlan(meta.runFolder),
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
