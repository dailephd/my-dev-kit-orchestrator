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
import { GreenfieldFullstackCapability } from '../fullstack/fullstackCapabilityTypes';
import { StageDefinition } from '../../workflows';

const SCAFFOLD_PLAN_FILE = 'artifacts/scaffold-plan.txt';
const SCAFFOLD_IMPLEMENTATION_REPORT_FILE = 'reports/scaffold-implementation-report.txt';
const FIRST_VERTICAL_SLICE_FILE = 'artifacts/first-vertical-slice.txt';
const VERIFICATION_REPORT_FILE = 'artifacts/verification-report.txt';
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
 * v1.3.1 Batch 5: reads the same persisted bootstrap-bundle.json used by
 * resolveSelectedProfileId() and extracts the resolved full-stack
 * capability, when Batch 3's `fullstackCapability.status === 'selected'`.
 * Returns undefined for every ordinary non-full-stack run, or when the
 * artifact is missing/unparseable -- readiness then evaluates exactly as it
 * did before Batch 5.
 */
function resolveFullstackCapability(runFolder: string): GreenfieldFullstackCapability | undefined {
  const raw = readTextIfExists(runFolder, BOOTSTRAP_BUNDLE_FILE);
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as {
      fullstackCapability?: { status?: string; capability?: GreenfieldFullstackCapability };
    };
    return parsed.fullstackCapability?.status === 'selected' ? parsed.fullstackCapability.capability : undefined;
  } catch {
    return undefined;
  }
}

/**
 * v1.3.1 Batch 5 correction: the narrow, RunMetadata-independent core of
 * checkGreenfieldRunReadiness(), taking only the fields actually needed
 * (mode/runFolder/stages, with optional projectRoot for filesystem
 * corroboration). Extracted so src/judgeIntegrity.ts's mode-agnostic
 * evaluateFinalReportEligibility() can consult canonical greenfield
 * readiness using only the parameters it already receives (gate.mode,
 * runFolder, stages), without depending on the full RunMetadata shape and
 * without duplicating this file's disk-reading logic. This is the same
 * "read text, parse bounded sections, delegate to the pure evaluator"
 * behavior as checkGreenfieldRunReadiness() below, which now delegates to
 * this function and is unchanged for every existing caller (status.ts,
 * check.ts).
 */
export interface CheckGreenfieldRunReadinessForRunInput {
  readonly mode: string;
  readonly runFolder: string;
  readonly stages: readonly StageDefinition[];
  readonly projectRoot?: string;
}

export function checkGreenfieldRunReadinessForRun(
  input: CheckGreenfieldRunReadinessForRunInput,
): GreenfieldReadinessResult | undefined {
  if (input.mode !== 'greenfield') {
    return undefined;
  }

  const profileId = resolveSelectedProfileId(input.runFolder);
  if (!profileId) {
    return undefined;
  }
  const profile = SUPPORTED_PROFILES[profileId];

  const stateFile = readArtifactStateFile(input.runFolder);
  const scaffoldReportUpstream = getUpstreamArtifacts(
    input.stages as StageDefinition[],
    SCAFFOLD_IMPLEMENTATION_REPORT_FILE,
  );
  const sliceUpstream = getUpstreamArtifacts(input.stages as StageDefinition[], FIRST_VERTICAL_SLICE_FILE);

  return evaluateGreenfieldReadiness({
    profile,
    scaffoldPlan: readScaffoldPlan(input.runFolder),
    scaffoldImplementationReportContent: readTextIfExists(input.runFolder, SCAFFOLD_IMPLEMENTATION_REPORT_FILE),
    scaffoldImplementationReportStale: isArtifactStale(
      input.runFolder,
      SCAFFOLD_IMPLEMENTATION_REPORT_FILE,
      scaffoldReportUpstream,
      stateFile,
    ),
    firstVerticalSliceContent: readTextIfExists(input.runFolder, FIRST_VERTICAL_SLICE_FILE),
    firstVerticalSliceStale: isArtifactStale(input.runFolder, FIRST_VERTICAL_SLICE_FILE, sliceUpstream, stateFile),
    verificationReportContent: readTextIfExists(input.runFolder, VERIFICATION_REPORT_FILE),
    projectDocsReportContent: readTextIfExists(input.runFolder, PROJECT_DOCS_REPORT_FILE),
    projectRoot: resolveAccessibleProjectRoot(input.projectRoot),
    capability: resolveFullstackCapability(input.runFolder),
  });
}

/**
 * Evaluates readiness for a greenfield run. Returns `undefined` for a
 * non-greenfield run, or when no profile has been selected yet (nothing to
 * evaluate; that is a normal, earlier-stage state, not a readiness defect).
 */
export function checkGreenfieldRunReadiness(meta: RunMetadata): GreenfieldReadinessResult | undefined {
  return checkGreenfieldRunReadinessForRun({
    mode: meta.mode,
    runFolder: meta.runFolder,
    stages: meta.stages,
    projectRoot: meta.projectRoot,
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
