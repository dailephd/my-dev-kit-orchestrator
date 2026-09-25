// v1.5.0 Batch 3 -- the ONE canonical Semantic Continuity evaluator.
//
//   canonical strategy responsibility (RSP)      [Batch 0]
//     -> upstream semantic trace existence       [this module]
//     -> implementation evidence                 [Batch 1 bridge]
//     -> test implementation evidence            [Batch 2 bridge]
//     -> verification attribution                [Batch 2]
//
// This module composes already-parsed and already-evaluated Batch 0-2
// results. It does not parse artifact prose, read files, touch Git, use a
// clock, run commands, or call my-dev-kit/Observer/Lab. The result is a
// derived in-memory model: nothing is persisted, and nothing here is read by
// RunIntegrityGate, JudgeIntegrity, lifecycle/stage detection, prompts, mark,
// status, check, export, correction routing, or final-report eligibility.
//
// Phase awareness. A leg is ACTIVE only when the current stage is strictly
// AFTER the stage that owns its output (currentStageIndex > ownerStageIndex),
// so a stage's own output is never required while the workflow is entering
// that stage. Inactive legs are `pending` (or `not-applicable`) and their
// structural issues, orphans, and stale content are ignored. This keeps
// correction routing safe: a run sent back to `implementation` is not blocked
// by malformed downstream test/verification mappings that merely exist on disk.
// Strategy ownership comes from TEST_STRATEGY_SOURCE_REQUIREMENTS; the other
// owner stages come from the workflow definition itself.
//
// Continuity is PHASE-RELATIVE: `complete` means complete through the legs
// currently active. Criticality is carried and summarized but never changes a
// semantic state; enforcement policy belongs to later batches.

import { getWorkflow } from '../workflows';
import { isValidMode } from '../types';
import {
  ImplementationEvidenceBridgeResult,
  ImplementationResponsibilityValidationResult,
} from './implementationResponsibilityEvidence';
import { EvidenceCorroborationState } from './responsibilityEvidenceShared';
import { SemanticResponsibility, SemanticResponsibilityValidationResult } from './semanticResponsibility';
import {
  TestImplementationBridgeResult,
  TestImplementationValidationResult,
} from './testImplementationResponsibilityEvidence';
import { findTestStrategySourceRequirement, TestResponsibilityCriticality } from './testResponsibilityCriticality';
import {
  VerificationAttributionResult,
  VerificationEvaluationState,
  VerificationValidationResult,
} from './verificationResponsibilityEvidence';

// ─── Vocabularies ───────────────────────────────────────────────────────────

export type SemanticContinuityLegState =
  | 'pending'
  | 'not-applicable'
  | 'satisfied'
  | 'partial'
  | 'unsatisfied'
  | 'missing'
  | 'indeterminate'
  | 'failed'
  | 'skipped'
  | 'blocked'
  | 'invalid';

export type SemanticContinuityResponsibilityState =
  | 'complete'
  | 'incomplete'
  | 'indeterminate'
  | 'failed'
  | 'blocked'
  | 'invalid';

export type SemanticContinuityOverallState =
  | 'not-applicable'
  | 'pending'
  | 'complete'
  | 'incomplete'
  | 'indeterminate'
  | 'failed'
  | 'blocked'
  | 'invalid';

export type SemanticContinuityApplicability = 'applicable' | 'not-applicable';

export type SemanticContinuityLeg = 'strategy' | 'implementation' | 'test-implementation' | 'verification' | 'run';

export type SemanticContinuityIssueCode =
  | 'SEMANTIC_CONTINUITY_STAGE_UNKNOWN'
  | 'SEMANTIC_CONTINUITY_RESPONSIBILITIES_MISSING'
  | 'SEMANTIC_CONTINUITY_UPSTREAM_TRACE_MISSING'
  | 'SEMANTIC_CONTINUITY_STRATEGY_INVALID'
  | 'SEMANTIC_CONTINUITY_IMPLEMENTATION_INVALID'
  | 'SEMANTIC_CONTINUITY_TEST_IMPLEMENTATION_INVALID'
  | 'SEMANTIC_CONTINUITY_VERIFICATION_INVALID'
  | 'SEMANTIC_CONTINUITY_ORPHAN_DECLARATION';

export interface SemanticContinuityIssue {
  code: SemanticContinuityIssueCode;
  message: string;
  responsibilityId?: string;
  leg?: SemanticContinuityLeg;
  // Exact underlying Batch 0-2 code when the issue is propagated from one.
  sourceIssueCode?: string;
  traceId?: string;
}

// Non-blocking diagnostics preserved from Batch 0-2 (never change any state).
export interface SemanticContinuityDiagnostic {
  leg: SemanticContinuityLeg;
  sourceIssueCode: string;
  message: string;
  responsibilityId?: string;
}

export interface SemanticContinuityResponsibilityResult {
  responsibilityId: string;
  criticality: TestResponsibilityCriticality | undefined;
  upstreamTraceIds: string[];
  missingUpstreamTraceIds: string[];
  strategyState: 'satisfied' | 'invalid';
  implementationState: SemanticContinuityLegState;
  testImplementationState: SemanticContinuityLegState;
  verificationState: SemanticContinuityLegState;
  state: SemanticContinuityResponsibilityState;
  issueCodes: SemanticContinuityIssueCode[];
}

export interface SemanticContinuitySummary {
  totalResponsibilities: number;
  criticalResponsibilities: number;
  noncriticalResponsibilities: number;
  completeResponsibilities: number;
  incompleteResponsibilities: number;
  indeterminateResponsibilities: number;
  failedResponsibilities: number;
  blockedResponsibilities: number;
  invalidResponsibilities: number;
  criticalCompleteResponsibilityIds: string[];
  // unsatisfied = any state other than complete
  criticalUnsatisfiedResponsibilityIds: string[];
  noncriticalCompleteResponsibilityIds: string[];
  noncriticalUnsatisfiedResponsibilityIds: string[];
  // Responsibilities whose criticality could not be established (Batch 0
  // structural defect); excluded from the critical/noncritical lists above.
  unclassifiedResponsibilityIds: string[];
}

export interface SemanticContinuityResult {
  mode: string;
  currentStage: string;
  applicability: SemanticContinuityApplicability;
  applicabilityReason?: string;
  state: SemanticContinuityOverallState;
  strategyActive: boolean;
  implementationApplicable: boolean;
  implementationActive: boolean;
  testImplementationActive: boolean;
  verificationActive: boolean;
  responsibilities: SemanticContinuityResponsibilityResult[];
  issues: SemanticContinuityIssue[];
  diagnostics: SemanticContinuityDiagnostic[];
  summary: SemanticContinuitySummary;
}

export interface SemanticContinuityInput {
  mode: string;
  currentStage: string;
  proofOnly?: boolean;
  // Exact, case-sensitive set of declared upstream trace IDs. Built by the
  // caller (e.g. through parseDeclaredTraceIds); never derived here.
  declaredUpstreamTraceIds: readonly string[];
  semanticValidation: SemanticResponsibilityValidationResult;
  implementationValidation: ImplementationResponsibilityValidationResult;
  implementationBridge: ImplementationEvidenceBridgeResult;
  testImplementationValidation: TestImplementationValidationResult;
  testImplementationBridge: TestImplementationBridgeResult;
  verificationValidation: VerificationValidationResult;
  verificationAttribution: VerificationAttributionResult;
}

// ─── Leg normalization ──────────────────────────────────────────────────────

export function normalizeCorroborationState(state: EvidenceCorroborationState): SemanticContinuityLegState {
  switch (state) {
    case 'corroborated':
      return 'satisfied';
    case 'partially-corroborated':
      return 'partial';
    case 'uncorroborated':
      return 'unsatisfied';
    case 'missing-declaration':
      return 'missing';
    case 'producer-mapping-unavailable':
      return 'indeterminate';
  }
}

export function normalizeVerificationState(state: VerificationEvaluationState): SemanticContinuityLegState {
  switch (state) {
    case 'passed':
      return 'satisfied';
    case 'failed':
      return 'failed';
    case 'skipped':
      return 'skipped';
    case 'blocked':
      return 'blocked';
    case 'missing-declaration':
      return 'missing';
  }
}

const VERIFICATION_DIAGNOSTIC_CODE = 'VERIFICATION_RESPONSIBILITY_STATUS_EVIDENCE_INCONSISTENT';
const ORPHAN_CODES: ReadonlySet<string> = new Set([
  'IMPLEMENTATION_RESPONSIBILITY_ORPHAN',
  'TEST_IMPLEMENTATION_RESPONSIBILITY_ORPHAN',
  'VERIFICATION_RESPONSIBILITY_ORPHAN',
]);

// ─── Phase model ────────────────────────────────────────────────────────────

interface PhaseModel {
  strategyActive: boolean;
  implementationApplicable: boolean;
  implementationActive: boolean;
  testImplementationActive: boolean;
  verificationActive: boolean;
}

function stageIndex(stageNames: readonly string[], name: string): number {
  return stageNames.indexOf(name);
}

function isActive(currentIndex: number, ownerIndex: number): boolean {
  return ownerIndex >= 0 && currentIndex > ownerIndex;
}

// ─── Evaluator ──────────────────────────────────────────────────────────────

function emptySummary(): SemanticContinuitySummary {
  return {
    totalResponsibilities: 0,
    criticalResponsibilities: 0,
    noncriticalResponsibilities: 0,
    completeResponsibilities: 0,
    incompleteResponsibilities: 0,
    indeterminateResponsibilities: 0,
    failedResponsibilities: 0,
    blockedResponsibilities: 0,
    invalidResponsibilities: 0,
    criticalCompleteResponsibilityIds: [],
    criticalUnsatisfiedResponsibilityIds: [],
    noncriticalCompleteResponsibilityIds: [],
    noncriticalUnsatisfiedResponsibilityIds: [],
    unclassifiedResponsibilityIds: [],
  };
}

function baseResult(
  input: SemanticContinuityInput,
  overrides: Partial<SemanticContinuityResult>,
): SemanticContinuityResult {
  return {
    mode: input.mode,
    currentStage: input.currentStage,
    applicability: 'applicable',
    state: 'pending',
    strategyActive: false,
    implementationApplicable: false,
    implementationActive: false,
    testImplementationActive: false,
    verificationActive: false,
    responsibilities: [],
    issues: [],
    diagnostics: [],
    summary: emptySummary(),
    ...overrides,
  };
}

export function evaluateSemanticContinuity(input: SemanticContinuityInput): SemanticContinuityResult {
  // Applicability: only normal staged native workflows with a strategy owner.
  if (input.proofOnly === true) {
    return baseResult(input, {
      applicability: 'not-applicable',
      applicabilityReason: 'proof-only runs are outside the semantic responsibility chain',
      state: 'not-applicable',
    });
  }
  const strategyRequirement = findTestStrategySourceRequirement(input.mode);
  if (!strategyRequirement || !isValidMode(input.mode)) {
    return baseResult(input, {
      applicability: 'not-applicable',
      applicabilityReason:
        input.mode === 'greenfield'
          ? 'greenfield is outside the semantic responsibility chain'
          : `mode "${input.mode}" has no semantic responsibility contract`,
      state: 'not-applicable',
    });
  }

  const stageNames = getWorkflow(input.mode).stages.map((s) => s.name);
  const currentIndex = stageIndex(stageNames, input.currentStage);
  const strategyStageName = strategyRequirement.strategyStageId.replace(`stage.${input.mode}.`, '');
  const strategyIndex = stageIndex(stageNames, strategyStageName);

  if (currentIndex < 0 || strategyIndex < 0) {
    const unknown = currentIndex < 0 ? `current stage "${input.currentStage}"` : `strategy stage "${strategyStageName}"`;
    return baseResult(input, {
      state: 'invalid',
      issues: [
        {
          code: 'SEMANTIC_CONTINUITY_STAGE_UNKNOWN',
          message: `The ${unknown} does not exist in the "${input.mode}" workflow.`,
          leg: 'run',
        },
      ],
    });
  }

  const implementationIndex = stageIndex(stageNames, 'implementation');
  const phase: PhaseModel = {
    strategyActive: isActive(currentIndex, strategyIndex),
    implementationApplicable: implementationIndex >= 0,
    implementationActive: isActive(currentIndex, implementationIndex),
    testImplementationActive: isActive(currentIndex, stageIndex(stageNames, 'test-implementation')),
    verificationActive: isActive(currentIndex, stageIndex(stageNames, 'verification')),
  };

  if (!phase.strategyActive) {
    return baseResult(input, { ...phase, state: 'pending' });
  }

  const issues: SemanticContinuityIssue[] = [];
  const diagnostics: SemanticContinuityDiagnostic[] = [];
  const strategy = input.semanticValidation.responsibilities;
  const strategyIds = new Set(strategy.map((r) => r.responsibilityId));
  const declaredTraces = new Set(input.declaredUpstreamTraceIds);
  let globalInvalid = false;

  const perResponsibilityIssueCodes: SemanticContinuityIssueCode[][] = strategy.map(() => []);
  const strategyLegInvalid: boolean[] = strategy.map(() => false);
  const implLegInvalid: boolean[] = strategy.map(() => false);
  const testLegInvalid: boolean[] = strategy.map(() => false);
  const verificationLegInvalid: boolean[] = strategy.map(() => false);
  const missingTraces: string[][] = strategy.map(() => []);

  function record(index: number, code: SemanticContinuityIssueCode): void {
    if (!perResponsibilityIssueCodes[index].includes(code)) perResponsibilityIssueCodes[index].push(code);
  }

  if (strategy.length === 0) {
    issues.push({
      code: 'SEMANTIC_CONTINUITY_RESPONSIBILITIES_MISSING',
      message: 'The strategy artifact declares no canonical semantic responsibilities.',
      leg: 'strategy',
    });
  }

  // Strategy structural issues (Batch 0). Attributable when they name a
  // canonical responsibility (matched by ID and block index); otherwise global.
  for (const issue of input.semanticValidation.issues) {
    const index = strategy.findIndex(
      (r) =>
        issue.responsibilityId !== undefined &&
        r.responsibilityId === issue.responsibilityId &&
        (issue.blockIndex === undefined || r.blockIndex === issue.blockIndex),
    );
    issues.push({
      code: 'SEMANTIC_CONTINUITY_STRATEGY_INVALID',
      message: issue.message,
      leg: 'strategy',
      sourceIssueCode: issue.code,
      ...(issue.responsibilityId !== undefined ? { responsibilityId: issue.responsibilityId } : {}),
    });
    if (index >= 0) {
      strategyLegInvalid[index] = true;
      record(index, 'SEMANTIC_CONTINUITY_STRATEGY_INVALID');
    } else {
      globalInvalid = true;
    }
  }

  // Upstream trace existence (exact, case-sensitive).
  strategy.forEach((r, index) => {
    for (const traceId of r.upstreamTraceIds) {
      if (!declaredTraces.has(traceId)) {
        missingTraces[index].push(traceId);
        strategyLegInvalid[index] = true;
        record(index, 'SEMANTIC_CONTINUITY_UPSTREAM_TRACE_MISSING');
        issues.push({
          code: 'SEMANTIC_CONTINUITY_UPSTREAM_TRACE_MISSING',
          message: `Responsibility "${r.responsibilityId}" traces to "${traceId}", which is not a declared upstream trace.`,
          leg: 'strategy',
          responsibilityId: r.responsibilityId,
          traceId,
        });
      }
    }
  });

  // Downstream legs: structural issues and orphans, only when active.
  function propagate(
    leg: SemanticContinuityLeg,
    invalidCode: SemanticContinuityIssueCode,
    legIssues: ReadonlyArray<{ code: string; message: string; responsibilityId?: string }>,
    legInvalid: boolean[],
  ): void {
    for (const issue of legIssues) {
      if (issue.code === VERIFICATION_DIAGNOSTIC_CODE) {
        diagnostics.push({
          leg,
          sourceIssueCode: issue.code,
          message: issue.message,
          ...(issue.responsibilityId !== undefined ? { responsibilityId: issue.responsibilityId } : {}),
        });
        continue;
      }
      issues.push({
        code: invalidCode,
        message: issue.message,
        leg,
        sourceIssueCode: issue.code,
        ...(issue.responsibilityId !== undefined ? { responsibilityId: issue.responsibilityId } : {}),
      });
      const index = issue.responsibilityId !== undefined ? strategy.findIndex((r) => r.responsibilityId === issue.responsibilityId) : -1;
      if (index >= 0 && strategyIds.has(issue.responsibilityId as string)) {
        legInvalid[index] = true;
        record(index, invalidCode);
      } else {
        globalInvalid = true;
      }
    }
  }

  function propagateOrphans(
    leg: SemanticContinuityLeg,
    bridgeIssues: ReadonlyArray<{ code: string; message: string; responsibilityId?: string }>,
  ): void {
    for (const issue of bridgeIssues) {
      if (!ORPHAN_CODES.has(issue.code)) continue;
      globalInvalid = true;
      issues.push({
        code: 'SEMANTIC_CONTINUITY_ORPHAN_DECLARATION',
        message: issue.message,
        leg,
        sourceIssueCode: issue.code,
        ...(issue.responsibilityId !== undefined ? { responsibilityId: issue.responsibilityId } : {}),
      });
    }
  }

  if (phase.implementationApplicable && phase.implementationActive) {
    propagate('implementation', 'SEMANTIC_CONTINUITY_IMPLEMENTATION_INVALID', input.implementationValidation.issues, implLegInvalid);
    propagateOrphans('implementation', input.implementationBridge.issues);
  }
  if (phase.testImplementationActive) {
    propagate('test-implementation', 'SEMANTIC_CONTINUITY_TEST_IMPLEMENTATION_INVALID', input.testImplementationValidation.issues, testLegInvalid);
    propagateOrphans('test-implementation', input.testImplementationBridge.issues);
  }
  if (phase.verificationActive) {
    propagate('verification', 'SEMANTIC_CONTINUITY_VERIFICATION_INVALID', input.verificationValidation.issues, verificationLegInvalid);
    propagateOrphans('verification', input.verificationAttribution.issues);
  }

  // Bridge entries by responsibility ID (first occurrence).
  const implById = new Map(input.implementationBridge.responsibilities.map((e) => [e.responsibilityId, e] as const).reverse());
  const testById = new Map(input.testImplementationBridge.responsibilities.map((e) => [e.responsibilityId, e] as const).reverse());
  const verById = new Map(input.verificationAttribution.responsibilities.map((e) => [e.responsibilityId, e] as const).reverse());

  function legState(
    active: boolean,
    applicable: boolean,
    invalid: boolean,
    normalized: () => SemanticContinuityLegState,
  ): SemanticContinuityLegState {
    if (!applicable) return 'not-applicable';
    if (!active) return 'pending';
    return invalid ? 'invalid' : normalized();
  }

  const responsibilities: SemanticContinuityResponsibilityResult[] = strategy.map((r: SemanticResponsibility, index) => {
    const id = r.responsibilityId;
    const implementationState = legState(phase.implementationActive, phase.implementationApplicable, implLegInvalid[index], () => {
      const e = implById.get(id);
      return e ? normalizeCorroborationState(e.state) : 'missing';
    });
    const testImplementationState = legState(phase.testImplementationActive, true, testLegInvalid[index], () => {
      const e = testById.get(id);
      return e ? normalizeCorroborationState(e.state) : 'missing';
    });
    const verificationState = legState(phase.verificationActive, true, verificationLegInvalid[index], () => {
      const e = verById.get(id);
      return e ? normalizeVerificationState(e.state) : 'missing';
    });
    const strategyState: 'satisfied' | 'invalid' = strategyLegInvalid[index] ? 'invalid' : 'satisfied';

    const legs: SemanticContinuityLegState[] = [implementationState, testImplementationState, verificationState];
    let state: SemanticContinuityResponsibilityState;
    if (strategyState === 'invalid' || legs.includes('invalid')) state = 'invalid';
    else if (verificationState === 'failed') state = 'failed';
    else if (verificationState === 'blocked') state = 'blocked';
    else if (legs.some((s) => s === 'partial' || s === 'unsatisfied' || s === 'missing' || s === 'skipped')) state = 'incomplete';
    else if (legs.includes('indeterminate')) state = 'indeterminate';
    else state = 'complete';

    return {
      responsibilityId: id,
      criticality: r.criticality,
      upstreamTraceIds: [...r.upstreamTraceIds],
      missingUpstreamTraceIds: missingTraces[index],
      strategyState,
      implementationState,
      testImplementationState,
      verificationState,
      state,
      issueCodes: perResponsibilityIssueCodes[index],
    };
  });

  const summary = emptySummary();
  summary.totalResponsibilities = responsibilities.length;
  for (const r of responsibilities) {
    switch (r.state) {
      case 'complete':
        summary.completeResponsibilities++;
        break;
      case 'incomplete':
        summary.incompleteResponsibilities++;
        break;
      case 'indeterminate':
        summary.indeterminateResponsibilities++;
        break;
      case 'failed':
        summary.failedResponsibilities++;
        break;
      case 'blocked':
        summary.blockedResponsibilities++;
        break;
      case 'invalid':
        summary.invalidResponsibilities++;
        break;
    }
    const complete = r.state === 'complete';
    if (r.criticality === 'critical') {
      summary.criticalResponsibilities++;
      (complete ? summary.criticalCompleteResponsibilityIds : summary.criticalUnsatisfiedResponsibilityIds).push(r.responsibilityId);
    } else if (r.criticality === 'noncritical') {
      summary.noncriticalResponsibilities++;
      (complete ? summary.noncriticalCompleteResponsibilityIds : summary.noncriticalUnsatisfiedResponsibilityIds).push(
        r.responsibilityId,
      );
    } else {
      summary.unclassifiedResponsibilityIds.push(r.responsibilityId);
    }
  }

  let state: SemanticContinuityOverallState;
  if (globalInvalid || summary.invalidResponsibilities > 0) state = 'invalid';
  else if (summary.failedResponsibilities > 0) state = 'failed';
  else if (summary.blockedResponsibilities > 0) state = 'blocked';
  else if (responsibilities.length === 0 || summary.incompleteResponsibilities > 0) state = 'incomplete';
  else if (summary.indeterminateResponsibilities > 0) state = 'indeterminate';
  else state = 'complete';

  return baseResult(input, { ...phase, state, responsibilities, issues, diagnostics, summary });
}
