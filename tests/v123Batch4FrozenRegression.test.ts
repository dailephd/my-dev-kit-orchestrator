// v1.2.3 Batch 4: permanent frozen-negative and corrected-positive
// regression fixtures (AGENTS.txt section 5).
//
// Unlike tests/runIntegrityGateFrozenRunReplay.test.ts (which replays the
// real external investigation copy when present, and skips otherwise),
// this file's fixtures live inside this repository
// (tests/fixtures/v123-batch4/{frozen-run,corrected-run}/) and never depend
// on that external directory existing. See each fixture's README.md for
// provenance. Fixture files are read-only inputs here -- every mutation
// happens in a disposable temp directory built around a copy of their
// contents; a hash check at the end of each test proves the fixture files
// themselves were never touched.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { createRun, RunMetadata } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { fillRequiredSections } from './readyContextTestHelpers';
import { evaluateContextReadiness } from '../src/instructions/contextReadiness';
import { STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS } from '../src/instructions/stageRepositoryEvidenceRequirements';
import { SupplementalContextDocumentKind } from '../src/instructions/supplementalContextTypes';
import { evaluateRunIntegrityGate, isRunIntegrityBlockedArtifactFile } from '../src/runIntegrityGate';
import { evaluateJudgeIntegrity, evaluateFinalReportEligibility } from '../src/judgeIntegrity';
import { getNextStageWithRunIntegrity } from '../src/stageDetector';
import { readArtifactStateFile } from '../src/artifactLifecycle';
import { generateStagePrompt } from '../src/promptGenerator';

const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'v123-batch4');

type FixtureKind = 'frozen-run' | 'corrected-run';

function fixtureFiles(kind: FixtureKind): string[] {
  const dir = path.join(FIXTURE_ROOT, kind);
  return fs
    .readdirSync(dir)
    .filter((f) => f !== 'README.md')
    .map((f) => path.join(dir, f));
}

function sha256File(p: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function snapshotHashes(kind: FixtureKind): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const f of fixtureFiles(kind)) hashes[f] = sha256File(f);
  return hashes;
}

function expectFixtureUnchanged(kind: FixtureKind, before: Record<string, string>): void {
  expect(snapshotHashes(kind)).toEqual(before);
}

const implRequirement = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find((r) => r.stageId === 'stage.feature.implementation')!;
const testRequirement = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find((r) => r.stageId === 'stage.feature.test-implementation')!;

interface FixtureReplay {
  tmp: string;
  meta: RunMetadata;
}

// Builds a real, disposable run around a copy of the named fixture's raw
// capsule/audit evidence and judge/final-report content. Never reads or
// writes the fixture directory itself after the initial read.
function buildRunFromFixture(kind: FixtureKind): FixtureReplay {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `mdko-batch4-${kind}-`));
  initWorkspace(tmp);
  const meta = createRun({ request: `batch4 ${kind} replay`, mode: 'feature', projectRoot: tmp });

  const fixtureDir = path.join(FIXTURE_ROOT, kind);
  const rawDir = path.join(meta.runFolder, 'raw-evidence');
  fs.mkdirSync(rawDir, { recursive: true });

  const indexPath = path.join(meta.runFolder, 'fixture-index').split(path.sep).join('/');
  for (const name of ['implementation-capsule.json', 'implementation-audit.json', 'test-capsule.json', 'test-audit.json']) {
    const text = fs.readFileSync(path.join(fixtureDir, name), 'utf8').split('<FIXTURE_INDEX>').join(indexPath);
    fs.writeFileSync(path.join(rawDir, name), text, 'utf8');
  }

  const declaredMappingsTruncated = kind === 'frozen-run' ? 'no' : 'no';

  for (const [kindKey, packetRel, reportRel] of [
    ['implementation', 'artifacts/implementation-context-packet.txt', 'reports/implementation-context-retrieval-report.txt'],
    ['test', 'artifacts/test-context-packet.txt', 'reports/test-context-retrieval-report.txt'],
  ] as const) {
    const capsulePath = path.join(rawDir, `${kindKey}-capsule.json`);
    const auditPath = path.join(rawDir, `${kindKey}-audit.json`);
    const packetKind: SupplementalContextDocumentKind = kindKey === 'implementation' ? 'implementation-context-packet' : 'test-context-packet';
    for (const rel of [packetRel, reportRel]) {
      const p = path.join(meta.runFolder, rel);
      let text = fs
        .readFileSync(p, 'utf8')
        .replace('Status: template', 'Status: populated')
        .replace('Source context capsule: unknown', `Source context capsule: ${capsulePath}`)
        .replace('Source retrieval audit: unknown', `Source retrieval audit: ${auditPath}`);
      if (kindKey === 'test') {
        text = text.replace('Responsibility mappings truncated: unknown', `Responsibility mappings truncated: ${declaredMappingsTruncated}`);
      }
      if (rel === packetRel) text = fillRequiredSections(text, packetKind);
      fs.writeFileSync(p, text, 'utf8');
    }
  }

  const responsibilityId = kind === 'frozen-run' ? 'TST-FROZEN-001' : 'TST-CORRECTED-001';

  // Every prior-stage artifact, written in stage order (earliest first) so
  // no downstream artifact's mtime predates an upstream one -- otherwise
  // resolveArtifactState's staleness check would misfire on this fixture
  // construction itself, unrelated to the behavior under test. Simulates a
  // run that otherwise looks complete -- the exact "artifact presence must
  // not bypass readiness" scenario Batches 2-3 close.
  const judgeIndex = meta.stages.findIndex((s) => s.name === 'judge');
  for (const s of meta.stages.slice(0, judgeIndex)) {
    const p = path.join(meta.runFolder, s.artifactFile);
    if (s.name === 'test-strategy') {
      fs.writeFileSync(
        p,
        `\ntest responsibility ID: ${responsibilityId}\ncriticality: critical\ntraces to: x\nsetup: x\naction or trigger: x\nexpected result: x\ntest level: unit\n`,
        'utf8',
      );
    } else if (!fs.existsSync(p)) {
      fs.writeFileSync(p, 'done', 'utf8');
    }
  }

  // Written via read+writeFileSync (not copyFileSync) so the destination
  // gets a fresh current-time mtime -- copyFileSync preserves the source
  // fixture file's own (old) mtime on some platforms, which would
  // incorrectly make this artifact "stale" relative to the just-written
  // upstream artifacts above.
  fs.writeFileSync(
    path.join(meta.runFolder, 'artifacts', 'judge-report.txt'),
    fs.readFileSync(path.join(fixtureDir, 'judge-report.txt'), 'utf8'),
    'utf8',
  );
  const finalReportFixture = path.join(fixtureDir, 'final-report.txt');
  if (fs.existsSync(finalReportFixture)) {
    fs.writeFileSync(
      path.join(meta.runFolder, 'artifacts', 'final-report.txt'),
      fs.readFileSync(finalReportFixture, 'utf8'),
      'utf8',
    );
  }

  return { tmp, meta };
}

describe('v1.2.3 Batch 4: frozen-negative fixture replay', () => {
  it('fixture files are unchanged before use (sanity)', () => {
    const before = snapshotHashes('frozen-run');
    expectFixtureUnchanged('frozen-run', before);
  });

  it('reproduces the original defect and rejects it end to end', () => {
    const before = snapshotHashes('frozen-run');
    const { tmp, meta } = buildRunFromFixture('frozen-run');
    try {
      const implResult = evaluateContextReadiness({
        requirement: implRequirement,
        stageId: implRequirement.stageId,
        runFolder: meta.runFolder,
        mode: 'feature',
      });
      expect(implResult.decision).toBe('refresh-required');
      expect(implResult.classification).toBe('inadequate');
      expect(implResult.blockingIssueCodes).toContain('CONTEXT_ADEQUACY_INSUFFICIENT');

      const testResult = evaluateContextReadiness({
        requirement: testRequirement,
        stageId: testRequirement.stageId,
        runFolder: meta.runFolder,
        mode: 'feature',
      });
      expect(testResult.decision).toBe('refresh-required');
      expect(testResult.classification).toBe('responsibility-mappings-truncated');
      expect(testResult.blockingIssueCodes).toContain('CONTEXT_SOURCE_SUMMARY_MISMATCH');

      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: meta.projectRoot,
      });
      expect(gate.contextReady).toBe(false);
      expect([...gate.blockedStageNames].sort()).toEqual(['implementation', 'test-implementation']);
      expect(gate.expectedJudgeVerdict).toBe('NEED_CONTEXT');

      const judgeIntegrity = evaluateJudgeIntegrity({ gate, runFolder: meta.runFolder, mode: meta.mode });
      expect(judgeIntegrity.authoredJudgeVerdict).toBe('PASS');
      expect(judgeIntegrity.judgeVerdictAccepted).toBe(false);
      expect(judgeIntegrity.blockingCodes).toContain('JUDGE_VERDICT_CONTRADICTS_RUN_INTEGRITY');
      expect(judgeIntegrity.acceptedCorrectionStage).toBe('implementation');

      const stateFile = readArtifactStateFile(meta.runFolder);
      const eligibility = evaluateFinalReportEligibility({
        gate,
        judgeIntegrity,
        runFolder: meta.runFolder,
        stages: meta.stages,
        stateFile,
      });
      expect(eligibility.eligible).toBe(false);
      expect(isRunIntegrityBlockedArtifactFile(gate, meta.stages, 'artifacts/final-report.txt', eligibility.eligible)).toBe(true);

      const next = getNextStageWithRunIntegrity(meta, stateFile, gate, eligibility.eligible);
      expect(next?.name).toBe('implementation');

      const finalPrompt = generateStagePrompt(meta, 'final-report');
      expect(finalPrompt).toContain('Final-report generation is BLOCKED');
      expect(finalPrompt).not.toContain('Required output artifact: FinalReport');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    expectFixtureUnchanged('frozen-run', before);
  });
});

describe('v1.2.3 Batch 4: corrected-positive fixture replay', () => {
  it('fixture files are unchanged before use (sanity)', () => {
    const before = snapshotHashes('corrected-run');
    expectFixtureUnchanged('corrected-run', before);
  });

  it('accepts the corrected evidence and reaches final-report eligibility end to end', () => {
    const before = snapshotHashes('corrected-run');
    const { tmp, meta } = buildRunFromFixture('corrected-run');
    try {
      const implResult = evaluateContextReadiness({
        requirement: implRequirement,
        stageId: implRequirement.stageId,
        runFolder: meta.runFolder,
        mode: 'feature',
      });
      expect(implResult.decision).toBe('ready');
      expect(implResult.evaluatedAdequacy).toBe('sufficient');
      // The additive v1.10.4 roleConditionCoverage field parsed and its
      // retained witnesses were recognized -- optional-only truncation
      // alone did not block (Batch 1).
      expect(implResult.requiredEvidenceTruncated).toBe('no');

      const testResult = evaluateContextReadiness({
        requirement: testRequirement,
        stageId: testRequirement.stageId,
        runFolder: meta.runFolder,
        mode: 'feature',
      });
      expect(testResult.decision).toBe('ready');
      expect(testResult.criticalResponsibilitySummary?.criticalMapped).toBe(1);

      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: meta.projectRoot,
      });
      expect(gate.contextReady).toBe(true);
      expect(gate.blockedStageNames).toEqual([]);
      expect(gate.blockingCodes).toEqual([]);
      expect(gate.expectedJudgeVerdict).toBe('PASS');

      const judgeIntegrity = evaluateJudgeIntegrity({ gate, runFolder: meta.runFolder, mode: meta.mode });
      expect(judgeIntegrity.authoredJudgeVerdict).toBe('PASS');
      expect(judgeIntegrity.judgeVerdictMatchesExpected).toBe(true);
      expect(judgeIntegrity.judgeVerdictAccepted).toBe(true);
      expect(judgeIntegrity.correctionRequired).toBe(false);
      expect(judgeIntegrity.correctionBlocked).toBe(false);
      expect(judgeIntegrity.acceptedCorrectionStage).toBeNull();

      const stateFile = readArtifactStateFile(meta.runFolder);
      const eligibility = evaluateFinalReportEligibility({
        gate,
        judgeIntegrity,
        runFolder: meta.runFolder,
        stages: meta.stages,
        stateFile,
      });
      expect(eligibility.priorArtifactsValid).toBe(true);
      expect(eligibility.eligible).toBe(true);

      const next = getNextStageWithRunIntegrity(meta, stateFile, gate, eligibility.eligible);
      expect(next?.name).toBe('final-report');

      const finalPrompt = generateStagePrompt(meta, 'final-report');
      expect(finalPrompt).not.toContain('Final-report generation is BLOCKED');
      expect(finalPrompt).toContain('Required output artifact: FinalReport');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    expectFixtureUnchanged('corrected-run', before);
  });
});
