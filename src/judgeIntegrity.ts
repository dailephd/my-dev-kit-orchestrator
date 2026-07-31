// Canonical judge-verdict and final-report-eligibility evaluation (v1.2.3
// Batch 3).
//
// Composes on top of Batch 2's src/runIntegrityGate.ts -- it does not
// recompute readiness or re-derive expectedJudgeVerdict, and it is not a
// second run-integrity evaluator. It answers the one question the gate does
// not yet answer: does the authored JudgeReport agree with the gate's
// canonical expected verdict, and is a normal final report eligible as a
// result.
//
// Reuses the existing, unmodified judge/correction stack: parseJudgeReport
// (via readCorrectionState), routeJudgeVerdict's deterministic
// verdict-to-stage table, and CorrectionRouteResult's shape -- so
// promptGenerator.ts's existing generateCorrectionPrompt() can render the
// accepted route unchanged. The only new policy here is: a literal authored
// PASS is never trusted until it is compared against
// RunIntegrityGateResult.expectedJudgeVerdict, and NEED_CONTEXT's routed
// stage is the gate's canonical recommendation, not raw authored prose.

import * as fs from 'fs';
import * as path from 'path';
import { WorkflowMode } from './types';
import { StageDefinition } from './workflows';
import { ArtifactStateFile } from './artifactLifecycle';
import { RunIntegrityGateResult, resolveArtifactStateWithRunIntegrity } from './runIntegrityGate';
import { readCorrectionState } from './correctionState';
import { CorrectionRouteResult, CorrectableStage, isCorrectableStage } from './correctionRouter';
import { JudgeVerdict } from './judgeParser';

export const JUDGE_INTEGRITY_SCHEMA_VERSION = '1.0.0';

export type JudgeVerdictParseStatus = 'parsed' | 'missing-artifact' | 'missing-verdict' | 'unknown-verdict';

export const JUDGE_REPORT_MISSING = 'JUDGE_REPORT_MISSING';
export const JUDGE_VERDICT_MISSING = 'JUDGE_VERDICT_MISSING';
export const JUDGE_VERDICT_UNKNOWN = 'JUDGE_VERDICT_UNKNOWN';
export const JUDGE_VERDICT_CONTRADICTS_RUN_INTEGRITY = 'JUDGE_VERDICT_CONTRADICTS_RUN_INTEGRITY';

export interface JudgeIntegrityResult {
  schemaVersion: string;
  judgeArtifactPresent: boolean;
  judgeVerdictParseStatus: JudgeVerdictParseStatus;
  authoredJudgeVerdict: JudgeVerdict | null;
  expectedJudgeVerdict: RunIntegrityGateResult['expectedJudgeVerdict'];
  judgeVerdictMatchesExpected: boolean;
  // False only for a parse failure or the PASS/NEED_CONTEXT contradiction
  // (6.2). Every other syntactically valid verdict (including terminal
  // SCOPE_VIOLATION/BLOCKED and ordinary correction verdicts) is accepted
  // as itself -- rejection here is reserved for "this literal token cannot
  // be trusted," not "this token means more work is needed."
  judgeVerdictAccepted: boolean;
  correctionRequired: boolean;
  correctionBlocked: boolean;
  acceptedCorrectionStage: string | null;
  // Judge/context portion of final-report eligibility only: true iff the
  // verdict is accepted, authored PASS, and expected PASS. The composed
  // decision (which also requires prior-artifact validity) is
  // evaluateFinalReportEligibility()'s `eligible` field, not this one.
  finalReportEligible: boolean;
  blockingCodes: string[];
  primaryReason?: string;
  // The route promptGenerator.ts's existing generateCorrectionPrompt()
  // should render when correctionRequired is true. Built from accepted
  // state, never from unreconciled raw authored text.
  acceptedCorrectionRoute: CorrectionRouteResult | null;
}

function acceptedCorrectableStage(candidate: string | null): CorrectableStage | null {
  return candidate && isCorrectableStage(candidate) ? candidate : null;
}

export function evaluateJudgeIntegrity(input: {
  gate: RunIntegrityGateResult;
  runFolder: string;
  mode: WorkflowMode;
}): JudgeIntegrityResult {
  const { gate, runFolder, mode } = input;
  const expected = gate.expectedJudgeVerdict;
  const judgeReportPath = path.join(runFolder, 'artifacts', 'judge-report.txt');
  const judgeArtifactPresent = fs.existsSync(judgeReportPath);

  const base = {
    schemaVersion: JUDGE_INTEGRITY_SCHEMA_VERSION,
    expectedJudgeVerdict: expected,
  };

  if (!judgeArtifactPresent) {
    return {
      ...base,
      judgeArtifactPresent: false,
      judgeVerdictParseStatus: 'missing-artifact',
      authoredJudgeVerdict: null,
      judgeVerdictMatchesExpected: false,
      judgeVerdictAccepted: false,
      correctionRequired: false,
      correctionBlocked: false,
      acceptedCorrectionStage: null,
      finalReportEligible: false,
      blockingCodes: [JUDGE_REPORT_MISSING],
      primaryReason: 'Judge report artifact does not exist.',
      acceptedCorrectionRoute: null,
    };
  }

  // readCorrectionState only returns null when the file is missing, which
  // was already ruled out above.
  const raw = readCorrectionState(runFolder, { workflowMode: mode })!;

  if (raw.routeStatus === 'missing_verdict' || raw.routeStatus === 'unknown_verdict') {
    const parseStatus: JudgeVerdictParseStatus = raw.routeStatus === 'missing_verdict' ? 'missing-verdict' : 'unknown-verdict';
    return {
      ...base,
      judgeArtifactPresent: true,
      judgeVerdictParseStatus: parseStatus,
      authoredJudgeVerdict: null,
      judgeVerdictMatchesExpected: false,
      judgeVerdictAccepted: false,
      correctionRequired: false,
      correctionBlocked: false,
      acceptedCorrectionStage: null,
      finalReportEligible: false,
      blockingCodes: [parseStatus === 'missing-verdict' ? JUDGE_VERDICT_MISSING : JUDGE_VERDICT_UNKNOWN],
      primaryReason:
        parseStatus === 'missing-verdict'
          ? 'Judge report does not declare a "Verdict:" field.'
          : `Judge report declares an unrecognized verdict.${raw.errors[0] ? ` ${raw.errors[0]}` : ''}`,
      acceptedCorrectionRoute: null,
    };
  }

  const authored = raw.verdict as JudgeVerdict;

  // Contradiction (6.2): a literal authored PASS is never trusted while
  // canonical readiness still requires NEED_CONTEXT. Route back to the
  // canonical recommended context-repair stage instead of clearing
  // correction state.
  if (authored === 'PASS' && expected === 'NEED_CONTEXT') {
    const acceptedStage = acceptedCorrectableStage(gate.recommendedCorrectionStage);
    const acceptedRoute: CorrectionRouteResult | null = acceptedStage
      ? {
          verdict: 'PASS',
          recommendedStage: raw.recommendedStage,
          routedStage: acceptedStage,
          routeStatus: 'correction_required',
          warnings: [
            `Judge report authored "Verdict: PASS" but canonical repository-context readiness still requires NEED_CONTEXT. The authored PASS was rejected; routing to the canonical recommended stage "${acceptedStage}" instead.`,
            ...raw.warnings,
          ],
          errors: raw.errors,
          isBlocked: false,
          strictFail: false,
        }
      : null;
    return {
      ...base,
      judgeArtifactPresent: true,
      judgeVerdictParseStatus: 'parsed',
      authoredJudgeVerdict: 'PASS',
      judgeVerdictMatchesExpected: false,
      judgeVerdictAccepted: false,
      correctionRequired: acceptedStage !== null,
      correctionBlocked: false,
      acceptedCorrectionStage: acceptedStage,
      finalReportEligible: false,
      blockingCodes: [JUDGE_VERDICT_CONTRADICTS_RUN_INTEGRITY],
      primaryReason: 'Authored verdict "PASS" contradicts the canonical expected verdict "NEED_CONTEXT".',
      acceptedCorrectionRoute: acceptedRoute,
    };
  }

  if (authored === 'PASS') {
    // expected === 'PASS' here (the contradiction branch above already
    // covered expected === 'NEED_CONTEXT').
    return {
      ...base,
      judgeArtifactPresent: true,
      judgeVerdictParseStatus: 'parsed',
      authoredJudgeVerdict: 'PASS',
      judgeVerdictMatchesExpected: true,
      judgeVerdictAccepted: true,
      correctionRequired: false,
      correctionBlocked: false,
      acceptedCorrectionStage: null,
      finalReportEligible: true,
      blockingCodes: [],
      acceptedCorrectionRoute: null,
    };
  }

  // Terminal blocked verdicts: accepted as authored (they are not a claim
  // of readiness), never final-report-eligible, no stage to route to.
  if (raw.routeStatus === 'blocked') {
    return {
      ...base,
      judgeArtifactPresent: true,
      judgeVerdictParseStatus: 'parsed',
      authoredJudgeVerdict: authored,
      judgeVerdictMatchesExpected: false,
      judgeVerdictAccepted: true,
      correctionRequired: false,
      correctionBlocked: true,
      acceptedCorrectionStage: null,
      finalReportEligible: false,
      blockingCodes: [`JUDGE_VERDICT_${authored}`],
      primaryReason: `Judge verdict "${authored}" requires external resolution before this run can continue.`,
      acceptedCorrectionRoute: raw,
    };
  }

  if (authored === 'NEED_CONTEXT') {
    // Canonical recommendation wins over the routing table's generic
    // default and over any conflicting authored "Recommended next stage"
    // prose (section 7). Falls back to the existing table/authored routing
    // only when the gate has no recommendation of its own (e.g. context
    // became ready between judge authoring and this evaluation).
    const canonicalStage = acceptedCorrectableStage(gate.recommendedCorrectionStage);
    const acceptedStage = canonicalStage ?? raw.routedStage;
    const usedCanonicalOverride = canonicalStage !== null && canonicalStage !== raw.routedStage;
    const acceptedRoute: CorrectionRouteResult = {
      ...raw,
      routedStage: acceptedStage,
      warnings: usedCanonicalOverride
        ? [
            `Judge/authored routing suggested "${raw.routedStage}"; canonical repository-context readiness recommends "${canonicalStage}". Using the canonical recommendation.`,
            ...raw.warnings,
          ]
        : raw.warnings,
    };
    return {
      ...base,
      judgeArtifactPresent: true,
      judgeVerdictParseStatus: 'parsed',
      authoredJudgeVerdict: 'NEED_CONTEXT',
      judgeVerdictMatchesExpected: expected === 'NEED_CONTEXT',
      judgeVerdictAccepted: true,
      correctionRequired: acceptedStage !== null,
      correctionBlocked: false,
      acceptedCorrectionStage: acceptedStage,
      finalReportEligible: false,
      blockingCodes: [],
      acceptedCorrectionRoute: acceptedStage ? acceptedRoute : null,
    };
  }

  // Any other valid correction-required verdict (DESIGN_INCOMPLETE,
  // PSEUDOCODE_INCOMPLETE, IMPLEMENTATION_MISMATCH,
  // TEST_COVERAGE_INCOMPLETE, ARCHITECTURE_MISMATCH, NEED_VERIFICATION):
  // unrelated to repository-context readiness. Existing table/authored
  // routing preserved unchanged -- Batch 3 only constrains NEED_CONTEXT's
  // stage selection.
  return {
    ...base,
    judgeArtifactPresent: true,
    judgeVerdictParseStatus: 'parsed',
    authoredJudgeVerdict: authored,
    judgeVerdictMatchesExpected: false,
    judgeVerdictAccepted: true,
    correctionRequired: raw.routedStage !== null,
    correctionBlocked: false,
    acceptedCorrectionStage: raw.routedStage,
    finalReportEligible: false,
    blockingCodes: [],
    acceptedCorrectionRoute: raw,
  };
}

export interface FinalReportEligibilityResult {
  eligible: boolean;
  contextReady: boolean;
  priorArtifactsValid: boolean;
  judgeIntegrity: JudgeIntegrityResult;
  blockingCodes: string[];
  primaryReason?: string;
}

export const FINAL_REPORT_PRIOR_ARTIFACTS_INCOMPLETE = 'FINAL_REPORT_PRIOR_ARTIFACTS_INCOMPLETE';

// Composes judge integrity with the existing lifecycle rules for every
// native stage before "final-report" (reusing
// resolveArtifactStateWithRunIntegrity -- the same resolver Batch 2 already
// established -- rather than a second completeness check).
export function evaluateFinalReportEligibility(input: {
  gate: RunIntegrityGateResult;
  judgeIntegrity: JudgeIntegrityResult;
  runFolder: string;
  stages: readonly StageDefinition[];
  stateFile: ArtifactStateFile;
}): FinalReportEligibilityResult {
  const { gate, judgeIntegrity, runFolder, stages, stateFile } = input;
  const finalReportIndex = stages.findIndex((s) => s.name === 'final-report');
  const priorStages = finalReportIndex === -1 ? stages : stages.slice(0, finalReportIndex);
  const priorArtifactsValid = priorStages.every((stage) => {
    const files = [stage.artifactFile, ...(stage.additionalArtifactFiles ?? [])];
    return files.every(
      (f) => resolveArtifactStateWithRunIntegrity(runFolder, f, stages, stateFile, gate) === 'complete',
    );
  });

  const eligible = judgeIntegrity.finalReportEligible && priorArtifactsValid;

  const blockingCodes = [...judgeIntegrity.blockingCodes];
  if (!priorArtifactsValid && blockingCodes.length === 0) {
    blockingCodes.push(FINAL_REPORT_PRIOR_ARTIFACTS_INCOMPLETE);
  }

  return {
    eligible,
    contextReady: gate.contextReady,
    priorArtifactsValid,
    judgeIntegrity,
    blockingCodes,
    primaryReason:
      judgeIntegrity.primaryReason ?? (!priorArtifactsValid ? 'A required prior native artifact is not yet complete.' : undefined),
  };
}
