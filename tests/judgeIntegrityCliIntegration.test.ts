// Cross-command integration tests for canonical judge-verdict acceptance
// and final-report eligibility (v1.2.3 Batch 3): proves prompt,
// lifecycle/stage-detection, mark, status, and check all agree on the same
// accepted-or-rejected judge state and final-report eligibility for the
// same run.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun, RunMetadata } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { makeReadyRunFolder } from './readyContextTestHelpers';
import { runCli } from './cliTestHelpers';
import { getArtifactStatePath, readArtifactStateFile } from '../src/artifactLifecycle';
import { getNextStageWithRunIntegrity } from '../src/stageDetector';
import { evaluateRunIntegrityGate } from '../src/runIntegrityGate';
import { evaluateJudgeIntegrity, evaluateFinalReportEligibility } from '../src/judgeIntegrity';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-judge-cli-'));
}

function makeFeatureRun(tmp: string): RunMetadata {
  initWorkspace(tmp);
  return createRun({ request: 'judge cli integration', mode: 'feature', projectRoot: tmp });
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

describe('Judge/final-report integrity CLI integration: prompt', () => {
  it('explicit final-report request is rejected after NEED_CONTEXT', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'Verdict: NEED_CONTEXT');
      const { output } = runCli(['prompt', 'final-report', '--root', tmp]);
      expect(output).toContain('Final-report generation is BLOCKED');
      expect(output).not.toContain('Required output artifact: FinalReport');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('explicit final-report request is rejected after an authored PASS contradicts expected NEED_CONTEXT', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'Verdict: PASS');
      const { output } = runCli(['prompt', 'final-report', '--root', tmp]);
      expect(output).toContain('Final-report generation is BLOCKED');
      expect(output).toContain('JUDGE_VERDICT_CONTRADICTS_RUN_INTEGRITY');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('explicit final-report request is rejected after a valid correction verdict', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'Verdict: TEST_COVERAGE_INCOMPLETE');
      const { output } = runCli(['prompt', 'final-report', '--root', tmp]);
      expect(output).toContain('Final-report generation is BLOCKED');
      expect(output).toContain('Recommended correction stage:');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('explicit final-report request is rejected after a malformed judge report', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'not a valid judge report');
      const { output } = runCli(['prompt', 'final-report', '--root', tmp]);
      expect(output).toContain('Final-report generation is BLOCKED');
      expect(output).toContain('JUDGE_VERDICT_MISSING');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('explicit final-report request is rejected when the judge report is missing entirely', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      // Up to (not including) 'judge' so artifacts/judge-report.txt itself
      // is never written -- a true "judge artifact missing" scenario.
      writeAllPriorArtifacts(meta, 'judge');
      // The pre-existing "missing prior artifact" guard in prompt.ts
      // already rejects this before reaching the final-report eligibility
      // check (judge-report.txt itself is a required prior artifact) --
      // still a rejection, just via that existing mechanism's own message.
      const { output, exitCode } = runCli(['prompt', 'final-report', '--root', tmp]);
      expect(exitCode).toBe(1);
      expect(output).not.toContain('Required output artifact: FinalReport');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('automatic stage detection does not select final-report when ineligible', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'Verdict: NEED_VERIFICATION');
      const { output } = runCli(['prompt', '--root', tmp]);
      expect(output).not.toContain('Required output artifact: FinalReport');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('accepted PASS in a ready run renders the normal final-report prompt', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'Verdict: PASS');
      const { output } = runCli(['prompt', 'final-report', '--root', tmp]);
      expect(output).not.toContain('Final-report generation is BLOCKED');
      expect(output).toContain('Required output artifact: FinalReport');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('prompt display remains read-only', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'Verdict: PASS');
      const runJsonPath = path.join(meta.runFolder, 'run.json');
      const before = fs.readFileSync(runJsonPath, 'utf8');
      const judgeBefore = fs.readFileSync(path.join(meta.runFolder, 'artifacts', 'judge-report.txt'), 'utf8');
      runCli(['prompt', 'final-report', '--root', tmp]);
      runCli(['prompt', '--root', tmp]);
      expect(fs.readFileSync(runJsonPath, 'utf8')).toBe(before);
      expect(fs.readFileSync(path.join(meta.runFolder, 'artifacts', 'judge-report.txt'), 'utf8')).toBe(judgeBefore);
      expect(fs.existsSync(path.join(meta.runFolder, 'artifacts', 'final-report.txt'))).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('Judge/final-report integrity CLI integration: lifecycle and mark', () => {
  it('an existing final-report.txt does not complete an ineligible run', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta, 'final-report');
      // Ready context, all prior artifacts present, but the judge verdict is
      // a genuine (non-PASS) correction verdict -- final-report.txt's mere
      // presence must not paper over that.
      writeJudgeReport(meta, 'Verdict: IMPLEMENTATION_MISMATCH');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts', 'final-report.txt'), 'Status: complete\n', 'utf8');
      const eligibility = eligibilityFor(meta);
      expect(eligibility.eligible).toBe(false);
      const stateFile = readArtifactStateFile(meta.runFolder);
      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: meta.projectRoot,
      });
      const next = getNextStageWithRunIntegrity(meta, stateFile, gate, eligibility.eligible);
      expect(next?.name).toBe('final-report');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('manual complete does not override ineligibility', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'Verdict: PASS');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts', 'final-report.txt'), 'done', 'utf8');
      const { exitCode, output } = runCli(['mark', 'final-report.txt', '--state', 'complete', '--root', tmp]);
      expect(exitCode).toBe(1);
      expect(output).toContain('not eligible for a final report');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejected mark does not mutate artifact-state.json', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'Verdict: PASS');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts', 'final-report.txt'), 'done', 'utf8');
      const statePath = getArtifactStatePath(meta.runFolder);
      expect(fs.existsSync(statePath)).toBe(false);
      runCli(['mark', 'final-report.txt', '--state', 'complete', '--root', tmp]);
      expect(fs.existsSync(statePath)).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('accepted PASS permits normal final-report completion', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'Verdict: PASS');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts', 'final-report.txt'), 'done', 'utf8');
      const { exitCode } = runCli(['mark', 'final-report.txt', '--state', 'complete', '--root', tmp]);
      expect(exitCode).toBeUndefined();
      const statePath = getArtifactStatePath(meta.runFolder);
      const stateFile = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      expect(stateFile.artifacts['artifacts/final-report.txt'].state).toBe('complete');

      const eligibility = eligibilityFor(meta);
      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: meta.projectRoot,
      });
      const next = getNextStageWithRunIntegrity(meta, readArtifactStateFile(meta.runFolder), gate, eligibility.eligible);
      expect(next).toBeNull();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('unrelated stages remain compatible while final-report is ineligible', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/request-brief.txt'), 'done', 'utf8');
      const { exitCode } = runCli(['mark', 'request-brief.txt', '--state', 'complete', '--root', tmp]);
      expect(exitCode).toBeUndefined();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('Judge/final-report integrity CLI integration: status and check agreement', () => {
  function assertAllSurfacesAgree(
    meta: RunMetadata,
    tmp: string,
    expectFinalReportEligible: boolean,
    expectCheckFail: boolean,
  ) {
    const eligibility = eligibilityFor(meta);
    expect(eligibility.eligible).toBe(expectFinalReportEligible);

    const status = runCli(['status', '--root', tmp]);
    expect(status.output).toContain(`Final-report eligible: ${expectFinalReportEligible}`);

    const check = runCli(['check', '--root', tmp]);
    const checkAll = runCli(['check', '--all', '--root', tmp]);
    if (expectCheckFail) {
      expect(check.exitCode).toBe(1);
      expect(checkAll.exitCode).toBe(1);
    }

    const promptResult = runCli(['prompt', 'final-report', '--root', tmp]);
    expect(promptResult.output.includes('Required output artifact: FinalReport')).toBe(expectFinalReportEligible);
  }

  it('expected NEED_CONTEXT plus authored PASS: all surfaces agree the run is blocked', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'Verdict: PASS');
      assertAllSurfacesAgree(meta, tmp, false, true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('expected NEED_CONTEXT plus authored NEED_CONTEXT: all surfaces agree the run needs correction', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'Verdict: NEED_CONTEXT');
      assertAllSurfacesAgree(meta, tmp, false, false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('expected PASS plus authored PASS: all surfaces agree the run is eligible', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'Verdict: PASS');
      assertAllSurfacesAgree(meta, tmp, true, false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a valid correction verdict: all surfaces agree the run needs correction, not final-report', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'Verdict: ARCHITECTURE_MISMATCH');
      assertAllSurfacesAgree(meta, tmp, false, false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a malformed judge report: all surfaces agree the run is not eligible and check fails', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta, 'final-report');
      writeJudgeReport(meta, 'not a judge report at all');
      assertAllSurfacesAgree(meta, tmp, false, true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a missing judge report: all surfaces agree the run is not eligible without failing check on judge integrity alone', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      writeAllPriorArtifacts(meta, 'final-report');
      assertAllSurfacesAgree(meta, tmp, false, false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
