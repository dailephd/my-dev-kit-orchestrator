import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  evaluateRunSemanticContinuity,
  SEMANTIC_CONTINUITY_CONTRACT_VERSION,
} from '../src/instructions/runSemanticContinuity';
import { ContextReadinessResult } from '../src/instructions/contextReadiness';
import { evaluateRunContextReadiness } from '../src/instructions/runContextReadiness';
import { RunMetadata } from '../src/run';
import {
  goodMapping,
  implBlock,
  makeSemanticRun,
  stageNamesOf,
  strategyBlock,
  testBlock,
  verBlock,
} from './semanticRunTestHelpers';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-run-semantic-'));
}

function withRun<T>(opts: Parameters<typeof makeSemanticRun>[1], fn: (meta: RunMetadata, tmp: string) => T): T {
  const tmp = makeTempDir();
  try {
    return fn(makeSemanticRun(tmp, opts), tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Uses the real readiness results so the adapter consumes exactly what the
// gate would hand it.
function evaluate(meta: RunMetadata, currentStage: string, extra: Partial<Parameters<typeof evaluateRunSemanticContinuity>[0]> = {}) {
  const readiness = evaluateRunContextReadiness({
    mode: meta.mode,
    runFolder: meta.runFolder,
    workflowStageNames: stageNamesOf(meta.mode),
    currentStage,
    projectRoot: meta.projectRoot,
  });
  return evaluateRunSemanticContinuity({
    mode: meta.mode,
    runFolder: meta.runFolder,
    semanticContinuityVersion: meta.semanticContinuityVersion,
    proofOnly: meta.proofOnly === true,
    currentStage,
    implementationContextReadiness: readiness.implementationContext,
    testContextReadiness: readiness.testContext,
    ...extra,
  });
}

describe('activation', () => {
  it('is not required without version metadata (even when artifacts contain RSP declarations)', () => {
    withRun({ version: null }, (meta) => {
      expect(meta.semanticContinuityVersion).toBeUndefined();
      const r = evaluate(meta, 'judge');
      expect(r).toEqual({ activation: 'not-required', integrationIssues: [] });
    });
  });

  it('exposes the single supported version', () => {
    expect(SEMANTIC_CONTINUITY_CONTRACT_VERSION).toBe('1.0.0');
  });

  it('is active for the supported version and returns the Batch 3 result', () => {
    withRun({}, (meta) => {
      const r = evaluate(meta, 'judge');
      expect(r.activation).toBe('active');
      expect(r.contractVersion).toBe('1.0.0');
      expect(r.phaseStage).toBe('judge');
      expect(r.continuity?.state).toBe('complete');
      expect(r.integrationIssues).toEqual([]);
    });
  });

  it('detects an unsupported version deterministically and does not evaluate', () => {
    withRun({ version: '2.0.0' }, (meta) => {
      const r = evaluate(meta, 'judge');
      expect(r.activation).toBe('unsupported');
      expect(r.contractVersion).toBe('2.0.0');
      expect(r.continuity).toBeUndefined();
      expect(r.integrationIssues.map((i) => i.code)).toEqual(['SEMANTIC_CONTINUITY_CONTRACT_VERSION_UNSUPPORTED']);
    });
  });

  it('maps (complete) and an omitted stage to the last workflow stage', () => {
    withRun({}, (meta) => {
      expect(evaluate(meta, '(complete)').phaseStage).toBe('final-report');
      expect(evaluate(meta, 'judge', { currentStage: undefined }).phaseStage).toBe('final-report');
    });
  });
});

describe('strategy artifact ownership', () => {
  it('reads the exact mode-owned strategy artifact (repair -> regression-test-strategy)', () => {
    withRun({ mode: 'repair' }, (meta) => {
      fs.writeFileSync(
        path.join(meta.runFolder, 'artifacts/test-strategy-packet.txt'),
        strategyBlock('RSP-777'),
        'utf8',
      );
      const r = evaluate(meta, 'judge');
      expect(r.continuity?.responsibilities.map((x) => x.responsibilityId)).toEqual(['RSP-001']);
    });
  });

  it('treats an absent strategy artifact as empty input (Batch 3 classifies it)', () => {
    withRun({ strategy: null }, (meta) => {
      const r = evaluate(meta, 'implementation');
      expect(r.continuity?.state).toBe('incomplete');
      expect(r.continuity?.issues.map((i) => i.code)).toEqual(['SEMANTIC_CONTINUITY_RESPONSIBILITIES_MISSING']);
    });
  });
});

describe('upstream trace collection', () => {
  it('counts exact declarations from artifacts before the strategy stage', () => {
    withRun({}, (meta) => {
      const r = evaluate(meta, 'implementation');
      expect(r.continuity?.responsibilities[0].missingUpstreamTraceIds).toEqual([]);
    });
  });

  it('does not count link-only targets or prose mentions', () => {
    withRun({ upstream: 'REQ-001: requirement\nREQ-001 -> BEH-002\nWe also discuss BEH-002 in prose.\n' }, (meta) => {
      const r = evaluate(meta, 'implementation');
      expect(r.continuity?.responsibilities[0].missingUpstreamTraceIds).toEqual(['BEH-002']);
    });
  });

  it('does not read artifacts of the strategy stage or later', () => {
    withRun({ upstream: 'REQ-001: requirement\n' }, (meta) => {
      fs.appendFileSync(path.join(meta.runFolder, 'artifacts/test-strategy-packet.txt'), 'BEH-002: declared in strategy itself\n');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/implementation-report.txt'), 'BEH-002: later\n' + implBlock('RSP-001'));
      const r = evaluate(meta, 'judge');
      expect(r.continuity?.responsibilities[0].missingUpstreamTraceIds).toEqual(['BEH-002']);
    });
  });

  it('collects across several prior stage artifacts and tolerates duplicates', () => {
    withRun({ upstream: 'REQ-001: a\nREQ-001: duplicate\n' }, (meta) => {
      const second = meta.stages[1].artifactFile;
      fs.writeFileSync(path.join(meta.runFolder, second), 'BEH-002: second stage\nREQ-001: again\n', 'utf8');
      const r = evaluate(meta, 'implementation');
      expect(r.continuity?.responsibilities[0].missingUpstreamTraceIds).toEqual([]);
    });
  });

  it('includes additional artifact files of prior stages', () => {
    withRun({ mode: 'extraction', upstream: 'REQ-001: a\n' }, (meta) => {
      const stage = meta.stages.find((s) => (s.additionalArtifactFiles ?? []).length > 0)!;
      fs.writeFileSync(path.join(meta.runFolder, stage.additionalArtifactFiles![0]), 'BEH-002: from additional file\n', 'utf8');
      expect(evaluate(meta, 'implementation').continuity?.responsibilities[0].missingUpstreamTraceIds).toEqual([]);
    });
  });

  it('is case-sensitive', () => {
    withRun({ upstream: 'req-001: a\nBEH-002: b\n' }, (meta) => {
      expect(evaluate(meta, 'implementation').continuity?.responsibilities[0].missingUpstreamTraceIds).toEqual(['REQ-001']);
    });
  });
});

describe('evidence legs', () => {
  it('uses the accepted implementation capsule for production evidence', () => {
    withRun({}, (meta) => {
      expect(evaluate(meta, 'test-implementation').continuity?.responsibilities[0].implementationState).toBe('satisfied');
    });
    withRun({ impl: implBlock('RSP-001', 'src/other.ts') }, (meta) => {
      expect(evaluate(meta, 'test-implementation').continuity?.responsibilities[0].implementationState).toBe('unsatisfied');
    });
  });

  it('uses the accepted test capsule for test-file evidence', () => {
    withRun({}, (meta) => {
      expect(evaluate(meta, 'verification').continuity?.responsibilities[0].testImplementationState).toBe('satisfied');
    });
    withRun({ test: testBlock('RSP-001', 'tests/other.spec.ts') }, (meta) => {
      expect(evaluate(meta, 'verification').continuity?.responsibilities[0].testImplementationState).toBe('unsatisfied');
    });
  });

  it('reads verification declarations from the VerificationReport', () => {
    withRun({ ver: verBlock('RSP-001', 'fail', '1') }, (meta) => {
      const r = evaluate(meta, 'judge');
      expect(r.continuity?.responsibilities[0].verificationState).toBe('failed');
      expect(r.continuity?.state).toBe('failed');
    });
  });

  it('is indeterminate (not fabricated) when a required capsule is not accepted', () => {
    withRun({}, (meta) => {
      const readiness = evaluateRunContextReadiness({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: stageNamesOf(meta.mode),
        currentStage: 'judge',
        projectRoot: meta.projectRoot,
      });
      const refresh = { ...readiness.implementationContext, decision: 'refresh-required' } as ContextReadinessResult;
      const r = evaluate(meta, 'judge', { implementationContextReadiness: refresh, testContextReadiness: undefined });
      expect(r.continuity?.responsibilities[0]).toMatchObject({
        implementationState: 'indeterminate',
        testImplementationState: 'indeterminate',
      });
    });
  });

  it('reflects producer mappings that omit the responsibility', () => {
    withRun({ mappings: [goodMapping('RSP-002')] }, (meta) => {
      const r = evaluate(meta, 'judge');
      expect(r.continuity?.responsibilities[0].implementationState).toBe('indeterminate');
    });
  });

  it('never executes recorded commands or reruns readiness (pure reads only)', () => {
    withRun({ ver: verBlock('RSP-001', 'pass', '0').replace('npm test', 'node -e "process.exit(9)"') }, (meta) => {
      expect(() => evaluate(meta, 'judge')).not.toThrow();
    });
  });
});

describe('mode boundaries', () => {
  it('test mode: no production implementation requirement', () => {
    withRun({ mode: 'test', impl: null }, (meta) => {
      const r = evaluate(meta, 'judge');
      expect(r.continuity?.implementationApplicable).toBe(false);
      expect(r.continuity?.responsibilities[0].implementationState).toBe('not-applicable');
      expect(r.continuity?.state).toBe('complete');
    });
  });

  it('greenfield: not applicable even with a version', () => {
    withRun({ mode: 'greenfield', strategy: null, impl: null, test: null, ver: null, upstream: null }, (meta) => {
      const r = evaluate(meta, 'judge');
      expect(r.activation).toBe('active');
      expect(r.continuity?.state).toBe('not-applicable');
    });
  });

  it('proof-only: not applicable even with a version', () => {
    withRun({ proofOnly: true }, (meta) => {
      expect(evaluate(meta, 'judge').continuity?.state).toBe('not-applicable');
    });
  });

  it('strategy block helper is canonical (sanity)', () => {
    expect(strategyBlock('RSP-001')).toContain('test responsibility ID: RSP-001');
  });
});
