// Focused tests for canonical judge-verdict acceptance and final-report
// eligibility (v1.2.3 Batch 3). Proves evaluateJudgeIntegrity()/
// evaluateFinalReportEligibility() on top of real RunMetadata-backed run
// folders, reusing Batch 2's makeReadyRunFolder helper -- not re-deriving
// readiness policy here (that remains contextReadiness.ts/runIntegrityGate.ts's
// job).

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun, RunMetadata } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { makeReadyRunFolder } from './readyContextTestHelpers';
import { evaluateRunIntegrityGate } from '../src/runIntegrityGate';
import { evaluateJudgeIntegrity, evaluateFinalReportEligibility } from '../src/judgeIntegrity';
import { readArtifactStateFile } from '../src/artifactLifecycle';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-judge-integrity-'));
}

function makeFeatureRun(tmp: string): RunMetadata {
  initWorkspace(tmp);
  return createRun({ request: 'judge integrity test', mode: 'feature', projectRoot: tmp });
}

function writeJudgeReport(meta: RunMetadata, content: string) {
  fs.writeFileSync(path.join(meta.runFolder, 'artifacts', 'judge-report.txt'), content, 'utf8');
}

function judgeIntegrityFor(meta: RunMetadata) {
  const gate = evaluateRunIntegrityGate({
    mode: meta.mode,
    runFolder: meta.runFolder,
    workflowStageNames: meta.stages.map((s) => s.name),
    projectRoot: meta.projectRoot,
  });
  return { gate, judgeIntegrity: evaluateJudgeIntegrity({ gate, runFolder: meta.runFolder, mode: meta.mode }) };
}

describe('evaluateJudgeIntegrity: pure acceptance rules', () => {
  it('expected PASS plus authored PASS is accepted', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeJudgeReport(meta, 'Verdict: PASS');
      const { judgeIntegrity } = judgeIntegrityFor(meta);
      expect(judgeIntegrity.expectedJudgeVerdict).toBe('PASS');
      expect(judgeIntegrity.authoredJudgeVerdict).toBe('PASS');
      expect(judgeIntegrity.judgeVerdictMatchesExpected).toBe(true);
      expect(judgeIntegrity.judgeVerdictAccepted).toBe(true);
      expect(judgeIntegrity.finalReportEligible).toBe(true);
      expect(judgeIntegrity.correctionRequired).toBe(false);
      expect(judgeIntegrity.blockingCodes).toEqual([]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('expected NEED_CONTEXT plus authored NEED_CONTEXT is accepted and uses the canonical recommended stage', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeJudgeReport(meta, 'Verdict: NEED_CONTEXT');
      const { gate, judgeIntegrity } = judgeIntegrityFor(meta);
      expect(judgeIntegrity.expectedJudgeVerdict).toBe('NEED_CONTEXT');
      expect(judgeIntegrity.authoredJudgeVerdict).toBe('NEED_CONTEXT');
      expect(judgeIntegrity.judgeVerdictAccepted).toBe(true);
      expect(judgeIntegrity.correctionRequired).toBe(true);
      expect(judgeIntegrity.acceptedCorrectionStage).toBe(gate.recommendedCorrectionStage);
      expect(judgeIntegrity.acceptedCorrectionStage).toBe('implementation');
      expect(judgeIntegrity.finalReportEligible).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('expected NEED_CONTEXT plus authored PASS is rejected (6.2 contradiction)', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeJudgeReport(meta, 'Verdict: PASS');
      const { gate, judgeIntegrity } = judgeIntegrityFor(meta);
      expect(judgeIntegrity.expectedJudgeVerdict).toBe('NEED_CONTEXT');
      expect(judgeIntegrity.authoredJudgeVerdict).toBe('PASS');
      expect(judgeIntegrity.judgeVerdictMatchesExpected).toBe(false);
      expect(judgeIntegrity.judgeVerdictAccepted).toBe(false);
      expect(judgeIntegrity.finalReportEligible).toBe(false);
      expect(judgeIntegrity.blockingCodes).toContain('JUDGE_VERDICT_CONTRADICTS_RUN_INTEGRITY');
      // Still routes to the canonical context-repair stage -- the run
      // remains correction-required, not silently cleared.
      expect(judgeIntegrity.acceptedCorrectionStage).toBe(gate.recommendedCorrectionStage);
      expect(judgeIntegrity.correctionRequired).toBe(true);
      expect(judgeIntegrity.acceptedCorrectionRoute?.routeStatus).toBe('correction_required');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('expected PASS plus authored NEED_CONTEXT is accepted as a normal correction (not a dangerous contradiction)', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeJudgeReport(meta, 'Verdict: NEED_CONTEXT');
      const { judgeIntegrity } = judgeIntegrityFor(meta);
      expect(judgeIntegrity.expectedJudgeVerdict).toBe('PASS');
      expect(judgeIntegrity.authoredJudgeVerdict).toBe('NEED_CONTEXT');
      expect(judgeIntegrity.judgeVerdictAccepted).toBe(true);
      expect(judgeIntegrity.finalReportEligible).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('missing judge artifact', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      const { judgeIntegrity } = judgeIntegrityFor(meta);
      expect(judgeIntegrity.judgeArtifactPresent).toBe(false);
      expect(judgeIntegrity.judgeVerdictParseStatus).toBe('missing-artifact');
      expect(judgeIntegrity.judgeVerdictAccepted).toBe(false);
      expect(judgeIntegrity.finalReportEligible).toBe(false);
      expect(judgeIntegrity.blockingCodes).toContain('JUDGE_REPORT_MISSING');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('missing verdict field', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeJudgeReport(meta, 'Artifact: JudgeReport\nNo verdict line here.\n');
      const { judgeIntegrity } = judgeIntegrityFor(meta);
      expect(judgeIntegrity.judgeArtifactPresent).toBe(true);
      expect(judgeIntegrity.judgeVerdictParseStatus).toBe('missing-verdict');
      expect(judgeIntegrity.judgeVerdictAccepted).toBe(false);
      expect(judgeIntegrity.finalReportEligible).toBe(false);
      expect(judgeIntegrity.blockingCodes).toContain('JUDGE_VERDICT_MISSING');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('malformed / unknown verdict', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeJudgeReport(meta, 'Verdict: TOTALLY_MADE_UP');
      const { judgeIntegrity } = judgeIntegrityFor(meta);
      expect(judgeIntegrity.judgeVerdictParseStatus).toBe('unknown-verdict');
      expect(judgeIntegrity.judgeVerdictAccepted).toBe(false);
      expect(judgeIntegrity.finalReportEligible).toBe(false);
      expect(judgeIntegrity.blockingCodes).toContain('JUDGE_VERDICT_UNKNOWN');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a valid correction verdict unrelated to context readiness (DESIGN_INCOMPLETE) is accepted and routed via the existing table', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeJudgeReport(meta, 'Verdict: DESIGN_INCOMPLETE');
      const { judgeIntegrity } = judgeIntegrityFor(meta);
      expect(judgeIntegrity.judgeVerdictAccepted).toBe(true);
      expect(judgeIntegrity.correctionRequired).toBe(true);
      expect(judgeIntegrity.acceptedCorrectionStage).toBe('behavior-model');
      expect(judgeIntegrity.finalReportEligible).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('SCOPE_VIOLATION is a terminal blocked verdict', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeJudgeReport(meta, 'Verdict: SCOPE_VIOLATION');
      const { judgeIntegrity } = judgeIntegrityFor(meta);
      expect(judgeIntegrity.judgeVerdictAccepted).toBe(true);
      expect(judgeIntegrity.correctionBlocked).toBe(true);
      expect(judgeIntegrity.correctionRequired).toBe(false);
      expect(judgeIntegrity.acceptedCorrectionStage).toBeNull();
      expect(judgeIntegrity.finalReportEligible).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('BLOCKED is a terminal blocked verdict', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeJudgeReport(meta, 'Verdict: BLOCKED');
      const { judgeIntegrity } = judgeIntegrityFor(meta);
      expect(judgeIntegrity.correctionBlocked).toBe(true);
      expect(judgeIntegrity.finalReportEligible).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('deterministic issue ordering and accepted correction stage across repeated evaluation', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeJudgeReport(meta, 'Verdict: NEED_CONTEXT');
      const first = judgeIntegrityFor(meta).judgeIntegrity;
      const second = judgeIntegrityFor(meta).judgeIntegrity;
      expect(first.blockingCodes).toEqual(second.blockingCodes);
      expect(first.acceptedCorrectionStage).toBe(second.acceptedCorrectionStage);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('canonical recommendation overrides a contradictory authored "Recommended next stage"', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      // Block only test context, so the canonical recommendation is
      // "test-implementation" -- but the authored judge report recommends
      // the unrelated (syntactically valid) "architecture-context" stage.
      for (const rel of ['artifacts/test-context-packet.txt', 'reports/test-context-retrieval-report.txt']) {
        const p = path.join(meta.runFolder, rel);
        fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('Status: populated', 'Status: template'), 'utf8');
      }
      writeJudgeReport(meta, 'Verdict: NEED_CONTEXT\nRecommended next stage: architecture-context');
      const { gate, judgeIntegrity } = judgeIntegrityFor(meta);
      expect(gate.recommendedCorrectionStage).toBe('test-implementation');
      expect(judgeIntegrity.acceptedCorrectionStage).toBe('test-implementation');
      expect(judgeIntegrity.acceptedCorrectionStage).not.toBe('architecture-context');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('evaluateFinalReportEligibility', () => {
  function eligibilityFor(meta: RunMetadata) {
    const gate = evaluateRunIntegrityGate({
      mode: meta.mode,
      runFolder: meta.runFolder,
      workflowStageNames: meta.stages.map((s) => s.name),
      projectRoot: meta.projectRoot,
    });
    const judgeIntegrity = evaluateJudgeIntegrity({ gate, runFolder: meta.runFolder, mode: meta.mode });
    const stateFile = readArtifactStateFile(meta.runFolder);
    return evaluateFinalReportEligibility({ gate, judgeIntegrity, runFolder: meta.runFolder, stages: meta.stages, stateFile });
  }

  function writeAllPriorArtifacts(meta: RunMetadata) {
    for (const s of meta.stages.slice(0, meta.stages.findIndex((st) => st.name === 'final-report'))) {
      fs.writeFileSync(path.join(meta.runFolder, s.artifactFile), 'done', 'utf8');
    }
  }

  it('ready context plus accepted PASS with all prior artifacts complete is eligible', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta);
      writeJudgeReport(meta, 'Verdict: PASS');
      const eligibility = eligibilityFor(meta);
      expect(eligibility.eligible).toBe(true);
      expect(eligibility.priorArtifactsValid).toBe(true);
      expect(eligibility.blockingCodes).toEqual([]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('refresh-required context plus authored PASS is ineligible', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeAllPriorArtifacts(meta);
      writeJudgeReport(meta, 'Verdict: PASS');
      const eligibility = eligibilityFor(meta);
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.blockingCodes).toContain('JUDGE_VERDICT_CONTRADICTS_RUN_INTEGRITY');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('refresh-required context plus authored NEED_CONTEXT is ineligible', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeAllPriorArtifacts(meta);
      writeJudgeReport(meta, 'Verdict: NEED_CONTEXT');
      const eligibility = eligibilityFor(meta);
      expect(eligibility.eligible).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a valid correction verdict is ineligible', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta);
      writeJudgeReport(meta, 'Verdict: TEST_COVERAGE_INCOMPLETE');
      const eligibility = eligibilityFor(meta);
      expect(eligibility.eligible).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a blocked verdict is ineligible', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta);
      writeJudgeReport(meta, 'Verdict: BLOCKED');
      const eligibility = eligibilityFor(meta);
      expect(eligibility.eligible).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a malformed judge report is ineligible', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta);
      writeJudgeReport(meta, 'no verdict line at all');
      const eligibility = eligibilityFor(meta);
      expect(eligibility.eligible).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a missing judge report is ineligible', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta);
      const eligibility = eligibilityFor(meta);
      expect(eligibility.eligible).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('an active correction route (accepted non-PASS verdict) is ineligible', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta);
      writeJudgeReport(meta, 'Verdict: IMPLEMENTATION_MISMATCH');
      const eligibility = eligibilityFor(meta);
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.judgeIntegrity.correctionRequired).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a structurally valid PASS judge report is still ineligible when a required prior artifact is incomplete', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      // Deliberately omit an earlier stage artifact (e.g. verification-report.txt).
      writeJudgeReport(meta, 'Verdict: PASS');
      const eligibility = eligibilityFor(meta);
      expect(eligibility.priorArtifactsValid).toBe(false);
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.blockingCodes).toContain('FINAL_REPORT_PRIOR_ARTIFACTS_INCOMPLETE');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a ready, no-context-required greenfield run with accepted PASS and complete prior artifacts is eligible', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'a new app', mode: 'greenfield', projectRoot: tmp });
      writeAllPriorArtifacts(meta);
      writeJudgeReport(meta, 'Verdict: PASS');
      const eligibility = eligibilityFor(meta);
      expect(eligibility.eligible).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
