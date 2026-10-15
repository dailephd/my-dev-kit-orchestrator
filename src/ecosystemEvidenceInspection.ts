import type { RunMetadata } from './run';
import type { RunIntegrityGateResult } from './runIntegrityGate';
import type { JudgeIntegrityResult, FinalReportEligibilityResult } from './judgeIntegrity';
import type { RunEcosystemEvidenceReadiness } from './ecosystemEvidenceReadiness';

export interface RunEvidenceInspectionV1 {
  schemaVersion: '1.0.0';
  run: { runId: string; mode: string; currentStage: string; status: string };
  ecosystem: {
    required: boolean;
    classification: RunEcosystemEvidenceReadiness['classification'];
    requirements: RunEcosystemEvidenceReadiness['requirements'];
    blockers: string[];
    warnings: string[];
  };
  integrity: { ready: boolean; expectedJudgeVerdict: 'PASS' | 'NEED_CONTEXT'; blockingCodes: string[] };
  judge: { accepted: boolean; finalReportEligible: boolean };
  checks?: {
    selection: 'default' | 'single-artifact' | 'artifacts' | 'all' | 'prompts' | 'trace' | 'design-map';
    outcome: 'passed' | 'warning' | 'failed' | 'not-run';
    issueCounts: { fail: number | null; warn: number | null };
    strict: boolean;
    exitCode: 0 | 1;
  };
}

export type InspectionErrorCode = 'INSPECTION_NO_RUNS_FOUND' | 'INSPECTION_RUN_NOT_FOUND' |
  'INSPECTION_RUN_UNREADABLE' | 'INSPECTION_CHECK_INVALID_SELECTION' | 'INSPECTION_FAILED';
export interface RunEvidenceInspectionErrorV1 {
  schemaVersion: '1.0.0';
  error: { code: InspectionErrorCode };
}

export function inspectionError(code: InspectionErrorCode): RunEvidenceInspectionErrorV1 {
  return { schemaVersion: '1.0.0', error: { code } };
}

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/** Presentation only: every policy decision comes from the supplied canonical results. */
export function projectRunEvidenceInspection(
  run: Pick<RunMetadata, 'runId' | 'mode' | 'currentStage' | 'status'>,
  gate: RunIntegrityGateResult,
  judge: Pick<JudgeIntegrityResult, 'judgeVerdictAccepted'>,
  eligibility: Pick<FinalReportEligibilityResult, 'eligible'>,
  checks?: RunEvidenceInspectionV1['checks'],
): RunEvidenceInspectionV1 {
  const ecosystem = gate.ecosystemEvidence;
  const required = gate.ecosystemEvidenceRequired === true;
  return {
    schemaVersion: '1.0.0',
    run: { runId: run.runId, mode: run.mode, currentStage: run.currentStage, status: run.status },
    ecosystem: {
      required,
      classification: required ? ecosystem!.classification : 'not-required',
      requirements: required ? [...ecosystem!.requirements].sort((a, b) => compare(a.requirementId, b.requirementId)).map(r => ({
        requirementId: r.requirementId, capabilityId: r.capabilityId, criticality: r.criticality, state: r.state,
        matchingEvidenceIds: [...r.matchingEvidenceIds].sort(compare), issueCodes: [...r.issueCodes],
      })) : [],
      blockers: required ? [...ecosystem!.blockingCodes] : [],
      warnings: required ? [...ecosystem!.warningCodes] : [],
    },
    integrity: {
      ready: gate.runIntegrityReady,
      expectedJudgeVerdict: gate.expectedJudgeVerdict,
      // blockingCodes retains context meaning and includes ECO in Batch 2;
      // semantic codes have their own established field. Insert semantic before ECO.
      blockingCodes: [...new Set([
        ...gate.blockingCodes.filter(code => !(gate.ecosystemEvidenceBlockingCodes as readonly string[] | undefined)?.includes(code)),
        ...gate.semanticContinuityBlockingCodes,
        ...(gate.ecosystemEvidenceBlockingCodes ?? []),
      ])],
    },
    judge: { accepted: judge.judgeVerdictAccepted, finalReportEligible: eligibility.eligible },
    ...(checks ? { checks: {
      selection: checks.selection, outcome: checks.outcome,
      issueCounts: { fail: checks.issueCounts.fail, warn: checks.issueCounts.warn },
      strict: checks.strict, exitCode: checks.exitCode,
    } } : {}),
  };
}

export function serializeRunEvidenceInspection(value: RunEvidenceInspectionV1 | RunEvidenceInspectionErrorV1): string {
  return JSON.stringify(value, null, 2) + '\n';
}
