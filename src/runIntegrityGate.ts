// Canonical RunIntegrityGate (v1.2.3 Batch 2).
//
// One pure, deterministic evaluator that every readiness-sensitive workflow
// surface (prompt, lifecycle/stage detection, mark, status, check,
// contract-check) consults instead of independently re-deriving readiness.
//
// This module does not recompute readiness. It consumes
// evaluateRunContextReadiness() (src/instructions/runContextReadiness.ts),
// which itself consumes Batch 1's corrected producer evidence and
// contextReadiness.ts's fail-closed raw/supplemental reconciliation. This
// module only adds the run/stage-level enforcement decisions those readiness
// results do not yet expose: which native stages are blocked, whether a
// stage may render its normal prompt / accept a completion artifact / be
// marked complete / advance, and the canonical expected judge verdict.
//
// Batch 2 scope only: this establishes the canonical expected judge verdict
// as gate output. It does not compare that expectation against an authored
// JudgeReport verdict, and it does not gate final-report eligibility -- both
// are Batch 3.

import { ArtifactStateFile, resolveArtifactState, ArtifactLifecycleState } from './artifactLifecycle';
import { StageDefinition } from './workflows';
import { ContextReadinessBlockerSummary, ContextReadinessResult } from './instructions/contextReadiness';
import { evaluateRunContextReadiness, RunContextReadinessSummary } from './instructions/runContextReadiness';

export const RUN_INTEGRITY_GATE_SCHEMA_VERSION = '1.0.0';

export type RunIntegrityReadinessClassification = 'not-required' | 'ready' | 'refresh-required';

export type RunIntegrityExpectedJudgeVerdict = 'PASS' | 'NEED_CONTEXT';

// The only two native stage names any repository-evidence requirement ever
// attaches to (see stageRepositoryEvidenceRequirements.ts's exact 11-entry
// matrix: role 'implementation' always names stage "implementation", role
// 'test-implementation' always names stage "test-implementation").
const CONTEXT_SENSITIVE_STAGE_NAMES = ['implementation', 'test-implementation'] as const;
export type ContextSensitiveStageName = (typeof CONTEXT_SENSITIVE_STAGE_NAMES)[number];

export interface RunIntegrityGateResult {
  schemaVersion: string;
  mode: string;
  contextRequired: boolean;
  applicableContextKinds: Array<'implementation' | 'test'>;
  implementationContext?: ContextReadinessResult;
  testContext?: ContextReadinessResult;
  contextReady: boolean;
  readinessClassification: RunIntegrityReadinessClassification;
  // Native stage names ('implementation' and/or 'test-implementation') that
  // are currently refresh-required. Downstream stages are never listed here
  // directly -- the sequential stage-completion model in stageDetector.ts
  // already stops at the first blocked stage in workflow order, so blocking
  // this stage is sufficient to prevent every stage after it from advancing.
  blockedStageNames: ContextSensitiveStageName[];
  blockingCodes: string[];
  primaryBlocker?: ContextReadinessBlockerSummary;
  recommendedCorrectionStage: string | null;
  expectedJudgeVerdict: RunIntegrityExpectedJudgeVerdict;
  warnings: string[];
}

export interface EvaluateRunIntegrityGateInput {
  mode: string;
  runFolder: string;
  workflowStageNames: readonly string[];
  projectRoot?: string;
}

// Derives the canonical gate result from an already-computed
// RunContextReadinessSummary. Exposed separately from
// evaluateRunIntegrityGate() so callers that already hold a summary (e.g.
// check.ts, which also renders it) never recompute readiness a second time.
export function deriveRunIntegrityGateResult(
  mode: string,
  summary: RunContextReadinessSummary,
): RunIntegrityGateResult {
  const applicableContextKinds: Array<'implementation' | 'test'> = [];
  if (summary.implementationContext) applicableContextKinds.push('implementation');
  if (summary.testContext) applicableContextKinds.push('test');

  const blockedStageNames: ContextSensitiveStageName[] = [];
  if (summary.implementationContext?.decision === 'refresh-required') blockedStageNames.push('implementation');
  if (summary.testContext?.decision === 'refresh-required') blockedStageNames.push('test-implementation');

  const contextRequired = summary.overallDecision !== 'not-required';
  const contextReady = summary.overallDecision !== 'refresh-required';

  return {
    schemaVersion: RUN_INTEGRITY_GATE_SCHEMA_VERSION,
    mode,
    contextRequired,
    applicableContextKinds,
    ...(summary.implementationContext ? { implementationContext: summary.implementationContext } : {}),
    ...(summary.testContext ? { testContext: summary.testContext } : {}),
    contextReady,
    readinessClassification: summary.overallDecision,
    blockedStageNames,
    blockingCodes: summary.blockingIssueCodes,
    ...(summary.primaryBlocker ? { primaryBlocker: summary.primaryBlocker } : {}),
    recommendedCorrectionStage: summary.recommendedNextStage,
    expectedJudgeVerdict: contextReady ? 'PASS' : 'NEED_CONTEXT',
    warnings: summary.warnings,
  };
}

// Canonical single entry point: evaluates repository-context readiness once
// and derives the gate result from it. Every command surface that does not
// already hold a RunContextReadinessSummary should call this instead of
// calling evaluateRunContextReadiness() directly, so a single call site
// owns "how readiness becomes an enforcement decision."
export function evaluateRunIntegrityGate(input: EvaluateRunIntegrityGateInput): RunIntegrityGateResult {
  const summary = evaluateRunContextReadiness(input);
  return deriveRunIntegrityGateResult(input.mode, summary);
}

export interface StageRunIntegrityDecision {
  stageName: string;
  contextSensitive: boolean;
  blocked: boolean;
  stageMayRenderNormalPrompt: boolean;
  stageMayCreateOrAcceptCompletionArtifact: boolean;
  stageMayMarkComplete: boolean;
  stageMayAdvance: boolean;
  blockingReason?: string;
}

function blockingReasonFor(gate: RunIntegrityGateResult, stageName: ContextSensitiveStageName): string | undefined {
  const result = stageName === 'implementation' ? gate.implementationContext : gate.testContext;
  return result?.blockerSummary?.primaryReason ?? gate.primaryBlocker?.primaryReason;
}

// Per-stage projection of the canonical gate result. Every readiness-
// sensitive surface (prompt, lifecycle, mark, status, check) asks this
// function the same question about the same gate result -- there is no
// second policy for "is this stage allowed to proceed."
export function evaluateStageRunIntegrity(
  gate: RunIntegrityGateResult,
  stageName: string,
): StageRunIntegrityDecision {
  const contextSensitive = (CONTEXT_SENSITIVE_STAGE_NAMES as readonly string[]).includes(stageName);
  const blocked = contextSensitive && gate.blockedStageNames.includes(stageName as ContextSensitiveStageName);
  return {
    stageName,
    contextSensitive,
    blocked,
    stageMayRenderNormalPrompt: !blocked,
    stageMayCreateOrAcceptCompletionArtifact: !blocked,
    stageMayMarkComplete: !blocked,
    stageMayAdvance: !blocked,
    ...(blocked ? { blockingReason: blockingReasonFor(gate, stageName as ContextSensitiveStageName) } : {}),
  };
}

function stageForArtifactFile(
  stages: readonly StageDefinition[],
  artifactFile: string,
): StageDefinition | undefined {
  return stages.find(
    (s) => s.artifactFile === artifactFile || (s.additionalArtifactFiles ?? []).includes(artifactFile),
  );
}

// True when the given artifact file belongs to a stage the canonical gate
// currently blocks. Used by every artifact-file-shaped consumer (lifecycle
// resolution, mark) instead of re-deriving stage-name-to-artifact-file
// lookup logic per call site.
export function isContextBlockedArtifactFile(
  gate: RunIntegrityGateResult,
  stages: readonly StageDefinition[],
  artifactFile: string,
): boolean {
  const stage = stageForArtifactFile(stages, artifactFile);
  if (!stage) return false;
  return evaluateStageRunIntegrity(gate, stage.name).blocked;
}

// The corrective-action reason for a blocked artifact file, or undefined
// when the artifact is not context-blocked. Used by status/lifecycle
// surfaces to explain a "blocked" lifecycle state that originates from the
// canonical gate rather than a manual mark.
export function blockingReasonForArtifactFile(
  gate: RunIntegrityGateResult,
  stages: readonly StageDefinition[],
  artifactFile: string,
): string | undefined {
  const stage = stageForArtifactFile(stages, artifactFile);
  if (!stage) return undefined;
  return evaluateStageRunIntegrity(gate, stage.name).blockingReason;
}

// True when artifactFile is the "final-report" stage's artifact and
// finalReportEligible is false (v1.2.3 Batch 3). finalReportEligible is
// computed elsewhere (src/judgeIntegrity.ts, on top of this gate plus the
// authored judge report) and threaded in here so this remains the single
// override point -- final-report blocking is layered onto the same
// resolver that already forces implementation/test-implementation to
// "blocked", not a second parallel one.
export function isFinalReportIneligibleArtifactFile(
  stages: readonly StageDefinition[],
  artifactFile: string,
  finalReportEligible: boolean,
): boolean {
  if (finalReportEligible) return false;
  const stage = stageForArtifactFile(stages, artifactFile);
  return stage?.name === 'final-report';
}

// Combined "is this artifact file blocked from completion by canonical run
// integrity" check: context-blocked (implementation/test-implementation) OR
// final-report-ineligible. Every artifact-file-shaped consumer (lifecycle
// resolution, mark) should use this rather than isContextBlockedArtifactFile
// alone once final-report eligibility is in scope.
export function isRunIntegrityBlockedArtifactFile(
  gate: RunIntegrityGateResult,
  stages: readonly StageDefinition[],
  artifactFile: string,
  finalReportEligible = true,
): boolean {
  return (
    isContextBlockedArtifactFile(gate, stages, artifactFile) ||
    isFinalReportIneligibleArtifactFile(stages, artifactFile, finalReportEligible)
  );
}

// Gate-aware counterpart to artifactLifecycle.ts's resolveArtifactState():
// a context-blocked artifact never resolves to "complete" merely because
// the file exists or carries a manual "complete" record -- it is forced to
// "blocked" instead (invariants 6.2/6.4/6.5), and -- when finalReportEligible
// is explicitly supplied as false (Batch 3) -- neither does the
// final-report artifact. An existing manual "blocked" state is unaffected
// (it was already "blocked"). This is the single override point every
// lifecycle/stage-detection/status/mark consumer shares. finalReportEligible
// defaults to true so every Batch 2 call site that does not yet know about
// judge/final-report integrity keeps its exact prior behavior.
export function resolveArtifactStateWithRunIntegrity(
  runFolder: string,
  artifactFile: string,
  stages: readonly StageDefinition[],
  stateFile: ArtifactStateFile,
  gate: RunIntegrityGateResult,
  finalReportEligible = true,
): ArtifactLifecycleState {
  if (isRunIntegrityBlockedArtifactFile(gate, stages, artifactFile, finalReportEligible)) return 'blocked';
  return resolveArtifactState(runFolder, artifactFile, stages as StageDefinition[], stateFile);
}
