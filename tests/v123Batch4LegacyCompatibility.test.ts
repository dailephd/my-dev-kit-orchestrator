// v1.2.3 Batch 4 legacy/mode compatibility matrix (AGENTS.txt section 8).
//
// Structural compatibility for greenfield/test/extraction and ordinary
// correction routing is already exercised extensively by
// src/__tests__/{extraction-mode,prompt-generation}.test.ts,
// tests/allStagePacketIntegration.test.ts, and tests/v121*.test.ts. This
// file closes the specific gap those suites don't cover: the *gate-level*
// (RunIntegrityGate/judge-integrity) behavior for each mode family, which
// only exists as of Batches 2-3.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun, RunMetadata } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { makeReadyRunFolder } from './readyContextTestHelpers';
import { getWorkflow } from '../src/workflows';
import { evaluateRunIntegrityGate } from '../src/runIntegrityGate';
import { evaluateJudgeIntegrity, evaluateFinalReportEligibility } from '../src/judgeIntegrity';
import { readArtifactStateFile } from '../src/artifactLifecycle';
import { getNextStageWithRunIntegrity } from '../src/stageDetector';
import { parseAndRoute } from '../src/correctionRouter';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `mdko-batch4-legacy-${prefix}-`));
}

function writeAllPriorArtifacts(meta: RunMetadata, stageName: string) {
  const idx = meta.stages.findIndex((s) => s.name === stageName);
  for (const s of meta.stages.slice(0, idx)) {
    fs.writeFileSync(path.join(meta.runFolder, s.artifactFile), 'done', 'utf8');
  }
}

describe('v1.2.3 Batch 4 section 8.1: legacy schema-major-1 producer evidence', () => {
  it('a schema-major-1 run (no roleConditionCoverage field at all) is ready, accepts PASS, and reaches final-report eligibility', () => {
    const tmp = makeTempDir('schema-major-1');
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'legacy schema-major-1', mode: 'feature', projectRoot: tmp });
      // makeReadyRunFolder's raw evidence template predates v1.10.4 and
      // never declares roleConditionCoverage -- exactly the legacy shape.
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta, 'judge');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts', 'judge-report.txt'), 'Verdict: PASS', 'utf8');

      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: meta.projectRoot,
      });
      expect(gate.contextReady).toBe(true);
      expect(gate.implementationContext?.requiredEvidenceTruncated).toBe('no');
      const judgeIntegrity = evaluateJudgeIntegrity({ gate, runFolder: meta.runFolder, mode: meta.mode });
      expect(judgeIntegrity.judgeVerdictAccepted).toBe(true);
      const stateFile = readArtifactStateFile(meta.runFolder);
      const eligibility = evaluateFinalReportEligibility({ gate, judgeIntegrity, runFolder: meta.runFolder, stages: meta.stages, stateFile });
      expect(eligibility.eligible).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('v1.2.3 Batch 4 section 8.3: greenfield compatibility', () => {
  it('requires neither implementation nor test context and accepted PASS permits final-report completion', () => {
    const tmp = makeTempDir('greenfield');
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'a new app', mode: 'greenfield', projectRoot: tmp });
      writeAllPriorArtifacts(meta, 'final-report');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts', 'judge-report.txt'), 'Verdict: PASS', 'utf8');

      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: meta.projectRoot,
      });
      expect(gate.contextRequired).toBe(false);
      expect(gate.applicableContextKinds).toEqual([]);
      expect(gate.blockedStageNames).toEqual([]);
      expect(gate.expectedJudgeVerdict).toBe('PASS');

      const judgeIntegrity = evaluateJudgeIntegrity({ gate, runFolder: meta.runFolder, mode: meta.mode });
      const stateFile = readArtifactStateFile(meta.runFolder);
      const eligibility = evaluateFinalReportEligibility({ gate, judgeIntegrity, runFolder: meta.runFolder, stages: meta.stages, stateFile });
      expect(eligibility.eligible).toBe(true);

      // Stage order/artifacts unchanged from the existing greenfield workflow.
      const workflow = getWorkflow('greenfield');
      expect(workflow.stages.map((s) => s.name)).toEqual(meta.stages.map((s) => s.name));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('v1.2.3 Batch 4 section 8.4: test-mode compatibility', () => {
  it('requires only test context; implementation-context absence does not block', () => {
    const tmp = makeTempDir('testmode');
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test mode run', mode: 'test', projectRoot: tmp });
      makeReadyRunFolder(meta.runFolder, 'test');
      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: meta.projectRoot,
      });
      expect(gate.applicableContextKinds).toEqual(['test']);
      expect(gate.contextReady).toBe(true);
      expect(gate.blockedStageNames).toEqual([]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a test-context failure recommends test-implementation, and ready test context permits normal progression', () => {
    const tmp = makeTempDir('testmode-blocked');
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test mode run blocked', mode: 'test', projectRoot: tmp });
      // Fresh run: test context is refresh-required (only context kind this
      // mode has at all).
      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: meta.projectRoot,
      });
      expect(gate.blockedStageNames).toEqual(['test-implementation']);
      expect(gate.recommendedCorrectionStage).toBe('test-implementation');

      makeReadyRunFolder(meta.runFolder, 'test');
      const readyGate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: meta.projectRoot,
      });
      const stateFile = readArtifactStateFile(meta.runFolder);
      const next = getNextStageWithRunIntegrity(meta, stateFile, readyGate);
      // Normal sequential progression: the first stage without a real
      // artifact yet, not blocked by test-context readiness.
      expect(next?.name).toBe(meta.stages[0].name);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('v1.2.3 Batch 4 section 8.5: extraction compatibility', () => {
  it('implementation and test context requirements exist and use the extraction workflow scope', () => {
    const tmp = makeTempDir('extraction');
    try {
      initWorkspace(tmp);
      const meta = createRun({
        request: 'extraction run',
        mode: 'extraction',
        projectRoot: tmp,
        sourceRepoRoot: '/source/repo',
        targetRepoRoot: '/target/repo',
      });
      makeReadyRunFolder(meta.runFolder, 'extraction');
      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: meta.projectRoot,
      });
      expect([...gate.applicableContextKinds].sort()).toEqual(['implementation', 'test']);
      expect(gate.contextReady).toBe(true);
      expect(meta.sourceRepoRoot).toBe('/source/repo');
      expect(meta.targetRepoRoot).toBe('/target/repo');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('v1.2.3 Batch 4 section 8.6: correction-routing stability', () => {
  it('a valid non-context verdict still honors an authored "Recommended next stage" override (unconstrained by Batch 3, which only constrains NEED_CONTEXT)', () => {
    const parsed = parseAndRoute('Verdict: ARCHITECTURE_MISMATCH\nRecommended next stage: pseudocode-packet');
    expect(parsed.routeStatus).toBe('correction_required');
    expect(parsed.routedStage).toBe('pseudocode-packet');
    expect(parsed.warnings.some((w) => w.includes('Using recommended stage'))).toBe(true);
  });

  it('SCOPE_VIOLATION and BLOCKED remain terminal at the raw router level', () => {
    expect(parseAndRoute('Verdict: SCOPE_VIOLATION').routeStatus).toBe('blocked');
    expect(parseAndRoute('Verdict: BLOCKED').routeStatus).toBe('blocked');
  });
});
