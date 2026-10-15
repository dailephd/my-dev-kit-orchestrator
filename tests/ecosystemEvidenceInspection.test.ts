import { deriveRunIntegrityGateResult } from '../src/runIntegrityGate';
import { evaluateRunEcosystemEvidenceReadiness } from '../src/ecosystemEvidenceReadiness';
import { inspectionError, projectRunEvidenceInspection, serializeRunEvidenceInspection } from '../src/ecosystemEvidenceInspection';

const run = { runId: 'run-1', mode: 'greenfield' as const, currentStage: 'idea-brief', status: 'created' as const, request: 'PRIVATE', projectRoot: 'PRIVATE' };
const gate = () => deriveRunIntegrityGateResult('greenfield', {
  mode: 'greenfield', overallDecision: 'not-required', blockingIssueCodes: [], warnings: [],
  recommendedNextStage: null, readyWithAssumptions: false, affectedStages: [],
});

describe('RunEvidenceInspectionV1 pure projection', () => {
  it('projects exact legacy shape, omits checks and private run fields', () => {
    const result = projectRunEvidenceInspection(run, gate(), { judgeVerdictAccepted: false }, { eligible: false });
    expect(result).toEqual({ schemaVersion: '1.0.0', run: { runId: 'run-1', mode: 'greenfield', currentStage: 'idea-brief', status: 'created' },
      ecosystem: { required: false, classification: 'not-required', requirements: [], blockers: [], warnings: [] },
      integrity: { ready: true, expectedJudgeVerdict: 'PASS', blockingCodes: [] }, judge: { accepted: false, finalReportEligible: false } });
    expect(serializeRunEvidenceInspection(result)).not.toContain('PRIVATE');
    expect(serializeRunEvidenceInspection(result)).toBe(JSON.stringify(result, null, 2) + '\n');
  });

  it('retains canonical verdict, precedence, global blockers and independent judge eligibility', () => {
    const g = gate();
    const eco = evaluateRunEcosystemEvidenceReadiness({ activated: true, issues: ['ECO_REQUIREMENTS_DIGEST_MISMATCH'] });
    Object.assign(g, { ecosystemEvidenceRequired: true, ecosystemEvidence: eco, ecosystemEvidenceBlockingCodes: eco.blockingCodes,
      blockingCodes: ['CONTEXT_A', 'CONTEXT_A', ...eco.blockingCodes], semanticContinuityBlockingCodes: ['SEMANTIC_A', 'CONTEXT_A'],
      runIntegrityReady: false, expectedJudgeVerdict: 'NEED_CONTEXT' });
    const result = projectRunEvidenceInspection(run, g, { judgeVerdictAccepted: false }, { eligible: false });
    expect(result.ecosystem).toEqual({ required: true, classification: 'blocked', requirements: [], blockers: ['ECO_REQUIREMENTS_DIGEST_MISMATCH'], warnings: [] });
    expect(result.integrity).toEqual({ ready: false, expectedJudgeVerdict: 'NEED_CONTEXT', blockingCodes: ['CONTEXT_A', 'SEMANTIC_A', 'ECO_REQUIREMENTS_DIGEST_MISMATCH'] });
    expect(result.judge).toEqual({ accepted: false, finalReportEligible: false });
  });

  it('sorts exact identities without mutating evaluator arrays and copies only approved fields', () => {
    const g = gate();
    const rows = ['z', 'A', 'a'].map(requirementId => ({ requirementId, capabilityId: 'cap', criticality: 'noncritical' as const,
      state: 'satisfied' as const, matchingEvidenceIds: ['z', 'A', 'a'], issueCodes: [] }));
    Object.assign(g, { ecosystemEvidenceRequired: true, ecosystemEvidence: { required: true, classification: 'ready', requirements: rows, blockingCodes: [], warningCodes: [] } });
    const first = projectRunEvidenceInspection(run, g, { judgeVerdictAccepted: true }, { eligible: false });
    g.ecosystemEvidence!.requirements = [...rows].reverse();
    const second = projectRunEvidenceInspection(run, g, { judgeVerdictAccepted: true }, { eligible: false });
    expect(second).toEqual(first);
    expect(first.ecosystem.requirements.map(r => r.requirementId)).toEqual(['A', 'a', 'z']);
    expect(first.ecosystem.requirements[0].matchingEvidenceIds).toEqual(['A', 'a', 'z']);
    expect(rows[0].matchingEvidenceIds).toEqual(['z', 'A', 'a']);
  });

  it('preserves a strict warning with exit 1 and includes checks only when supplied', () => {
    const checks = { selection: 'trace' as const, outcome: 'warning' as const, issueCounts: { fail: 0, warn: 2 }, strict: true, exitCode: 1 as const };
    const result = projectRunEvidenceInspection(run, gate(), { judgeVerdictAccepted: false }, { eligible: false }, checks);
    expect(result.checks).toEqual(checks);
    expect(Object.keys(result)).toEqual(['schemaVersion', 'run', 'ecosystem', 'integrity', 'judge', 'checks']);
  });

  it.each(['INSPECTION_NO_RUNS_FOUND', 'INSPECTION_RUN_NOT_FOUND', 'INSPECTION_RUN_UNREADABLE', 'INSPECTION_CHECK_INVALID_SELECTION', 'INSPECTION_FAILED'] as const)('emits exactly the sanitized %s envelope', code => {
    expect(inspectionError(code)).toEqual({ schemaVersion: '1.0.0', error: { code } });
    expect(JSON.parse(serializeRunEvidenceInspection(inspectionError(code)))).toEqual(inspectionError(code));
  });
});
