// Run-level Semantic Continuity enforcement (v1.5.0 Batch 4): RunIntegrityGate
// projection, lifecycle/stage progression, manual mark, JudgeIntegrity and
// final-report eligibility, all through the existing canonical owners. This
// file owns only "does activated semantic continuity change the canonical
// gate decisions correctly"; continuity state policy itself is Batch 3's.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRun, loadRun, RunMetadata } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { readArtifactStateFile, getArtifactStatePath, setArtifactManualState } from '../src/artifactLifecycle';
import {
  evaluateRunIntegrityGate,
  evaluateStageRunIntegrity,
  isRunIntegrityBlockedArtifactFile,
  resolveArtifactStateWithRunIntegrity,
  RUN_INTEGRITY_GATE_SCHEMA_VERSION,
} from '../src/runIntegrityGate';
import { evaluateJudgeIntegrity, evaluateFinalReportEligibility } from '../src/judgeIntegrity';
import { getNextStageWithRunIntegrity, resolveGateCurrentStage } from '../src/stageDetector';
import { runCli } from './cliTestHelpers';
import {
  gateAt,
  goodMapping,
  implBlock,
  makeSemanticRun,
  strategyBlock,
  testBlock,
  verBlock,
  writePriorArtifacts,
} from './semanticRunTestHelpers';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-semantic-integrity-'));
}

function withRun<T>(opts: Parameters<typeof makeSemanticRun>[1], fn: (meta: RunMetadata, tmp: string) => T): T {
  const tmp = makeTempDir();
  try {
    return fn(makeSemanticRun(tmp, opts), tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const NONCRITICAL = strategyBlock('RSP-001', { criticality: 'noncritical' });

function blockContextKind(meta: RunMetadata, kind: 'implementation' | 'test'): void {
  const files =
    kind === 'implementation'
      ? ['artifacts/implementation-context-packet.txt', 'reports/implementation-context-retrieval-report.txt']
      : ['artifacts/test-context-packet.txt', 'reports/test-context-retrieval-report.txt'];
  for (const rel of files) {
    const p = path.join(meta.runFolder, rel);
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('Status: populated', 'Status: template'), 'utf8');
  }
}

// ─── Activation and legacy compatibility ────────────────────────────────────

describe('activation and legacy compatibility', () => {
  it('keeps ordinary run creation unactivated (no semanticContinuityVersion in run.json)', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'ordinary run', mode: 'feature', projectRoot: tmp });
      expect(meta.semanticContinuityVersion).toBeUndefined();
      const persisted = JSON.parse(fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8'));
      expect('semanticContinuityVersion' in persisted).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('persists explicit activation and reloads it', () => {
    withRun({}, (meta) => {
      const persisted = JSON.parse(fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8'));
      expect(persisted.semanticContinuityVersion).toBe('1.0.0');
      expect(loadRun(meta.runFolder).semanticContinuityVersion).toBe('1.0.0');
    });
  });

  it('legacy run (no version): semantic not required and every gate decision is context-only', () => {
    withRun({ version: null, ver: null }, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(gate.schemaVersion).toBe(RUN_INTEGRITY_GATE_SCHEMA_VERSION);
      expect(gate.semanticContinuityRequired).toBe(false);
      expect(gate.semanticContinuityClassification).toBe('not-required');
      expect(gate.semanticContinuityReady).toBe(true);
      expect(gate.semanticContinuity).toBeUndefined();
      expect(gate.semanticContinuityBlockingCodes).toEqual([]);
      expect(gate.semanticBlockedStageNames).toEqual([]);
      expect(gate.runIntegrityReady).toBe(gate.contextReady);
      expect(gate.expectedJudgeVerdict).toBe('PASS');
      expect(gate.primaryBlockingCode).toBeUndefined();
      expect(resolveGateCurrentStage(meta, readArtifactStateFile(meta.runFolder))).toBe(meta.currentStage);
    });
  });

  it('proof-only and greenfield stay not-required even when a version is present', () => {
    withRun({ proofOnly: true }, (meta) => {
      expect(gateAt(meta, 'judge').semanticContinuityClassification).toBe('not-required');
    });
    withRun({ mode: 'greenfield', strategy: null, impl: null, test: null, ver: null, upstream: null }, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticContinuityClassification).toBe('not-required');
      expect(gate.semanticContinuityRequired).toBe(false);
    });
  });

  it('unsupported version fails closed with no guessed correction stage', () => {
    withRun({ version: '9.9.9' }, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticContinuityClassification).toBe('blocked');
      expect(gate.semanticContinuityReady).toBe(false);
      expect(gate.semanticContinuityBlockingCodes).toEqual(['SEMANTIC_CONTINUITY_CONTRACT_VERSION_UNSUPPORTED']);
      expect(gate.semanticRecommendedCorrectionStage).toBeNull();
      expect(gate.recommendedCorrectionStage).toBeNull();
      expect(gate.expectedJudgeVerdict).toBe('NEED_CONTEXT');
      expect(gate.runIntegrityReady).toBe(false);
      expect(gate.primaryBlockingCode).toBe('SEMANTIC_CONTINUITY_CONTRACT_VERSION_UNSUPPORTED');
      expect(gate.semanticBlockedStageNames).toEqual(['judge']);
    });
  });
});

// ─── Gate classification ────────────────────────────────────────────────────

describe('gate classification', () => {
  it('pending before the strategy stage has been passed is ready', () => {
    withRun({ impl: null, test: null, ver: null }, (meta) => {
      const gate = gateAt(meta, 'test-strategy');
      expect(gate.semanticContinuityRequired).toBe(true);
      expect(gate.semanticContinuityClassification).toBe('ready');
      expect(gate.semanticContinuityReady).toBe(true);
      expect(gate.semanticContinuity?.state).toBe('pending');
      expect(gate.expectedJudgeVerdict).toBe('PASS');
    });
  });

  it('complete continuity is ready', () => {
    withRun({}, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticContinuityClassification).toBe('ready');
      expect(gate.runIntegrityReady).toBe(true);
      expect(gate.semanticContinuityBlockers).toEqual([]);
    });
  });

  it('critical implementation gap at test-implementation blocks that stage and corrects implementation', () => {
    withRun({ impl: null }, (meta) => {
      writePriorArtifacts(meta, 'test-implementation');
      const gate = gateAt(meta, 'test-implementation');
      expect(gate.semanticContinuityClassification).toBe('blocked');
      expect(gate.semanticContinuityBlockingCodes).toEqual(['SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED']);
      expect(gate.semanticContinuityBlockingResponsibilityIds).toEqual(['RSP-001']);
      expect(gate.semanticBlockedStageNames).toEqual(['test-implementation']);
      expect(gate.semanticRecommendedCorrectionStage).toBe('implementation');
      expect(gate.recommendedCorrectionStage).toBe('implementation');
      expect(gate.expectedJudgeVerdict).toBe('NEED_CONTEXT');
      expect(gate.primarySemanticBlocker).toMatchObject({
        primaryCode: 'SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED',
        responsibilityId: 'RSP-001',
        responsibilityState: 'incomplete',
        leg: 'implementation',
        recommendedCorrectionStage: 'implementation',
      });
      expect(gate.primaryBlockingCode).toBe('SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED');
    });
  });

  it('critical test gap at verification blocks verification and corrects test-implementation', () => {
    withRun({ test: null }, (meta) => {
      writePriorArtifacts(meta, 'verification');
      const gate = gateAt(meta, 'verification');
      expect(gate.semanticBlockedStageNames).toEqual(['verification']);
      expect(gate.semanticRecommendedCorrectionStage).toBe('test-implementation');
      expect(gate.expectedJudgeVerdict).toBe('NEED_CONTEXT');
    });
  });

  it('critical verification gap at judge blocks judge and corrects verification', () => {
    withRun({ ver: null }, (meta) => {
      writePriorArtifacts(meta, 'judge');
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticBlockedStageNames).toEqual(['judge']);
      expect(gate.semanticRecommendedCorrectionStage).toBe('verification');
    });
  });

  it('strategy gap at implementation blocks implementation and corrects the mode-owned strategy stage', () => {
    withRun({ upstream: 'REQ-001: only one\n' }, (meta) => {
      const gate = gateAt(meta, 'implementation');
      expect(gate.semanticBlockedStageNames).toEqual(['implementation']);
      expect(gate.semanticRecommendedCorrectionStage).toBe('test-strategy');
      expect(gate.primarySemanticBlocker?.leg).toBe('strategy');
      expect(gate.primarySemanticBlocker?.sourceIssueCode).toBe('SEMANTIC_CONTINUITY_UPSTREAM_TRACE_MISSING');
    });
    withRun({ mode: 'repair', upstream: 'REQ-001: only one\n' }, (meta) => {
      expect(gateAt(meta, 'implementation').semanticRecommendedCorrectionStage).toBe('regression-test-strategy');
    });
  });

  it('noncritical gap only warns: ready, PASS expected, nothing blocked', () => {
    withRun({ strategy: NONCRITICAL, ver: null }, (meta) => {
      writePriorArtifacts(meta, 'judge');
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticContinuityClassification).toBe('warning');
      expect(gate.semanticContinuityReady).toBe(true);
      expect(gate.runIntegrityReady).toBe(true);
      expect(gate.expectedJudgeVerdict).toBe('PASS');
      expect(gate.semanticContinuityWarningCodes).toEqual(['SEMANTIC_CONTINUITY_NONCRITICAL_RESPONSIBILITY_UNSATISFIED']);
      expect(gate.semanticContinuityWarningResponsibilityIds).toEqual(['RSP-001']);
      expect(gate.semanticContinuityBlockingCodes).toEqual([]);
      expect(gate.semanticBlockedStageNames).toEqual([]);
      expect(gate.semanticRecommendedCorrectionStage).toBeNull();
    });
  });

  it('noncritical attributable invalidity is warning-only', () => {
    withRun({ strategy: NONCRITICAL, upstream: 'REQ-001: only one\n' }, (meta) => {
      const gate = gateAt(meta, 'implementation');
      expect(gate.semanticContinuity?.state).toBe('invalid');
      expect(gate.semanticContinuityClassification).toBe('warning');
      expect(gate.semanticContinuityReady).toBe(true);
    });
  });

  it('diagnostic-only verification inconsistency warns without blocking a critical responsibility', () => {
    withRun({ ver: verBlock('RSP-001', 'pass', '3') }, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticContinuityClassification).toBe('warning');
      expect(gate.semanticContinuityWarningCodes).toContain('VERIFICATION_RESPONSIBILITY_STATUS_EVIDENCE_INCONSISTENT');
      expect(gate.semanticContinuityBlockingCodes).toEqual([]);
      expect(gate.expectedJudgeVerdict).toBe('PASS');
    });
  });

  it('an unclassified responsibility blocks', () => {
    withRun({ strategy: strategyBlock('RSP-001', { criticality: '' }) }, (meta) => {
      const gate = gateAt(meta, 'implementation');
      expect(gate.semanticContinuityBlockingCodes).toContain('SEMANTIC_CONTINUITY_UNCLASSIFIED_RESPONSIBILITY');
      expect(gate.semanticContinuityClassification).toBe('blocked');
      expect(gate.semanticContinuityReady).toBe(false);
    });
  });

  it('a global orphan declaration blocks and keeps the source issue code', () => {
    withRun({ impl: `${implBlock('RSP-001')}${implBlock('RSP-999')}` }, (meta) => {
      const gate = gateAt(meta, 'test-implementation');
      expect(gate.semanticContinuityBlockingCodes).toContain('SEMANTIC_CONTINUITY_GLOBAL_INTEGRITY_INVALID');
      const orphan = gate.semanticContinuityBlockers.find((b) => b.sourceIssueCode === 'IMPLEMENTATION_RESPONSIBILITY_ORPHAN');
      expect(orphan).toMatchObject({ primaryCode: 'SEMANTIC_CONTINUITY_GLOBAL_INTEGRITY_INVALID', responsibilityId: 'RSP-999', leg: 'implementation' });
      expect(gate.semanticRecommendedCorrectionStage).toBe('implementation');
    });
  });

  it('an empty active strategy is a global blocker corrected at the strategy stage', () => {
    withRun({ strategy: 'No responsibilities were declared.' }, (meta) => {
      const gate = gateAt(meta, 'implementation');
      expect(gate.semanticContinuityBlockingCodes).toEqual(['SEMANTIC_CONTINUITY_GLOBAL_INTEGRITY_INVALID']);
      expect(gate.primarySemanticBlocker?.sourceIssueCode).toBe('SEMANTIC_CONTINUITY_RESPONSIBILITIES_MISSING');
      expect(gate.semanticRecommendedCorrectionStage).toBe('test-strategy');
    });
  });

  it('test mode never requires production implementation continuity', () => {
    withRun({ mode: 'test', impl: null }, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticContinuityClassification).toBe('ready');
      expect(gate.semanticContinuity?.implementationApplicable).toBe(false);
    });
  });

  it('chooses the earliest broken owner stage, then canonical responsibility order', () => {
    const two = `${strategyBlock('RSP-002')}${strategyBlock('RSP-001')}`;
    const mappings = [goodMapping('RSP-001'), goodMapping('RSP-002')];
    withRun({ strategy: two, mappings, impl: null, ver: null, test: `${testBlock('RSP-001')}${testBlock('RSP-002')}` }, (meta) => {
      writePriorArtifacts(meta, 'judge');
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticRecommendedCorrectionStage).toBe('implementation');
      expect(gate.primarySemanticBlocker?.responsibilityId).toBe('RSP-002');
      expect(gate.semanticContinuityBlockingResponsibilityIds).toEqual(['RSP-002', 'RSP-001']);
      expect(gate.semanticContinuityBlockers.map((b) => b.recommendedCorrectionStage)).toEqual([
        'implementation',
        'implementation',
      ]);
    });
  });
});

// ─── Context precedence ─────────────────────────────────────────────────────

describe('context versus semantic blockers', () => {
  it('context blocker keeps primary precedence; semantic blockers stay visible', () => {
    // Semantic earliest owner is implementation (missing declaration) while the
    // context blocker recommends test-implementation: the context one wins.
    withRun({ impl: null }, (meta) => {
      writePriorArtifacts(meta, 'judge');
      blockContextKind(meta, 'test');
      const gate = gateAt(meta, 'judge');
      expect(gate.contextReady).toBe(false);
      expect(gate.semanticContinuityClassification).toBe('blocked');
      expect(gate.semanticRecommendedCorrectionStage).toBe('implementation');
      expect(gate.primaryBlockingCode).toBe(gate.primaryBlocker?.primaryCode);
      expect(gate.primaryBlockingReason).toBe(gate.primaryBlocker?.primaryReason);
      expect(gate.primarySemanticBlocker?.primaryCode).toBe('SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED');
      expect(gate.recommendedCorrectionStage).toBe('test-implementation');
      expect(gate.semanticContinuityBlockingCodes).toContain('SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED');
      expect(gate.runIntegrityReady).toBe(false);
    });
  });

  it('context fields keep meaning repository-context readiness only', () => {
    withRun({ ver: null }, (meta) => {
      writePriorArtifacts(meta, 'judge');
      const gate = gateAt(meta, 'judge');
      expect(gate.contextReady).toBe(true);
      expect(gate.readinessClassification).toBe('ready');
      expect(gate.blockedStageNames).toEqual([]);
      expect(gate.runIntegrityReady).toBe(false);
    });
  });
});

// ─── Correction-phase safety ────────────────────────────────────────────────

describe('correction-phase safety', () => {
  const downstreamDefects = {
    test: `${testBlock('RSP-001', '../escape.ts')}${testBlock('RSP-999')}`,
    ver: 'verification responsibility ID: RSP-001\nverification status: nope\n',
  };

  it('downstream defects are inactive at implementation and active at judge', () => {
    withRun(downstreamDefects, (meta) => {
      const early = gateAt(meta, 'implementation');
      expect(early.semanticContinuityClassification).toBe('ready');
      expect(early.semanticContinuityBlockingCodes).toEqual([]);
      expect(early.semanticBlockedStageNames).toEqual([]);
      expect(early.expectedJudgeVerdict).toBe('PASS');

      const late = gateAt(meta, 'judge');
      expect(late.semanticContinuityClassification).toBe('blocked');
      expect(late.semanticBlockedStageNames).toEqual(['judge']);
      expect(late.expectedJudgeVerdict).toBe('NEED_CONTEXT');
    });
  });

  it('a correction stage can still render/complete while the phase stage is blocked', () => {
    withRun({ ver: null }, (meta) => {
      writePriorArtifacts(meta, 'judge');
      const gate = gateAt(meta, 'judge');
      expect(evaluateStageRunIntegrity(gate, 'judge')).toMatchObject({
        semanticBlocked: true,
        contextBlocked: false,
        blocked: true,
        stageMayRenderNormalPrompt: false,
        stageMayCreateOrAcceptCompletionArtifact: false,
        stageMayMarkComplete: false,
        stageMayAdvance: false,
      });
      expect(evaluateStageRunIntegrity(gate, 'verification')).toMatchObject({ semanticBlocked: false, blocked: false, stageMayMarkComplete: true });
      expect(evaluateStageRunIntegrity(gate, 'implementation').blocked).toBe(false);
    });
  });

  it('opted-in commands evaluate at the lifecycle phase, not a correction cursor', () => {
    withRun({ ver: null }, (meta) => {
      writePriorArtifacts(meta, 'judge');
      const stateFile = readArtifactStateFile(meta.runFolder);
      const persisted = { ...meta, currentStage: 'implementation' };
      expect(resolveGateCurrentStage(persisted, stateFile)).toBe('judge');
      const legacy = { ...persisted, semanticContinuityVersion: undefined };
      expect(resolveGateCurrentStage(legacy, stateFile)).toBe('implementation');
    });
  });
});

// ─── Lifecycle ──────────────────────────────────────────────────────────────

describe('lifecycle integration', () => {
  it('a semantic-blocked artifact resolves blocked even when it exists and is manually complete', () => {
    withRun({ impl: null }, (meta) => {
      writePriorArtifacts(meta, 'test-implementation');
      const stateFile0 = readArtifactStateFile(meta.runFolder);
      setArtifactManualState(meta.runFolder, 'artifacts/test-implementation-report.txt', 'complete', {});
      const stateFile = readArtifactStateFile(meta.runFolder);
      expect(stateFile0).toBeDefined();
      const gate = gateAt(meta, 'test-implementation');

      expect(fs.existsSync(path.join(meta.runFolder, 'artifacts/test-implementation-report.txt'))).toBe(true);
      expect(
        resolveArtifactStateWithRunIntegrity(meta.runFolder, 'artifacts/test-implementation-report.txt', meta.stages, stateFile, gate),
      ).toBe('blocked');
      expect(isRunIntegrityBlockedArtifactFile(gate, meta.stages, 'artifacts/test-implementation-report.txt')).toBe(true);
      // The correction target is not itself force-blocked.
      expect(isRunIntegrityBlockedArtifactFile(gate, meta.stages, 'artifacts/implementation-report.txt')).toBe(false);
      expect(
        resolveArtifactStateWithRunIntegrity(meta.runFolder, 'artifacts/implementation-report.txt', meta.stages, stateFile, gate),
      ).not.toBe('blocked');
    });
  });

  it('stage progression stops at the semantic-blocked current stage', () => {
    withRun({ impl: null }, (meta) => {
      writePriorArtifacts(meta, 'test-implementation');
      const gate = gateAt(meta, 'test-implementation');
      const next = getNextStageWithRunIntegrity(meta, readArtifactStateFile(meta.runFolder), gate);
      expect(next?.name).toBe('test-implementation');
    });
  });

  it('a noncritical warning does not block lifecycle', () => {
    withRun({ strategy: NONCRITICAL, impl: null }, (meta) => {
      writePriorArtifacts(meta, 'test-implementation');
      const gate = gateAt(meta, 'test-implementation');
      expect(gate.semanticContinuityClassification).toBe('warning');
      expect(isRunIntegrityBlockedArtifactFile(gate, meta.stages, 'artifacts/test-implementation-report.txt')).toBe(false);
      expect(
        resolveArtifactStateWithRunIntegrity(meta.runFolder, 'artifacts/test-implementation-report.txt', meta.stages, readArtifactStateFile(meta.runFolder), gate),
      ).toBe('complete');
    });
  });
});

// ─── Manual mark ────────────────────────────────────────────────────────────

describe('manual mark integration', () => {
  it('rejects completion of a semantic-blocked stage artifact without mutating artifact-state.json', () => {
    withRun({ impl: null }, (meta, tmp) => {
      writePriorArtifacts(meta, 'test-implementation');
      const statePath = getArtifactStatePath(meta.runFolder);
      const before = fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf8') : null;
      const { exitCode, output } = runCli(['mark', 'test-implementation-report.txt', '--state', 'complete', '--root', tmp]);
      expect(exitCode).toBe(1);
      expect(output).toContain('semantic continuity is not satisfied');
      expect(output).toContain('SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED');
      expect(output).not.toContain('repository context is refresh-required');
      const after = fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf8') : null;
      expect(after).toBe(before);
    });
  });

  it('does not reject completion for a warning-only semantic gap', () => {
    withRun({ strategy: NONCRITICAL, impl: null }, (meta, tmp) => {
      writePriorArtifacts(meta, 'test-implementation');
      const { exitCode } = runCli(['mark', 'test-implementation-report.txt', '--state', 'complete', '--root', tmp]);
      expect(exitCode).toBeUndefined();
    });
  });

  it('preserves the context-specific message when context is the actual blocker', () => {
    withRun({}, (meta, tmp) => {
      writePriorArtifacts(meta, 'implementation');
      blockContextKind(meta, 'implementation');
      const { exitCode, output } = runCli(['mark', 'implementation-report.txt', '--state', 'complete', '--root', tmp]);
      expect(exitCode).toBe(1);
      expect(output).toContain('repository context is refresh-required');
    });
  });
});

// ─── JudgeIntegrity and final report ────────────────────────────────────────

function judge(meta: RunMetadata, currentStage: string, verdict = 'PASS') {
  fs.writeFileSync(path.join(meta.runFolder, 'artifacts', 'judge-report.txt'), `Verdict: ${verdict}`, 'utf8');
  const gate = gateAt(meta, currentStage);
  const judgeIntegrity = evaluateJudgeIntegrity({ gate, runFolder: meta.runFolder, mode: meta.mode });
  const eligibility = evaluateFinalReportEligibility({
    gate,
    judgeIntegrity,
    runFolder: meta.runFolder,
    stages: meta.stages,
    stateFile: readArtifactStateFile(meta.runFolder),
    proofOnly: meta.proofOnly === true,
    verificationResponsibility: meta.verificationResponsibility,
  });
  return { gate, judgeIntegrity, eligibility };
}

describe('JudgeIntegrity and final-report eligibility', () => {
  it('rejects an authored PASS against a critical semantic blocker and routes to the semantic correction stage', () => {
    withRun({ ver: null }, (meta) => {
      writePriorArtifacts(meta, 'final-report');
      const { judgeIntegrity, eligibility } = judge(meta, 'final-report');
      expect(judgeIntegrity.expectedJudgeVerdict).toBe('NEED_CONTEXT');
      expect(judgeIntegrity.authoredJudgeVerdict).toBe('PASS');
      expect(judgeIntegrity.judgeVerdictAccepted).toBe(false);
      expect(judgeIntegrity.finalReportEligible).toBe(false);
      expect(judgeIntegrity.acceptedCorrectionStage).toBe('verification');
      expect(eligibility.eligible).toBe(false);
    });
  });

  it('accepts an authored PASS with only a noncritical semantic warning; final report stays eligible', () => {
    withRun({ strategy: NONCRITICAL, ver: null }, (meta) => {
      writePriorArtifacts(meta, 'final-report');
      const { gate, judgeIntegrity, eligibility } = judge(meta, 'final-report');
      expect(gate.semanticContinuityClassification).toBe('warning');
      expect(judgeIntegrity.expectedJudgeVerdict).toBe('PASS');
      expect(judgeIntegrity.judgeVerdictAccepted).toBe(true);
      expect(eligibility.eligible).toBe(true);
    });
  });

  it('a fully complete activated run is final-report eligible', () => {
    withRun({}, (meta) => {
      writePriorArtifacts(meta, 'final-report');
      expect(judge(meta, 'final-report').eligibility.eligible).toBe(true);
    });
  });

  it('context recommendation wins when both context and semantic block', () => {
    withRun({ ver: null }, (meta) => {
      writePriorArtifacts(meta, 'final-report');
      blockContextKind(meta, 'implementation');
      const { judgeIntegrity } = judge(meta, 'final-report');
      expect(judgeIntegrity.judgeVerdictAccepted).toBe(false);
      expect(judgeIntegrity.acceptedCorrectionStage).toBe('implementation');
    });
  });

  it('rejects an authored PASS under an unsupported contract version', () => {
    withRun({ version: '3.0.0' }, (meta) => {
      writePriorArtifacts(meta, 'final-report');
      const { judgeIntegrity, eligibility } = judge(meta, 'final-report');
      expect(judgeIntegrity.judgeVerdictAccepted).toBe(false);
      expect(judgeIntegrity.acceptedCorrectionStage).toBeNull();
      expect(eligibility.eligible).toBe(false);
    });
  });

  it('does not rewrite ordinary non-PASS verdict handling', () => {
    withRun({ ver: null }, (meta) => {
      writePriorArtifacts(meta, 'final-report');
      const { judgeIntegrity } = judge(meta, 'final-report', 'IMPLEMENTATION_MISMATCH');
      expect(judgeIntegrity.judgeVerdictAccepted).toBe(true);
      expect(judgeIntegrity.acceptedCorrectionStage).toBe('implementation');
    });
  });
});

// ─── Cross-command consistency for an activated run ─────────────────────────

describe('command consistency', () => {
  it('status and check surface the same activated run without error', () => {
    withRun({}, (meta, tmp) => {
      writePriorArtifacts(meta, 'final-report');
      expect(runCli(['status', '--root', tmp]).exitCode).toBeUndefined();
      expect(() => runCli(['check', '--root', tmp])).not.toThrow();
    });
  });
});

describe('run reconciliation (loadRun)', () => {
  function completedRun(opts: Parameters<typeof makeSemanticRun>[1]) {
    return withRun(opts, (meta) => {
      writePriorArtifacts(meta, 'final-report');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts', 'judge-report.txt'), 'Verdict: PASS', 'utf8');
      writePriorArtifacts(meta, 'final-report');
      return loadRun(meta.runFolder);
    });
  }

  it('routes an activated run with a critical gap back to the semantic correction stage', () => {
    const reloaded = completedRun({ ver: verBlock('RSP-002') });
    expect(reloaded.currentStage).toBe('verification');
    expect(reloaded.status).toBe('in_progress');
  });

  it('leaves an activated complete run and an equivalent legacy run at the final stage', () => {
    expect(completedRun({}).currentStage).not.toBe('verification');
    const legacy = completedRun({ version: null, ver: verBlock('RSP-002') });
    expect(legacy.currentStage).not.toBe('verification');
  });
});
