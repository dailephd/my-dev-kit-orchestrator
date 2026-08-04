// v1.2.3 Batch 4: remaining required negative-matrix cases not already
// covered by Batches 1-3's dedicated suites (tests/contextReadiness.test.ts,
// tests/judgeIntegrity.test.ts, tests/contextReadinessHistoricalMatrix.test.ts).
//
// This file owns:
//   - the exhaustive correction-verdict family table (AGENTS.txt section
//     7.13-7.15: every supported non-PASS/non-NEED_CONTEXT verdict, plus
//     SCOPE_VIOLATION/BLOCKED, must deny final-report eligibility);
//   - the "conflicting problems" precedence case (section 7.19: repository
//     context refresh-required *and* an unrelated authored correction
//     verdict at the same time);
//   - repeated-evaluation determinism for judge-integrity/final-report
//     eligibility outputs (section 9), which Batches 1-3's determinism
//     coverage (tests/v121Determinism.test.ts) predates.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun, RunMetadata } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { makeReadyRunFolder } from './readyContextTestHelpers';
import { evaluateRunIntegrityGate } from '../src/runIntegrityGate';
import { evaluateJudgeIntegrity, evaluateFinalReportEligibility } from '../src/judgeIntegrity';
import { readArtifactStateFile } from '../src/artifactLifecycle';
import { JUDGE_VERDICTS, JudgeVerdict } from '../src/judgeParser';
import { buildExportText } from '../src/commands/export';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-batch4-negative-'));
}

function makeFeatureRun(tmp: string): RunMetadata {
  initWorkspace(tmp);
  return createRun({ request: 'batch4 negative matrix', mode: 'feature', projectRoot: tmp });
}

function writeAllPriorArtifacts(meta: RunMetadata, stageName: string) {
  const idx = meta.stages.findIndex((s) => s.name === stageName);
  for (const s of meta.stages.slice(0, idx)) {
    fs.writeFileSync(path.join(meta.runFolder, s.artifactFile), 'done', 'utf8');
  }
}

function writeJudgeReport(meta: RunMetadata, content: string) {
  fs.writeFileSync(path.join(meta.runFolder, 'artifacts', 'judge-report.txt'), content, 'utf8');
}

function evaluateFor(meta: RunMetadata) {
  const gate = evaluateRunIntegrityGate({
    mode: meta.mode,
    runFolder: meta.runFolder,
    workflowStageNames: meta.stages.map((s) => s.name),
    projectRoot: meta.projectRoot,
  });
  const judgeIntegrity = evaluateJudgeIntegrity({ gate, runFolder: meta.runFolder, mode: meta.mode });
  const stateFile = readArtifactStateFile(meta.runFolder);
  const eligibility = evaluateFinalReportEligibility({ gate, judgeIntegrity, runFolder: meta.runFolder, stages: meta.stages, stateFile });
  return { gate, judgeIntegrity, eligibility };
}

const CORRECTION_FAMILY_VERDICTS: JudgeVerdict[] = [
  'DESIGN_INCOMPLETE',
  'PSEUDOCODE_INCOMPLETE',
  'IMPLEMENTATION_MISMATCH',
  'TEST_COVERAGE_INCOMPLETE',
  'ARCHITECTURE_MISMATCH',
  'NEED_VERIFICATION',
];

const TERMINAL_BLOCKED_VERDICTS: JudgeVerdict[] = ['SCOPE_VIOLATION', 'BLOCKED'];

describe('v1.2.3 Batch 4: exhaustive correction-verdict family denies final-report eligibility', () => {
  it.each(CORRECTION_FAMILY_VERDICTS)('%s is accepted, routed, and denies final-report eligibility', (verdict) => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, `Verdict: ${verdict}`);
      const { judgeIntegrity, eligibility } = evaluateFor(meta);
      expect(judgeIntegrity.authoredJudgeVerdict).toBe(verdict);
      expect(judgeIntegrity.judgeVerdictAccepted).toBe(true);
      expect(judgeIntegrity.correctionRequired).toBe(true);
      expect(judgeIntegrity.correctionBlocked).toBe(false);
      expect(typeof judgeIntegrity.acceptedCorrectionStage).toBe('string');
      expect(eligibility.eligible).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it.each(TERMINAL_BLOCKED_VERDICTS)('%s is a terminal blocked state with no normal correction route and denies final-report eligibility', (verdict) => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, `Verdict: ${verdict}`);
      const { judgeIntegrity, eligibility } = evaluateFor(meta);
      expect(judgeIntegrity.authoredJudgeVerdict).toBe(verdict);
      expect(judgeIntegrity.correctionBlocked).toBe(true);
      expect(judgeIntegrity.correctionRequired).toBe(false);
      expect(judgeIntegrity.acceptedCorrectionStage).toBeNull();
      expect(eligibility.eligible).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('every supported judge verdict is exercised by this file or judgeIntegrity.test.ts (no silently-untested vocabulary drift)', () => {
    const coveredHere = new Set([...CORRECTION_FAMILY_VERDICTS, ...TERMINAL_BLOCKED_VERDICTS]);
    const coveredElsewhere = new Set<JudgeVerdict>(['PASS', 'NEED_CONTEXT']); // tests/judgeIntegrity.test.ts
    for (const verdict of JUDGE_VERDICTS) {
      expect(coveredHere.has(verdict) || coveredElsewhere.has(verdict)).toBe(true);
    }
  });
});

describe('v1.2.3 Batch 4 section 7.19: conflicting problems (refresh-required context + an unrelated correction verdict)', () => {
  it('run-integrity blockers remain visible, the accepted correction is deterministic, and final report stays denied', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      // Deliberately do NOT populate context -- implementation/test context
      // stay refresh-required (fresh run), while the authored judge verdict
      // is an unrelated, ordinary correction verdict rather than PASS or
      // NEED_CONTEXT.
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'Verdict: DESIGN_INCOMPLETE');

      const { gate, judgeIntegrity, eligibility } = evaluateFor(meta);

      // Run-integrity blockers remain visible: the gate still reports both
      // context kinds blocked and NEED_CONTEXT expected, regardless of what
      // the judge happened to author.
      expect(gate.contextReady).toBe(false);
      expect([...gate.blockedStageNames].sort()).toEqual(['implementation', 'test-implementation']);
      expect(gate.expectedJudgeVerdict).toBe('NEED_CONTEXT');

      // Precedence decision (documented here, per AGENTS.txt section 7.19):
      // an authored DESIGN_INCOMPLETE is not the dangerous PASS/NEED_CONTEXT
      // contradiction Batch 3 section 6.2 targets -- the judge never
      // claimed the run was ready, so judge-integrity accepts the verdict
      // as itself and routes it through the ordinary correction table
      // (behavior-model for DESIGN_INCOMPLETE), rather than overriding it
      // with the context-repair recommendation. The canonical context
      // recommendation is not lost, however: it remains fully visible on
      // `gate.recommendedCorrectionStage` for status/check to surface
      // alongside the judge's own correction route, and it is exactly what
      // routes the run once the judge report is corrected to NEED_CONTEXT
      // (see the sibling case below).
      expect(judgeIntegrity.judgeVerdictAccepted).toBe(true);
      expect(judgeIntegrity.correctionRequired).toBe(true);
      expect(judgeIntegrity.acceptedCorrectionStage).toBe('behavior-model');
      expect(gate.recommendedCorrectionStage).toBe('implementation');

      // Final report remains denied either way.
      expect(eligibility.eligible).toBe(false);

      // Deterministic across repeated evaluation.
      const second = evaluateFor(meta);
      expect(second.judgeIntegrity.acceptedCorrectionStage).toBe(judgeIntegrity.acceptedCorrectionStage);
      expect(second.gate.recommendedCorrectionStage).toBe(gate.recommendedCorrectionStage);
      expect(second.eligibility.eligible).toBe(eligibility.eligible);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('once the judge is corrected to NEED_CONTEXT, the canonical context recommendation drives routing', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'Verdict: NEED_CONTEXT');
      const { gate, judgeIntegrity } = evaluateFor(meta);
      expect(judgeIntegrity.acceptedCorrectionStage).toBe(gate.recommendedCorrectionStage);
      expect(judgeIntegrity.acceptedCorrectionStage).toBe('implementation');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('v1.2.3 Batch 4 determinism: judge-integrity and final-report eligibility', () => {
  it('judge-integrity is deeply equal across repeated evaluation for an unchanged run', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'Verdict: PASS');
      const first = evaluateFor(meta);
      const second = evaluateFor(meta);
      expect(second.judgeIntegrity).toEqual(first.judgeIntegrity);
      expect(second.eligibility.eligible).toBe(first.eligibility.eligible);
      expect(second.eligibility.blockingCodes).toEqual(first.eligibility.blockingCodes);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a rejected authored PASS produces identical blocking codes and accepted correction stage across repeated evaluation', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'Verdict: PASS');
      const first = evaluateFor(meta);
      const second = evaluateFor(meta);
      expect(second.judgeIntegrity.blockingCodes).toEqual(first.judgeIntegrity.blockingCodes);
      expect(second.judgeIntegrity.acceptedCorrectionStage).toBe(first.judgeIntegrity.acceptedCorrectionStage);
      expect(second.eligibility.blockingCodes).toEqual(first.eligibility.blockingCodes);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('v1.2.3 Batch 4 cross-surface check: export must not disagree with status/check/judge-integrity', () => {
  it('export does not report an accepted PASS when the authored PASS contradicts expected NEED_CONTEXT', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'Verdict: PASS');

      const exportText: string = buildExportText(meta);

      expect(exportText).not.toContain('PASS -- no correction required');
      expect(exportText).toContain('PASS (accepted: false)');
      expect(exportText).toContain('correction required (routed stage: implementation)');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('export honestly reports an accepted PASS when context is ready (section 6.4 positive case)', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'Verdict: PASS');

      const exportText: string = buildExportText(meta);
      expect(exportText).toContain('PASS (accepted: true)');
      expect(exportText).toContain('PASS -- no correction required');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
