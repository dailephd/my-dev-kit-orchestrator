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
import {
  evaluateRunSemanticContinuity,
  RunSemanticContinuityResult,
  SEMANTIC_CONTINUITY_CONTRACT_VERSION_UNSUPPORTED,
} from './instructions/runSemanticContinuity';
import {
  SemanticContinuityLeg,
  SemanticContinuityResponsibilityResult,
  SemanticContinuityResult,
} from './instructions/semanticContinuity';
import { findTestStrategySourceRequirement } from './instructions/testResponsibilityCriticality';

// 1.1.0: additive Semantic Continuity fields (v1.5.0 Batch 4); no field is removed or redefined.
export const RUN_INTEGRITY_GATE_SCHEMA_VERSION = '1.1.0';

export const SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED = 'SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED';
export const SEMANTIC_CONTINUITY_NONCRITICAL_RESPONSIBILITY_UNSATISFIED = 'SEMANTIC_CONTINUITY_NONCRITICAL_RESPONSIBILITY_UNSATISFIED';
export const SEMANTIC_CONTINUITY_UNCLASSIFIED_RESPONSIBILITY = 'SEMANTIC_CONTINUITY_UNCLASSIFIED_RESPONSIBILITY';
export const SEMANTIC_CONTINUITY_GLOBAL_INTEGRITY_INVALID = 'SEMANTIC_CONTINUITY_GLOBAL_INTEGRITY_INVALID';
export { SEMANTIC_CONTINUITY_CONTRACT_VERSION_UNSUPPORTED };

export type RunIntegritySemanticClassification = 'not-required' | 'ready' | 'warning' | 'blocked';

export interface SemanticContinuityBlocker {
  primaryCode: string;
  primaryReason: string;
  responsibilityId?: string;
  responsibilityState?: string;
  leg?: SemanticContinuityLeg;
  sourceIssueCode?: string;
  recommendedCorrectionStage?: string | null;
}

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

  // Semantic Continuity (v1.5.0 Batch 4). The context fields above keep
  // meaning repository-context readiness only.
  semanticContinuityVersion?: string;
  semanticContinuityRequired: boolean;
  semanticContinuityReady: boolean;
  semanticContinuityClassification: RunIntegritySemanticClassification;
  // The exact Batch 3 result, when continuity is activated.
  semanticContinuity?: SemanticContinuityResult;
  semanticContinuityBlockingCodes: string[];
  semanticContinuityWarningCodes: string[];
  semanticContinuityBlockingResponsibilityIds: string[];
  semanticContinuityWarningResponsibilityIds: string[];
  // Every blocking semantic defect in deterministic order (primary first).
  semanticContinuityBlockers: SemanticContinuityBlocker[];
  // Workflow stage blocked by semantic continuity: the current phase stage.
  semanticBlockedStageNames: string[];
  primarySemanticBlocker?: SemanticContinuityBlocker;
  semanticRecommendedCorrectionStage: string | null;
  // contextReady AND semanticContinuityReady.
  runIntegrityReady: boolean;
  primaryBlockingCode?: string;
  primaryBlockingReason?: string;
}

export interface EvaluateRunIntegrityGateInput {
  mode: string;
  runFolder: string;
  workflowStageNames: readonly string[];
  currentStage?: string;
  projectRoot?: string;
  // v1.5.0 Batch 4: explicit, versioned activation from run metadata. Absent
  // means legacy behavior (semantic continuity not required).
  semanticContinuityVersion?: string;
  proofOnly?: boolean;
}

// Semantic Continuity policy projection (v1.5.0 Batch 4). Consumes the exact
// Batch 3 result and never recomputes continuity states. Criticality policy:
// a non-complete critical (or unclassified) responsibility blocks; a
// non-complete noncritical one only warns. Defects that cannot be attributed
// to a canonical responsibility are global and block.
interface SemanticGateProjection {
  version?: string;
  required: boolean;
  ready: boolean;
  classification: RunIntegritySemanticClassification;
  continuity?: SemanticContinuityResult;
  blockingCodes: string[];
  warningCodes: string[];
  blockingResponsibilityIds: string[];
  warningResponsibilityIds: string[];
  blockers: SemanticContinuityBlocker[];
  blockedStageNames: string[];
  primary?: SemanticContinuityBlocker;
  recommendedCorrectionStage: string | null;
  warnings: string[];
}

const GLOBAL_CONTINUITY_ISSUE_CODES: ReadonlySet<string> = new Set([
  'SEMANTIC_CONTINUITY_STAGE_UNKNOWN',
  'SEMANTIC_CONTINUITY_RESPONSIBILITIES_MISSING',
  'SEMANTIC_CONTINUITY_ORPHAN_DECLARATION',
]);

function ownerLegOfResponsibility(r: SemanticContinuityResponsibilityResult): SemanticContinuityLeg | undefined {
  if (r.strategyState === 'invalid') return 'strategy';
  const quiet = new Set<string>(['satisfied', 'pending', 'not-applicable']);
  if (!quiet.has(r.implementationState)) return 'implementation';
  if (!quiet.has(r.testImplementationState)) return 'test-implementation';
  if (!quiet.has(r.verificationState)) return 'verification';
  return undefined;
}

function correctionStageForLeg(
  leg: SemanticContinuityLeg | undefined,
  mode: string,
  workflowStageNames: readonly string[],
): string | null {
  let candidate: string | null = null;
  if (leg === 'strategy') {
    const requirement = findTestStrategySourceRequirement(mode);
    candidate = requirement ? requirement.strategyStageId.replace(`stage.${mode}.`, '') : null;
  } else if (leg === 'implementation' || leg === 'test-implementation' || leg === 'verification') {
    candidate = leg;
  }
  return candidate !== null && workflowStageNames.includes(candidate) ? candidate : null;
}

function notRequiredSemantic(): SemanticGateProjection {
  return {
    required: false,
    ready: true,
    classification: 'not-required',
    blockingCodes: [],
    warningCodes: [],
    blockingResponsibilityIds: [],
    warningResponsibilityIds: [],
    blockers: [],
    blockedStageNames: [],
    recommendedCorrectionStage: null,
    warnings: [],
  };
}

function projectSemanticContinuity(
  mode: string,
  workflowStageNames: readonly string[],
  currentStage: string | undefined,
  run: RunSemanticContinuityResult | undefined,
): SemanticGateProjection {
  if (!run || run.activation === 'not-required') return notRequiredSemantic();

  const lastStage = workflowStageNames.length > 0 ? workflowStageNames[workflowStageNames.length - 1] : undefined;
  const phaseStage =
    run.phaseStage ?? (currentStage === undefined || currentStage === '(complete)' ? lastStage : currentStage);
  const phaseStageNames = phaseStage !== undefined && workflowStageNames.includes(phaseStage) ? [phaseStage] : [];

  if (run.activation === 'unsupported') {
    const blocker: SemanticContinuityBlocker = {
      primaryCode: SEMANTIC_CONTINUITY_CONTRACT_VERSION_UNSUPPORTED,
      primaryReason: run.integrationIssues[0]?.message ?? 'Unsupported semanticContinuityVersion.',
      sourceIssueCode: SEMANTIC_CONTINUITY_CONTRACT_VERSION_UNSUPPORTED,
      recommendedCorrectionStage: null,
    };
    return {
      version: run.contractVersion,
      required: true,
      ready: false,
      classification: 'blocked',
      blockingCodes: [blocker.primaryCode],
      warningCodes: [],
      blockingResponsibilityIds: [],
      warningResponsibilityIds: [],
      blockers: [blocker],
      blockedStageNames: phaseStageNames,
      primary: blocker,
      recommendedCorrectionStage: null,
      warnings: [],
    };
  }

  const continuity = run.continuity;
  if (!continuity || continuity.state === 'not-applicable') {
    return { ...notRequiredSemantic(), version: run.contractVersion, ...(continuity ? { continuity } : {}) };
  }

  const canonicalIds = new Set(continuity.responsibilities.map((r) => r.responsibilityId));
  const stageIndex = (stage: string | null | undefined): number =>
    stage === null || stage === undefined ? -1 : workflowStageNames.indexOf(stage);
  const blockers: SemanticContinuityBlocker[] = [];
  const warningResponsibilityIds: string[] = [];
  const blockingResponsibilityIds: string[] = [];
  const warningCodes: string[] = [];
  const warnings: string[] = [];

  // Responsibility-level policy, in canonical declaration order.
  for (const r of continuity.responsibilities) {
    if (r.state === 'complete') continue;
    const leg = ownerLegOfResponsibility(r);
    const attributed = continuity.issues.find((i) => i.responsibilityId === r.responsibilityId);
    const sourceIssueCode = attributed ? (attributed.sourceIssueCode ?? attributed.code) : undefined;
    const describe = `Responsibility "${r.responsibilityId}" (${r.criticality ?? 'unclassified'}) is ${r.state}${leg ? ` at the ${leg} leg` : ''}.`;
    if (r.criticality === 'noncritical') {
      warningResponsibilityIds.push(r.responsibilityId);
      if (!warningCodes.includes(SEMANTIC_CONTINUITY_NONCRITICAL_RESPONSIBILITY_UNSATISFIED)) {
        warningCodes.push(SEMANTIC_CONTINUITY_NONCRITICAL_RESPONSIBILITY_UNSATISFIED);
      }
      warnings.push(describe);
      continue;
    }
    blockingResponsibilityIds.push(r.responsibilityId);
    blockers.push({
      primaryCode:
        r.criticality === 'critical'
          ? SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED
          : SEMANTIC_CONTINUITY_UNCLASSIFIED_RESPONSIBILITY,
      primaryReason: describe,
      responsibilityId: r.responsibilityId,
      responsibilityState: r.state,
      ...(leg ? { leg } : {}),
      ...(sourceIssueCode ? { sourceIssueCode } : {}),
      recommendedCorrectionStage: correctionStageForLeg(leg, mode, workflowStageNames),
    });
  }

  // Global defects: not attributable to a canonical responsibility.
  for (const issue of continuity.issues) {
    const isGlobal =
      GLOBAL_CONTINUITY_ISSUE_CODES.has(issue.code) ||
      issue.responsibilityId === undefined ||
      !canonicalIds.has(issue.responsibilityId);
    if (!isGlobal) continue;
    blockers.push({
      primaryCode: SEMANTIC_CONTINUITY_GLOBAL_INTEGRITY_INVALID,
      primaryReason: issue.message,
      ...(issue.responsibilityId !== undefined ? { responsibilityId: issue.responsibilityId } : {}),
      ...(issue.leg ? { leg: issue.leg } : {}),
      sourceIssueCode: issue.sourceIssueCode ?? issue.code,
      recommendedCorrectionStage: issue.leg === 'run' ? null : correctionStageForLeg(issue.leg, mode, workflowStageNames),
    });
  }

  for (const d of continuity.diagnostics) {
    if (!warningCodes.includes(d.sourceIssueCode)) warningCodes.push(d.sourceIssueCode);
    warnings.push(d.message);
  }

  // Deterministic order: earliest correction-owner stage first (a blocker
  // with no correction stage sorts first so it is never masked), then
  // canonical responsibility order / stable issue order (stable position).
  const ordered = blockers
    .map((blocker, position) => ({ blocker, position }))
    .sort((x, y) => {
      const xi = stageIndex(x.blocker.recommendedCorrectionStage);
      const yi = stageIndex(y.blocker.recommendedCorrectionStage);
      return xi !== yi ? xi - yi : x.position - y.position;
    })
    .map((entry) => entry.blocker);

  const classification: RunIntegritySemanticClassification =
    ordered.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'ready';
  const primary = ordered[0];

  return {
    version: run.contractVersion,
    required: true,
    ready: classification !== 'blocked',
    classification,
    continuity,
    blockingCodes: [...new Set(ordered.map((b) => b.primaryCode))],
    warningCodes,
    blockingResponsibilityIds,
    warningResponsibilityIds,
    blockers: ordered,
    blockedStageNames: classification === 'blocked' ? phaseStageNames : [],
    ...(primary ? { primary } : {}),
    recommendedCorrectionStage: primary ? (primary.recommendedCorrectionStage ?? null) : null,
    warnings,
  };
}

// Derives the canonical gate result from an already-computed
// RunContextReadinessSummary. Exposed separately from
// evaluateRunIntegrityGate() so callers that already hold a summary (e.g.
// check.ts, which also renders it) never recompute readiness a second time.
export function deriveRunIntegrityGateResult(
  mode: string,
  summary: RunContextReadinessSummary,
  semanticRun?: { run: RunSemanticContinuityResult; workflowStageNames: readonly string[]; currentStage?: string },
): RunIntegrityGateResult {
  const applicableContextKinds: Array<'implementation' | 'test'> = [];
  if (summary.implementationContext) applicableContextKinds.push('implementation');
  if (summary.testContext) applicableContextKinds.push('test');

  const blockedStageNames: ContextSensitiveStageName[] = [];
  if (summary.implementationContext?.decision === 'refresh-required') blockedStageNames.push('implementation');
  if (summary.testContext?.decision === 'refresh-required') blockedStageNames.push('test-implementation');

  const contextRequired = summary.overallDecision !== 'not-required';
  const contextReady = summary.overallDecision !== 'refresh-required';
  const semantic = projectSemanticContinuity(
    mode,
    semanticRun?.workflowStageNames ?? [],
    semanticRun?.currentStage,
    semanticRun?.run,
  );
  const runIntegrityReady = contextReady && semantic.ready;
  // A context blocker keeps primary precedence over any semantic blocker.
  const primaryBlockingCode = !contextReady ? summary.primaryBlocker?.primaryCode : semantic.primary?.primaryCode;
  const primaryBlockingReason = !contextReady ? summary.primaryBlocker?.primaryReason : semantic.primary?.primaryReason;

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
    // Resolution order: context recommendation, then semantic, then none.
    recommendedCorrectionStage: summary.recommendedNextStage ?? semantic.recommendedCorrectionStage,
    expectedJudgeVerdict: runIntegrityReady ? 'PASS' : 'NEED_CONTEXT',
    warnings: [...summary.warnings, ...semantic.warnings],
    ...(semantic.version !== undefined ? { semanticContinuityVersion: semantic.version } : {}),
    semanticContinuityRequired: semantic.required,
    semanticContinuityReady: semantic.ready,
    semanticContinuityClassification: semantic.classification,
    ...(semantic.continuity ? { semanticContinuity: semantic.continuity } : {}),
    semanticContinuityBlockingCodes: semantic.blockingCodes,
    semanticContinuityWarningCodes: semantic.warningCodes,
    semanticContinuityBlockingResponsibilityIds: semantic.blockingResponsibilityIds,
    semanticContinuityWarningResponsibilityIds: semantic.warningResponsibilityIds,
    semanticContinuityBlockers: semantic.blockers,
    semanticBlockedStageNames: semantic.blockedStageNames,
    ...(semantic.primary ? { primarySemanticBlocker: semantic.primary } : {}),
    semanticRecommendedCorrectionStage: semantic.recommendedCorrectionStage,
    runIntegrityReady,
    ...(primaryBlockingCode !== undefined ? { primaryBlockingCode } : {}),
    ...(primaryBlockingReason !== undefined ? { primaryBlockingReason } : {}),
  };
}

// Canonical single entry point: evaluates repository-context readiness once
// and derives the gate result from it. Every command surface that does not
// already hold a RunContextReadinessSummary should call this instead of
// calling evaluateRunContextReadiness() directly, so a single call site
// owns "how readiness becomes an enforcement decision."
export function evaluateRunIntegrityGate(input: EvaluateRunIntegrityGateInput): RunIntegrityGateResult {
  const summary = evaluateRunContextReadiness(input);
  return evaluateRunIntegrityGateFromSummary(input, summary);
}

// Same as evaluateRunIntegrityGate() for callers that already hold the
// readiness summary (status.ts): semantic continuity is layered on that one
// readiness evaluation, which is never recomputed.
export function evaluateRunIntegrityGateFromSummary(
  input: EvaluateRunIntegrityGateInput,
  summary: RunContextReadinessSummary,
): RunIntegrityGateResult {
  const run = evaluateRunSemanticContinuity({
    mode: input.mode,
    runFolder: input.runFolder,
    semanticContinuityVersion: input.semanticContinuityVersion,
    proofOnly: input.proofOnly,
    currentStage: input.currentStage,
    implementationContextReadiness: summary.implementationContext,
    testContextReadiness: summary.testContext,
  });
  return deriveRunIntegrityGateResult(input.mode, summary, {
    run,
    workflowStageNames: input.workflowStageNames,
    currentStage: input.currentStage,
  });
}

export interface StageRunIntegrityDecision {
  stageName: string;
  contextSensitive: boolean;
  contextBlocked: boolean;
  semanticBlocked: boolean;
  // contextBlocked || semanticBlocked
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
  const contextBlocked = contextSensitive && gate.blockedStageNames.includes(stageName as ContextSensitiveStageName);
  const semanticBlocked = gate.semanticBlockedStageNames.includes(stageName);
  const blocked = contextBlocked || semanticBlocked;
  return {
    stageName,
    contextSensitive,
    contextBlocked,
    semanticBlocked,
    blocked,
    stageMayRenderNormalPrompt: !blocked,
    stageMayCreateOrAcceptCompletionArtifact: !blocked,
    stageMayMarkComplete: !blocked,
    stageMayAdvance: !blocked,
    ...(contextBlocked
      ? { blockingReason: blockingReasonFor(gate, stageName as ContextSensitiveStageName) }
      : semanticBlocked
        ? { blockingReason: gate.primarySemanticBlocker?.primaryReason }
        : {}),
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
  return evaluateStageRunIntegrity(gate, stage.name).contextBlocked;
}

// True when the artifact file belongs to the stage blocked by semantic
// continuity (v1.5.0 Batch 4).
export function isSemanticBlockedArtifactFile(
  gate: RunIntegrityGateResult,
  stages: readonly StageDefinition[],
  artifactFile: string,
): boolean {
  const stage = stageForArtifactFile(stages, artifactFile);
  if (!stage) return false;
  return evaluateStageRunIntegrity(gate, stage.name).semanticBlocked;
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
    isSemanticBlockedArtifactFile(gate, stages, artifactFile) ||
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
