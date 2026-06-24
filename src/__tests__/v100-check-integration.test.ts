import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  checkStageGates,
  checkRunArtifactContracts,
  resolveArtifactContractsForMode,
} from '../contractChecker';
import { readCorrectionState } from '../correctionState';
import { checkAllTraces } from '../traceChecker';
import { RunMetadata } from '../run';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-v100-test-'));
}

function writeArtifact(dir: string, relPath: string, content: string): void {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

const FEATURE_STAGES: RunMetadata['stages'] = [
  { name: 'request-brief', artifactFile: 'artifacts/request-brief.txt', promptFile: 'prompts/01-request-brief.prompt.txt' },
  { name: 'architecture-context', artifactFile: 'artifacts/architecture-context-packet.txt', promptFile: 'prompts/02-architecture-context.prompt.txt' },
  { name: 'behavior-model', artifactFile: 'artifacts/behavior-model.txt', promptFile: 'prompts/03-behavior-model.prompt.txt' },
  { name: 'pseudocode-packet', artifactFile: 'artifacts/pseudocode-packet.txt', promptFile: 'prompts/04-pseudocode-packet.prompt.txt' },
  { name: 'test-strategy', artifactFile: 'artifacts/test-strategy-packet.txt', promptFile: 'prompts/05-test-strategy.prompt.txt' },
  { name: 'implementation', artifactFile: 'artifacts/implementation-report.txt', promptFile: 'prompts/06-implementation.prompt.txt' },
  { name: 'test-implementation', artifactFile: 'artifacts/test-implementation-report.txt', promptFile: 'prompts/07-test-implementation.prompt.txt' },
  { name: 'verification', artifactFile: 'artifacts/verification-report.txt', promptFile: 'prompts/08-verification.prompt.txt' },
  { name: 'judge', artifactFile: 'artifacts/judge-report.txt', promptFile: 'prompts/09-judge.prompt.txt' },
  { name: 'final-report', artifactFile: 'artifacts/final-report.txt', promptFile: 'prompts/10-final-report.prompt.txt' },
];

function makeFeatureMeta(tmpDir: string, stageOverrides?: Partial<RunMetadata>): RunMetadata {
  return {
    runId: 'v100-test-run',
    mode: 'feature',
    request: 'v1 test request',
    runFolder: tmpDir,
    projectRoot: tmpDir,
    stages: FEATURE_STAGES,
    createdAt: new Date().toISOString(),
    currentStage: 'request-brief',
    status: 'created',
    ...stageOverrides,
  };
}

// ─── checkStageGates ──────────────────────────────────────────────────────────

describe('checkStageGates', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns no violations when no artifacts exist', () => {
    const meta = makeFeatureMeta(tmpDir);
    const violations = checkStageGates(meta);
    expect(violations).toHaveLength(0);
  });

  it('returns no violations when all artifacts are present in order', () => {
    const meta = makeFeatureMeta(tmpDir);
    writeArtifact(tmpDir, 'artifacts/request-brief.txt', 'content');
    writeArtifact(tmpDir, 'artifacts/architecture-context-packet.txt', 'content');
    writeArtifact(tmpDir, 'artifacts/behavior-model.txt', 'content');
    writeArtifact(tmpDir, 'artifacts/pseudocode-packet.txt', 'content');
    writeArtifact(tmpDir, 'artifacts/test-strategy-packet.txt', 'content');
    writeArtifact(tmpDir, 'artifacts/implementation-report.txt', 'content');
    writeArtifact(tmpDir, 'artifacts/test-implementation-report.txt', 'content');
    writeArtifact(tmpDir, 'artifacts/verification-report.txt', 'content');
    writeArtifact(tmpDir, 'artifacts/judge-report.txt', 'content');
    writeArtifact(tmpDir, 'artifacts/final-report.txt', 'content');
    const violations = checkStageGates(meta);
    expect(violations).toHaveLength(0);
  });

  it('detects Gate 1 violation: pseudocode-packet exists without behavior-model', () => {
    const meta = makeFeatureMeta(tmpDir);
    writeArtifact(tmpDir, 'artifacts/pseudocode-packet.txt', 'PSE content');
    const violations = checkStageGates(meta);
    const gate1 = violations.find((v) => v.gateName.includes('Gate 1'));
    expect(gate1).toBeDefined();
    expect(gate1?.missingArtifact).toBe('artifacts/behavior-model.txt');
    expect(gate1?.presentArtifact).toBe('artifacts/pseudocode-packet.txt');
  });

  it('detects Gate 2 violation: implementation exists without pseudocode-packet', () => {
    const meta = makeFeatureMeta(tmpDir);
    writeArtifact(tmpDir, 'artifacts/implementation-report.txt', 'IMP content');
    const violations = checkStageGates(meta);
    const gate2 = violations.find((v) => v.gateName.includes('Gate 2'));
    expect(gate2).toBeDefined();
    expect(gate2?.missingArtifact).toBe('artifacts/pseudocode-packet.txt');
  });

  it('detects Gate 3 violation: test-implementation exists without test-strategy', () => {
    const meta = makeFeatureMeta(tmpDir);
    writeArtifact(tmpDir, 'artifacts/test-implementation-report.txt', 'TST content');
    const violations = checkStageGates(meta);
    const gate3 = violations.find((v) => v.gateName.includes('Gate 3'));
    expect(gate3).toBeDefined();
    expect(gate3?.missingArtifact).toBe('artifacts/test-strategy-packet.txt');
  });

  it('detects Gate 4a violation: verification exists without implementation', () => {
    const meta = makeFeatureMeta(tmpDir);
    writeArtifact(tmpDir, 'artifacts/test-implementation-report.txt', 'content');
    writeArtifact(tmpDir, 'artifacts/verification-report.txt', 'VER content');
    const violations = checkStageGates(meta);
    const gate4a = violations.find((v) => v.gateName.includes('Gate 4a'));
    expect(gate4a).toBeDefined();
    expect(gate4a?.missingArtifact).toBe('artifacts/implementation-report.txt');
  });

  it('detects Gate 5 violation: judge exists without verification', () => {
    const meta = makeFeatureMeta(tmpDir);
    writeArtifact(tmpDir, 'artifacts/judge-report.txt', 'Verdict: PASS');
    const violations = checkStageGates(meta);
    const gate5 = violations.find((v) => v.gateName.includes('Gate 5'));
    expect(gate5).toBeDefined();
    expect(gate5?.missingArtifact).toBe('artifacts/verification-report.txt');
  });

  it('detects Gate 6 violation: final-report exists without judge', () => {
    const meta = makeFeatureMeta(tmpDir);
    writeArtifact(tmpDir, 'artifacts/verification-report.txt', 'content');
    writeArtifact(tmpDir, 'artifacts/final-report.txt', 'Final report content');
    const violations = checkStageGates(meta);
    const gate6 = violations.find((v) => v.gateName.includes('Gate 6'));
    expect(gate6).toBeDefined();
    expect(gate6?.missingArtifact).toBe('artifacts/judge-report.txt');
  });

  it('gate violations have severity fail', () => {
    const meta = makeFeatureMeta(tmpDir);
    writeArtifact(tmpDir, 'artifacts/pseudocode-packet.txt', 'PSE content');
    const violations = checkStageGates(meta);
    for (const v of violations) {
      expect(v.severity).toBe('fail');
    }
  });

  it('gate violations include suggestedFix', () => {
    const meta = makeFeatureMeta(tmpDir);
    writeArtifact(tmpDir, 'artifacts/pseudocode-packet.txt', 'PSE content');
    const violations = checkStageGates(meta);
    for (const v of violations) {
      expect(v.suggestedFix).toBeTruthy();
    }
  });

  it('skips gate pairs not present in the run stages', () => {
    // repair-specific stages not in feature run
    const meta = makeFeatureMeta(tmpDir);
    // No correction-design or divergence-report stages in feature mode
    const violations = checkStageGates(meta);
    const repairViolation = violations.find((v) =>
      v.gateName.includes('Repair gate'),
    );
    expect(repairViolation).toBeUndefined();
  });

  it('detects multiple gate violations simultaneously', () => {
    const meta = makeFeatureMeta(tmpDir);
    // implementation without pseudocode-packet (Gate 2) AND verification without test-implementation (Gate 4b)
    writeArtifact(tmpDir, 'artifacts/implementation-report.txt', 'IMP content');
    writeArtifact(tmpDir, 'artifacts/verification-report.txt', 'VER content');
    const violations = checkStageGates(meta);
    const gate2 = violations.find((v) => v.gateName.includes('Gate 2'));
    const gate4b = violations.find((v) => v.gateName.includes('Gate 4b'));
    expect(gate2).toBeDefined();
    expect(gate4b).toBeDefined();
    expect(violations.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Mode parity: resolveArtifactContractsForMode ────────────────────────────

describe('mode parity for all workflow modes', () => {
  it.each(['feature', 'repair', 'test', 'refactor', 'harden', 'extraction'])(
    'mode %s has non-empty stage list and all artifacts mapped',
    (mode) => {
      const summary = resolveArtifactContractsForMode(mode)!;
      expect(summary).not.toBeNull();
      expect(summary.stages.length).toBeGreaterThan(0);
      for (const stage of summary.stages) {
        expect(stage.artifactFile).toMatch(/^artifacts\//);
        expect(stage.artifactKind).not.toBe('Unknown');
      }
    },
  );

  it('feature mode: architecture-context has request-brief as predecessor', () => {
    const summary = resolveArtifactContractsForMode('feature')!;
    const arch = summary.stages.find((s) => s.stageName === 'architecture-context')!;
    expect(arch.predecessors).toContain('artifacts/request-brief.txt');
  });

  it('repair mode: behavior-trace has architecture-context predecessor', () => {
    const summary = resolveArtifactContractsForMode('repair')!;
    const bt = summary.stages.find((s) => s.stageName === 'behavior-trace')!;
    expect(bt.predecessors).toContain('artifacts/architecture-context-packet.txt');
  });

  it('test mode: test-implementation comes after test-strategy', () => {
    const summary = resolveArtifactContractsForMode('test')!;
    const ti = summary.stages.find((s) => s.stageName === 'test-implementation')!;
    expect(ti.predecessors).toContain('artifacts/test-strategy-packet.txt');
  });

  it('refactor mode: implementation comes after refactor-pseudocode-packet', () => {
    const summary = resolveArtifactContractsForMode('refactor')!;
    const impl = summary.stages.find((s) => s.stageName === 'implementation')!;
    expect(impl.predecessors).toContain('artifacts/refactor-pseudocode-packet.txt');
  });

  it('harden mode: implementation comes after resilience-test-strategy', () => {
    const summary = resolveArtifactContractsForMode('harden')!;
    const impl = summary.stages.find((s) => s.stageName === 'implementation')!;
    // Immediate predecessor is resilience-test-strategy; guard-pseudocode-packet is enforced by stage gate
    expect(impl.predecessors).toContain('artifacts/resilience-test-strategy.txt');
  });
});

// ─── check --all smoke: CLI output format ─────────────────────────────────────

describe('check command output labels', () => {
  it('formatContractResult includes stage and mode in output (via check --artifacts)', () => {
    // This is tested implicitly through the CLI smoke; here we verify the contract check
    // produces the right result shape for a missing artifact.
    const tmpDir = makeTempDir();
    try {
      const meta = makeFeatureMeta(tmpDir);
      const result = checkRunArtifactContracts(meta);
      const firstResult = result.results[0];
      expect(firstResult.stageName).toBe('request-brief');
      expect(firstResult.mode).toBe('feature');
      expect(firstResult.artifactKind).toBe('RequestBrief');
      // Missing artifact
      expect(firstResult.passed).toBe(false);
      expect(firstResult.issues[0].code).toBe('CONTRACT_MISSING_FILE');
      expect(firstResult.issues[0].suggestedFix).toBeDefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─── Correction routing unchanged ─────────────────────────────────────────────

describe('v0.6.0 correction routing regression', () => {
  it('readCorrectionState returns null when no judge report exists', () => {
    const tmpDir = makeTempDir();
    try {
      const result = readCorrectionState(tmpDir);
      expect(result).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('readCorrectionState returns PASS route when judge report has PASS verdict', () => {
    const tmpDir = makeTempDir();
    try {
      writeArtifact(tmpDir, 'artifacts/judge-report.txt', 'Verdict: PASS\n');
      const result = readCorrectionState(tmpDir)!;
      expect(result).not.toBeNull();
      expect(result.routeStatus).toBe('pass');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('readCorrectionState returns correction_required for IMPLEMENTATION_MISMATCH', () => {
    const tmpDir = makeTempDir();
    try {
      writeArtifact(tmpDir, 'artifacts/judge-report.txt', 'Verdict: IMPLEMENTATION_MISMATCH\n');
      const result = readCorrectionState(tmpDir)!;
      expect(result.routeStatus).toBe('correction_required');
      expect(result.routedStage).toBe('implementation');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─── Existing trace checks unchanged ─────────────────────────────────────────

describe('v0.5.0 trace checks regression', () => {
  it('checkAllTraces returns pass result for artifact with no trace IDs', () => {
    const tmpDir = makeTempDir();
    try {
      const meta = makeFeatureMeta(tmpDir);
      writeArtifact(tmpDir, 'artifacts/request-brief.txt', 'Status: complete\n');
      const results = checkAllTraces(meta);
      const rb = results.find((r: { artifactFile: string }) => r.artifactFile === 'artifacts/request-brief.txt');
      expect(rb?.passed).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('checkAllTraces detects TRACE_MISSING_LINK_TARGET', () => {
    const tmpDir = makeTempDir();
    try {
      const meta = makeFeatureMeta(tmpDir);
      writeArtifact(tmpDir, 'artifacts/behavior-model.txt', 'REQ-001: req\nREQ-001 -> BEH-999');
      const results = checkAllTraces(meta);
      const bm = results.find((r: { artifactFile: string }) => r.artifactFile === 'artifacts/behavior-model.txt');
      expect(bm?.issues.some((i: { code: string }) => i.code === 'TRACE_MISSING_LINK_TARGET')).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
