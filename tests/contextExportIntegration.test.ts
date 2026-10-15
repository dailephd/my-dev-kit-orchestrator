import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun, loadRun } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { makeReadyRunFolder } from './readyContextTestHelpers';
import { runCli } from './cliTestHelpers';
import { buildExportText } from '../src/commands/export';
import { readArtifactStateFile } from '../src/artifactLifecycle';
import { resolveGateCurrentStage } from '../src/stageDetector';
import { evaluateRunIntegrityGate } from '../src/runIntegrityGate';
import { evaluateJudgeIntegrity, evaluateFinalReportEligibility } from '../src/judgeIntegrity';
import type { RunMetadata } from '../src/run';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-export-ctx-'));
}

function advanceToImplementation(meta: ReturnType<typeof createRun>): void {
  for (const stage of meta.stages) {
    if (stage.name === 'implementation') break;
    fs.writeFileSync(path.join(meta.runFolder, stage.artifactFile), 'complete', 'utf8');
  }
}

describe('export command: repository context readiness summary', () => {
  it('reports future context as not required at a pre-owner stage', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const { output } = runCli(['export', '--root', tmp]);
      expect(output).toContain('=== Repository context readiness ===');
      expect(output).toContain('Current stage: request-brief');
      expect(output).toContain('overallDecision: not-required');
      expect(output).not.toContain('implementationContext:');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('includes a ready summary once context is populated', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      advanceToImplementation(meta);
      makeReadyRunFolder(meta.runFolder, 'feature');
      const { output } = runCli(['export', '--root', tmp]);
      expect(output).toContain('overallDecision: ready');
      expect(output).not.toContain('primaryContextKind:');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('export still succeeds (exits 0) even when context is not ready', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const { exitCode } = runCli(['export', '--root', tmp]);
      expect(exitCode).toBeUndefined();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('does not embed raw supplemental packet/report text', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const { output } = runCli(['export', '--root', tmp]);
      expect(output).not.toContain('## Focus');
      expect(output).not.toContain('Not populated.');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('preserves all existing export sections', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const { output } = runCli(['export', '--root', tmp]);
      for (const section of [
        'Run identity',
        'Request',
        'Artifact checklist',
        'Missing artifacts',
        'Judge verdict',
        'Correction state',
        'Verification evidence',
        'Check summaries',
        'Next command',
      ]) {
        expect(output).toContain(`=== ${section} ===`);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('greenfield export reports not-required', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'a new app', mode: 'greenfield', projectRoot: tmp });
      const { output } = runCli(['export', '--root', tmp]);
      expect(output).toContain('overallDecision: not-required');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('export command: accepted judge correction states (ORC-INTEGRATION-002)', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
    initWorkspace(root);
  });

  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  function activatedRun(): RunMetadata {
    // Same supported state as the R3 installed reproduction: initialized empty
    // evidence, a critical requirement, and no invented external correction stage.
    return createRun({ request: 'export correction fixture', mode: 'greenfield', projectRoot: root,
      ecosystemRequirementsDocument: {
        schemaVersion: '1.0.0',
        subject: { schemaVersion: '1.0.0', authority: '@dailephd/my-frontend-observer',
          namespace: 'my-frontend-observer/runtime', value: 'PRIVATE-SUBJECT-NOT-FOR-EXPORT' },
        requirements: [{ schemaVersion: '1.0.0', requirementId: 'observer-context',
          capabilityId: 'my-frontend-observer/frontend-change-review', criticality: 'critical',
          acceptedArtifactKinds: ['my-frontend-observer/bounded-agent-context'] }],
      } });
  }

  function writeJudge(meta: RunMetadata, text: string): void {
    fs.writeFileSync(path.join(meta.runFolder, 'artifacts/judge-report.txt'), text, 'utf8');
  }

  function evaluate(meta: RunMetadata) {
    const stateFile = readArtifactStateFile(meta.runFolder);
    const gate = evaluateRunIntegrityGate({ ...meta,
      currentStage: resolveGateCurrentStage(meta, stateFile),
      workflowStageNames: meta.stages.map(stage => stage.name) });
    const judge = evaluateJudgeIntegrity({ gate, runFolder: meta.runFolder, mode: meta.mode });
    const eligibility = evaluateFinalReportEligibility({ gate, judgeIntegrity: judge,
      runFolder: meta.runFolder, stages: meta.stages, stateFile });
    return { gate, judge, eligibility };
  }

  const normalize = (text: string): string => text.replace(/^Generated:.*$/m, 'Generated: <volatile>');
  const section = (text: string, name: string): string =>
    text.split(`=== ${name} ===`)[1].split('=== ')[0].trim();

  it('exports accepted NEED_CONTEXT without a route honestly and keeps final completion blocked', () => {
    const meta = activatedRun();
    writeJudge(meta, 'Verdict: NEED_CONTEXT\n');
    const { gate, judge, eligibility } = evaluate(meta);
    expect(gate.expectedJudgeVerdict).toBe('NEED_CONTEXT');
    expect(gate.ecosystemEvidenceBlockingCodes).toContain('ECO_REQUIREMENT_MISSING_EVIDENCE');
    expect(judge).toMatchObject({ judgeVerdictAccepted: true, correctionRequired: false,
      correctionBlocked: false, acceptedCorrectionStage: null, finalReportEligible: false });
    expect(eligibility.eligible).toBe(false);

    const text = buildExportText(meta);
    expect(section(text, 'Judge verdict')).toBe('NEED_CONTEXT (accepted: true)');
    expect(section(text, 'Correction state')).toBe(
      'NEED_CONTEXT -- accepted; no correction stage available (final report ineligible)');
    expect(text).not.toContain('rejected');
    expect(text).toContain('Final-report eligible: false');
    expect(normalize(buildExportText(meta))).toBe(normalize(text));
    expect(section(runCli(['export', '--root', root, '--run', meta.runId]).output, 'Correction state'))
      .toBe(section(text, 'Correction state'));
  });

  it('preserves accepted NEED_CONTEXT routing to the canonical implementation stage', () => {
    const meta = createRun({ request: 'routed correction fixture', mode: 'feature', projectRoot: root });
    advanceToImplementation(meta);
    writeJudge(meta, 'Verdict: NEED_CONTEXT\n');
    const current = loadRun(meta.runFolder);
    const { gate, judge, eligibility } = evaluate(current);
    expect(gate.expectedJudgeVerdict).toBe('NEED_CONTEXT');
    expect(judge).toMatchObject({ judgeVerdictAccepted: true, correctionRequired: true,
      acceptedCorrectionStage: 'implementation' });
    expect(eligibility.eligible).toBe(false);
    const text = buildExportText(current);
    expect(section(text, 'Correction state')).toBe(
      'NEED_CONTEXT -> correction required (routed stage: implementation)');
    expect(text).not.toContain('rejected');
  });

  it('keeps an authored PASS explicitly rejected when the gate requires NEED_CONTEXT', () => {
    const meta = activatedRun();
    writeJudge(meta, 'Verdict: PASS\n');
    const { gate, judge, eligibility } = evaluate(meta);
    expect(gate.expectedJudgeVerdict).toBe('NEED_CONTEXT');
    expect(judge.judgeVerdictAccepted).toBe(false);
    expect(eligibility.eligible).toBe(false);
    const text = buildExportText(meta);
    expect(section(text, 'Judge verdict')).toBe('PASS (accepted: false)');
    expect(section(text, 'Correction state')).toContain('PASS -- rejected (expected NEED_CONTEXT:');
    expect(text).not.toContain('PASS -- no correction required');
  });

  it('retains accepted PASS/no-correction wording with all independent eligibility conditions satisfied', () => {
    const meta = createRun({ request: 'legacy PASS fixture', mode: 'feature', projectRoot: root });
    makeReadyRunFolder(meta.runFolder, 'feature');
    for (const stage of meta.stages) {
      if (stage.name === 'final-report') break;
      for (const file of [stage.artifactFile, ...(stage.additionalArtifactFiles ?? [])]) {
        fs.writeFileSync(path.join(meta.runFolder, file), 'complete legacy test fixture', 'utf8');
      }
    }
    writeJudge(meta, 'Verdict: PASS\n');
    const current = loadRun(meta.runFolder);
    const { gate, judge, eligibility } = evaluate(current);
    expect(gate.expectedJudgeVerdict).toBe('PASS');
    expect(judge.judgeVerdictAccepted).toBe(true);
    expect(eligibility.eligible).toBe(true);
    expect(section(buildExportText(current), 'Correction state')).toBe('PASS -- no correction required');
  });

  it.each(['BLOCKED', 'SCOPE_VIOLATION'])('retains the accepted terminal %s wording', verdict => {
    const meta = activatedRun();
    writeJudge(meta, `Verdict: ${verdict}\n`);
    const { judge, eligibility } = evaluate(meta);
    expect(judge).toMatchObject({ judgeVerdictAccepted: true, correctionBlocked: true,
      correctionRequired: false, acceptedCorrectionStage: null });
    expect(eligibility.eligible).toBe(false);
    const text = buildExportText(meta);
    expect(section(text, 'Correction state')).toBe(`${verdict} -- run is blocked (external resolution required)`);
    expect(text).not.toContain('rejected');
  });

  it.each(['DESIGN_INCOMPLETE', 'PSEUDOCODE_INCOMPLETE', 'IMPLEMENTATION_MISMATCH',
    'TEST_COVERAGE_INCOMPLETE', 'ARCHITECTURE_MISMATCH', 'NEED_VERIFICATION'])(
    'retains the accepted %s correction route even when the expected verdict differs', verdict => {
      const meta = createRun({ request: 'legacy correction fixture', mode: 'feature', projectRoot: root });
      writeJudge(meta, `Verdict: ${verdict}\n`);
      const { gate, judge, eligibility } = evaluate(meta);
      expect(gate.expectedJudgeVerdict).toBe('PASS');
      expect(judge).toMatchObject({ judgeVerdictAccepted: true, correctionRequired: true, correctionBlocked: false });
      expect(judge.acceptedCorrectionStage).not.toBeNull();
      expect(eligibility.eligible).toBe(false);
      const text = buildExportText(meta);
      expect(section(text, 'Correction state')).toBe(
        `${verdict} -> correction required (routed stage: ${judge.acceptedCorrectionStage})`);
      expect(text).not.toContain('rejected');
    });

  it.each([undefined, 'No verdict supplied.\n', 'Verdict: NOT_A_VERDICT\n'])(
    'preserves missing/unparseable verdict handling for %s', authored => {
      const meta = activatedRun();
      if (authored !== undefined) writeJudge(meta, authored);
      const { judge, eligibility } = evaluate(meta);
      expect(judge.judgeVerdictAccepted).toBe(false);
      expect(eligibility.eligible).toBe(false);
      const expected = authored === undefined ? 'no judge report' : authored.includes('NOT_A_VERDICT')
        ? 'judge verdict unknown verdict' : 'judge verdict missing verdict';
      expect(section(buildExportText(meta), 'Correction state')).toBe(expected);
    });

  it('preserves every other activated export section and immutable sidecar bytes', () => {
    const meta = activatedRun();
    const requirementsPath = path.join(meta.runFolder, 'ecosystem-requirements.json');
    const evidencePath = path.join(meta.runFolder, 'ecosystem-evidence.json');
    const requirements = fs.readFileSync(requirementsPath);
    const evidence = fs.readFileSync(evidencePath);
    const before = buildExportText(meta);
    writeJudge(meta, 'Verdict: NEED_CONTEXT\n');
    const after = buildExportText(meta);
    expect(section(after, 'Ecosystem evidence')).toBe(section(before, 'Ecosystem evidence'));
    expect(after.match(/=== [^\n]+ ===/g)).toEqual(before.match(/=== [^\n]+ ===/g));
    expect(after).not.toContain('PRIVATE-SUBJECT-NOT-FOR-EXPORT');
    expect(after).not.toContain('nativeArtifact');
    expect(fs.readFileSync(requirementsPath)).toEqual(requirements);
    expect(fs.readFileSync(evidencePath)).toEqual(evidence);
  });

  it('leaves unactivated legacy export text unchanged by stray ECO sidecars', () => {
    const meta = createRun({ request: 'legacy export fixture', mode: 'greenfield', projectRoot: root });
    const before = buildExportText(meta);
    for (const file of ['ecosystem-requirements.json', 'ecosystem-evidence.json']) {
      fs.writeFileSync(path.join(meta.runFolder, file), 'private invalid stray contents', 'utf8');
    }
    const after = buildExportText(meta);
    expect(normalize(after)).toBe(normalize(before));
    expect(after).not.toContain('=== Ecosystem evidence ===');
    expect(after).not.toContain('private invalid stray contents');
  });
});
