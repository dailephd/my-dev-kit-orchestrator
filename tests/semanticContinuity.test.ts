import {
  evaluateSemanticContinuity,
  normalizeCorroborationState,
  normalizeVerificationState,
  SemanticContinuityInput,
  SemanticContinuityLegState,
} from '../src/instructions/semanticContinuity';
import { validateSemanticResponsibilities } from '../src/instructions/semanticResponsibility';
import {
  validateImplementationResponsibilities,
  evaluateImplementationEvidenceBridge,
} from '../src/instructions/implementationResponsibilityEvidence';
import {
  validateTestImplementationResponsibilities,
  evaluateTestImplementationBridge,
} from '../src/instructions/testImplementationResponsibilityEvidence';
import {
  validateVerificationResponsibilities,
  evaluateVerificationAttribution,
} from '../src/instructions/verificationResponsibilityEvidence';
import { RawResponsibilityMappingEntry } from '../src/instructions/myDevKitEvidenceSummary';
import { TEST_STRATEGY_SOURCE_REQUIREMENTS } from '../src/instructions/testResponsibilityCriticality';
import { getWorkflow } from '../src/workflows';

// ─── Builders (drive the real Batch 0-2 parsers and bridges) ────────────────

function strategyBlock(id: string, opts: { criticality?: string; traces?: string } = {}): string {
  return [
    `test responsibility ID: ${id}`,
    `criticality: ${opts.criticality ?? 'critical'}`,
    'responsibility: Reject malformed configuration',
    `traces to: ${opts.traces ?? 'REQ-001, BEH-002'}`,
    'setup: s',
    'action or trigger: a',
    'expected result: e',
    'test level: unit',
    '',
  ].join('\n');
}

const implBlock = (id: string, file = 'src/a.ts') => `implementation responsibility ID: ${id}\nproduction file: ${file}\n`;
const testBlock = (id: string, file = 'tests/a.spec.ts') => `test implementation responsibility ID: ${id}\ntest file: ${file}\n`;
const verBlock = (id: string, status = 'pass', exit = '0') =>
  status === 'skipped' || status === 'blocked'
    ? `verification responsibility ID: ${id}\nverification status: ${status}\nreason: because\n`
    : `verification responsibility ID: ${id}\nverification status: ${status}\nverification evidence:\ncommand: npm test\nworking directory: .\nexit code: ${exit}\n`;

interface Scenario {
  mode?: string;
  currentStage: string;
  proofOnly?: boolean;
  strategy?: string;
  impl?: string;
  test?: string;
  ver?: string;
  traces?: string[];
  producer?: RawResponsibilityMappingEntry[];
  truncated?: boolean;
}

const ALL_TRACES = ['REQ-001', 'BEH-002'];

function goodProducer(...ids: string[]): RawResponsibilityMappingEntry[] {
  return ids.map((id) => ({
    responsibilityId: id,
    mappingStatus: 'mapped',
    productionSymbols: [{ id: 'symbol:src/a.ts#run', path: 'src/a.ts' }],
    proposedOrExistingTestFiles: [{ id: 'tests/a.spec.ts', itemKind: 'test-file', path: 'tests/a.spec.ts' }],
  }));
}

function build(s: Scenario): SemanticContinuityInput {
  const semanticValidation = validateSemanticResponsibilities(s.strategy ?? strategyBlock('RSP-001'));
  const implementationValidation = validateImplementationResponsibilities(s.impl ?? implBlock('RSP-001'));
  const testImplementationValidation = validateTestImplementationResponsibilities(s.test ?? testBlock('RSP-001'));
  const verificationValidation = validateVerificationResponsibilities(s.ver ?? verBlock('RSP-001'));
  const evidence = {
    responsibilityMappings: s.producer ?? goodProducer('RSP-001'),
    responsibilityMappingsTruncated: s.truncated ?? false,
  };
  return {
    mode: s.mode ?? 'feature',
    currentStage: s.currentStage,
    ...(s.proofOnly !== undefined ? { proofOnly: s.proofOnly } : {}),
    declaredUpstreamTraceIds: s.traces ?? ALL_TRACES,
    semanticValidation,
    implementationValidation,
    implementationBridge: evaluateImplementationEvidenceBridge({
      semanticResponsibilities: semanticValidation.responsibilities,
      declarations: implementationValidation.declarations,
      evidence,
    }),
    testImplementationValidation,
    testImplementationBridge: evaluateTestImplementationBridge({
      semanticResponsibilities: semanticValidation.responsibilities,
      declarations: testImplementationValidation.declarations,
      evidence,
    }),
    verificationValidation,
    verificationAttribution: evaluateVerificationAttribution({
      semanticResponsibilities: semanticValidation.responsibilities,
      declarations: verificationValidation.declarations,
    }),
  };
}

const run = (s: Scenario) => evaluateSemanticContinuity(build(s));

// ─── Applicability ──────────────────────────────────────────────────────────

describe('applicability', () => {
  it('is not applicable to greenfield', () => {
    const r = run({ mode: 'greenfield', currentStage: 'judge' });
    expect(r.applicability).toBe('not-applicable');
    expect(r.state).toBe('not-applicable');
    expect(r.applicabilityReason).toMatch(/greenfield/);
  });
  it('is not applicable to proof-only runs', () => {
    const r = run({ currentStage: 'judge', proofOnly: true });
    expect(r.applicability).toBe('not-applicable');
    expect(r.state).toBe('not-applicable');
    expect(r.applicabilityReason).toMatch(/proof-only/);
  });
  it('is not applicable to an unknown mode', () => {
    expect(run({ mode: 'nonsense', currentStage: 'judge' }).state).toBe('not-applicable');
  });
  it('applies to a normal feature run', () => {
    const r = run({ currentStage: 'judge' });
    expect(r.applicability).toBe('applicable');
    expect(r.applicabilityReason).toBeUndefined();
  });
});

// ─── Phase matrix ───────────────────────────────────────────────────────────

const MODES = ['feature', 'repair', 'test', 'refactor', 'harden', 'extraction'];

describe('phase matrix', () => {
  it.each(MODES)('%s: strategy stage comes from the registry and legs activate strictly after their owner stage', (mode) => {
    const requirement = TEST_STRATEGY_SOURCE_REQUIREMENTS.find((r) => r.mode === mode)!;
    const strategyStage = requirement.strategyStageId.replace(`stage.${mode}.`, '');
    const names = getWorkflow(mode as never).stages.map((s) => s.name);
    const hasImpl = names.includes('implementation');
    const at = (stage: string) => run({ mode, currentStage: stage });

    for (const stage of names) {
      const r = at(stage);
      const idx = names.indexOf(stage);
      expect(r.strategyActive).toBe(idx > names.indexOf(strategyStage));
      expect(r.implementationApplicable).toBe(hasImpl);
      expect(r.implementationActive).toBe(hasImpl && idx > names.indexOf('implementation'));
      expect(r.testImplementationActive).toBe(idx > names.indexOf('test-implementation'));
      expect(r.verificationActive).toBe(idx > names.indexOf('verification'));
    }
    expect(at(strategyStage).state).toBe('pending');
    expect(at(names[names.indexOf(strategyStage) + 1]).strategyActive).toBe(true);
  });

  it('feature: exact active-leg transitions', () => {
    const flags = (stage: string) => {
      const r = run({ currentStage: stage });
      return [r.strategyActive, r.implementationActive, r.testImplementationActive, r.verificationActive];
    };
    expect(flags('test-strategy')).toEqual([false, false, false, false]);
    expect(flags('implementation')).toEqual([true, false, false, false]);
    expect(flags('test-implementation')).toEqual([true, true, false, false]);
    expect(flags('verification')).toEqual([true, true, true, false]);
    expect(flags('judge')).toEqual([true, true, true, true]);
    expect(flags('final-report')).toEqual([true, true, true, true]);
  });

  it.each([
    ['repair', 'regression-test-strategy'],
    ['refactor', 'compatibility-test-strategy'],
    ['harden', 'resilience-test-strategy'],
    ['extraction', 'test-strategy'],
    ['test', 'test-strategy'],
  ])('%s: strategy leg is inactive at %s and active immediately after', (mode, strategyStage) => {
    const names = getWorkflow(mode as never).stages.map((s) => s.name);
    expect(run({ mode, currentStage: strategyStage }).strategyActive).toBe(false);
    expect(run({ mode, currentStage: names[names.indexOf(strategyStage) + 1] }).strategyActive).toBe(true);
  });

  it('extraction has a production implementation stage', () => {
    expect(run({ mode: 'extraction', currentStage: 'judge' }).implementationApplicable).toBe(true);
  });

  it('test mode: implementation is not-applicable at every phase and does not block completeness', () => {
    for (const stage of ['test-implementation', 'verification', 'judge', 'final-report']) {
      const r = run({ mode: 'test', currentStage: stage });
      expect(r.implementationApplicable).toBe(false);
      expect(r.implementationActive).toBe(false);
      if (r.responsibilities.length > 0) expect(r.responsibilities[0].implementationState).toBe('not-applicable');
    }
    const judge = run({ mode: 'test', currentStage: 'judge', impl: '' });
    expect(judge.responsibilities[0]).toMatchObject({
      strategyState: 'satisfied',
      implementationState: 'not-applicable',
      testImplementationState: 'satisfied',
      verificationState: 'satisfied',
      state: 'complete',
    });
    expect(judge.state).toBe('complete');
    const verification = run({ mode: 'test', currentStage: 'verification' });
    expect(verification.testImplementationActive).toBe(true);
    expect(verification.verificationActive).toBe(false);
  });

  it('reports an unknown current stage without guessing', () => {
    const r = run({ currentStage: 'no-such-stage' });
    expect(r.state).toBe('invalid');
    expect(r.issues.map((i) => i.code)).toEqual(['SEMANTIC_CONTINUITY_STAGE_UNKNOWN']);
    expect(r.strategyActive).toBe(false);
  });
});

describe('phase-relative completeness', () => {
  it('feature at implementation: strategy satisfied, future legs pending, complete', () => {
    const r = run({ currentStage: 'implementation', impl: '', test: '', ver: '', producer: [] });
    expect(r.state).toBe('complete');
    expect(r.responsibilities[0]).toMatchObject({
      strategyState: 'satisfied',
      implementationState: 'pending',
      testImplementationState: 'pending',
      verificationState: 'pending',
      state: 'complete',
    });
  });

  it('feature at test-implementation without an implementation declaration is incomplete', () => {
    const r = run({ currentStage: 'test-implementation', impl: '', test: '', ver: '' });
    expect(r.responsibilities[0].implementationState).toBe('missing');
    expect(r.state).toBe('incomplete');
  });

  it('feature at judge with everything satisfied is complete', () => {
    const r = run({ currentStage: 'judge' });
    expect(r.responsibilities[0]).toMatchObject({
      implementationState: 'satisfied',
      testImplementationState: 'satisfied',
      verificationState: 'satisfied',
      state: 'complete',
    });
    expect(r.state).toBe('complete');
  });
});

// ─── Correction-phase safety ────────────────────────────────────────────────

describe('correction-phase safety', () => {
  const broken = {
    test: `${testBlock('RSP-001', '../escape.ts')}${testBlock('RSP-999')}`,
    ver: `verification responsibility ID: RSP-001\nverification status: passed\n${verBlock('RSP-998')}`,
  };

  it('ignores malformed/orphan downstream data while the phase is still implementation', () => {
    const at = run({ currentStage: 'implementation', ...broken });
    expect(at.state).toBe('complete');
    expect(at.issues).toEqual([]);
    expect(at.responsibilities[0].testImplementationState).toBe('pending');
    expect(at.responsibilities[0].verificationState).toBe('pending');
    const clean = run({ currentStage: 'implementation' });
    expect({ ...at, issues: [] }).toEqual({ ...clean, issues: [] });
  });

  it('activates the same defects once the phase reaches judge', () => {
    const at = run({ currentStage: 'judge', ...broken });
    expect(at.state).toBe('invalid');
    const codes = at.issues.map((i) => i.code);
    expect(codes).toContain('SEMANTIC_CONTINUITY_TEST_IMPLEMENTATION_INVALID');
    expect(codes).toContain('SEMANTIC_CONTINUITY_VERIFICATION_INVALID');
    expect(codes).toContain('SEMANTIC_CONTINUITY_ORPHAN_DECLARATION');
  });

  it('is safe across every downstream stage for each correction target', () => {
    for (const stage of ['implementation', 'test-implementation', 'verification']) {
      const r = run({ currentStage: stage, ...broken });
      const activeTest = stage === 'verification';
      expect(r.issues.some((i) => i.leg === 'verification')).toBe(false);
      expect(r.issues.some((i) => i.leg === 'test-implementation')).toBe(activeTest);
    }
  });
});

// ─── Upstream trace existence ───────────────────────────────────────────────

describe('upstream trace existence', () => {
  it('is satisfied when every referenced trace is declared', () => {
    const r = run({ currentStage: 'implementation' });
    expect(r.responsibilities[0].strategyState).toBe('satisfied');
    expect(r.responsibilities[0].missingUpstreamTraceIds).toEqual([]);
  });

  it('invalidates a responsibility with one missing trace', () => {
    const r = run({ currentStage: 'implementation', traces: ['REQ-001'] });
    expect(r.state).toBe('invalid');
    expect(r.responsibilities[0]).toMatchObject({ strategyState: 'invalid', missingUpstreamTraceIds: ['BEH-002'], state: 'invalid' });
    expect(r.issues).toEqual([
      expect.objectContaining({
        code: 'SEMANTIC_CONTINUITY_UPSTREAM_TRACE_MISSING',
        responsibilityId: 'RSP-001',
        traceId: 'BEH-002',
      }),
    ]);
  });

  it('reports all missing IDs exactly', () => {
    const r = run({ currentStage: 'implementation', strategy: strategyBlock('RSP-001', { traces: 'REQ-001, CTX-002, PSE-003' }), traces: [] });
    expect(r.responsibilities[0].missingUpstreamTraceIds).toEqual(['REQ-001', 'CTX-002', 'PSE-003']);
    expect(r.issues.map((i) => i.traceId)).toEqual(['REQ-001', 'CTX-002', 'PSE-003']);
  });

  it('is case-sensitive and never substring-matched', () => {
    expect(run({ currentStage: 'implementation', traces: ['req-001', 'BEH-002'] }).responsibilities[0].missingUpstreamTraceIds).toEqual(['REQ-001']);
    expect(run({ currentStage: 'implementation', traces: ['REQ-0011', 'XBEH-002'] }).responsibilities[0].missingUpstreamTraceIds).toEqual([
      'REQ-001',
      'BEH-002',
    ]);
  });

  it('is not evaluated before the strategy leg is active', () => {
    const r = run({ currentStage: 'test-strategy', traces: [] });
    expect(r.state).toBe('pending');
    expect(r.issues).toEqual([]);
  });
});

// ─── Leg normalization ──────────────────────────────────────────────────────

describe('leg normalization', () => {
  it.each<[Parameters<typeof normalizeCorroborationState>[0], SemanticContinuityLegState]>([
    ['corroborated', 'satisfied'],
    ['partially-corroborated', 'partial'],
    ['uncorroborated', 'unsatisfied'],
    ['missing-declaration', 'missing'],
    ['producer-mapping-unavailable', 'indeterminate'],
  ])('implementation/test %s -> %s', (from, to) => {
    expect(normalizeCorroborationState(from)).toBe(to);
  });

  it.each<[Parameters<typeof normalizeVerificationState>[0], SemanticContinuityLegState]>([
    ['passed', 'satisfied'],
    ['failed', 'failed'],
    ['skipped', 'skipped'],
    ['blocked', 'blocked'],
    ['missing-declaration', 'missing'],
  ])('verification %s -> %s', (from, to) => {
    expect(normalizeVerificationState(from)).toBe(to);
  });

  it('flows through the evaluator', () => {
    const partial = run({
      currentStage: 'judge',
      impl: 'implementation responsibility ID: RSP-001\nproduction file: src/a.ts\nproduction file: src/other.ts\n',
    });
    expect(partial.responsibilities[0].implementationState).toBe('partial');
    expect(run({ currentStage: 'judge', impl: implBlock('RSP-001', 'src/zzz.ts') }).responsibilities[0].implementationState).toBe('unsatisfied');
    expect(run({ currentStage: 'judge', producer: [] }).responsibilities[0].implementationState).toBe('indeterminate');
    expect(run({ currentStage: 'judge', producer: [] }).responsibilities[0].testImplementationState).toBe('indeterminate');
  });
});

// ─── Responsibility-state precedence ────────────────────────────────────────

describe('responsibility state and precedence', () => {
  const judge = (over: Partial<Scenario>) => run({ currentStage: 'judge', ...over }).responsibilities[0];

  it('complete', () => expect(judge({}).state).toBe('complete'));
  it('indeterminate only', () => {
    expect(judge({ producer: [] }).state).toBe('indeterminate');
  });
  it('incomplete beats indeterminate', () => {
    expect(judge({ producer: [], ver: '' }).state).toBe('incomplete');
  });
  it('blocked beats incomplete', () => {
    expect(judge({ ver: verBlock('RSP-001', 'blocked'), impl: '' }).state).toBe('blocked');
  });
  it('failed beats blocked-level incompleteness', () => {
    expect(judge({ ver: verBlock('RSP-001', 'fail', '1'), impl: '' }).state).toBe('failed');
  });
  it('invalid beats failed', () => {
    const r = judge({ ver: verBlock('RSP-001', 'fail', '1'), traces: [] });
    expect(r.state).toBe('invalid');
  });
  it('invalid active leg beats failed verification', () => {
    const r = judge({ ver: verBlock('RSP-001', 'fail', '1'), test: testBlock('RSP-001', '/abs/a.ts') });
    expect(r.testImplementationState).toBe('invalid');
    expect(r.state).toBe('invalid');
  });
  it('verification skipped is incomplete', () => {
    const r = judge({ ver: verBlock('RSP-001', 'skipped') });
    expect(r.verificationState).toBe('skipped');
    expect(r.state).toBe('incomplete');
  });
  it('missing verification declaration is incomplete', () => {
    expect(judge({ ver: '' }).state).toBe('incomplete');
  });
});

// ─── Structural invalidity ──────────────────────────────────────────────────

describe('structural invalidity', () => {
  it('malformed strategy is invalid', () => {
    const r = run({ currentStage: 'implementation', strategy: strategyBlock('RSP-001', { criticality: 'high' }) });
    expect(r.state).toBe('invalid');
    expect(r.issues[0]).toMatchObject({
      code: 'SEMANTIC_CONTINUITY_STRATEGY_INVALID',
      sourceIssueCode: 'SEMANTIC_RESPONSIBILITY_CRITICALITY_INVALID',
      responsibilityId: 'RSP-001',
    });
    expect(r.responsibilities[0].strategyState).toBe('invalid');
  });

  it('a strategy issue without a responsibility is a global invalid', () => {
    const r = run({ currentStage: 'implementation', strategy: `${strategyBlock('RSP-001')}\ntest responsibility ID:\ncriticality: critical\nsetup: s\naction or trigger: a\n` });
    expect(r.state).toBe('invalid');
  });

  it.each([
    ['implementation', 'test-implementation', { impl: implBlock('RSP-001', '../x.ts') }, 'SEMANTIC_CONTINUITY_IMPLEMENTATION_INVALID', 'IMPLEMENTATION_RESPONSIBILITY_FILE_INVALID'],
    ['test-implementation', 'verification', { test: testBlock('RSP-001', 'C:\\x.ts') }, 'SEMANTIC_CONTINUITY_TEST_IMPLEMENTATION_INVALID', 'TEST_IMPLEMENTATION_RESPONSIBILITY_FILE_INVALID'],
    ['verification', 'judge', { ver: 'verification responsibility ID: RSP-001\nverification status: nope\n' }, 'SEMANTIC_CONTINUITY_VERIFICATION_INVALID', 'VERIFICATION_RESPONSIBILITY_STATUS_INVALID'],
  ] as Array<[string, string, Partial<Scenario>, string, string]>)(
    'malformed %s block is invalid only once its leg is active',
    (_leg, activeStage, scenario, code, sourceCode) => {
      const names = getWorkflow('feature').stages.map((s) => s.name);
      const inactiveStage = names[names.indexOf(activeStage) - 1];
      const inactive = run({ currentStage: inactiveStage, ...scenario });
      expect(inactive.issues.map((i) => i.code)).not.toContain(code);
      expect(inactive.state).toBe('complete');

      const active = run({ currentStage: activeStage, ...scenario });
      expect(active.state).toBe('invalid');
      expect(active.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code, sourceIssueCode: sourceCode })]));
    },
  );

  it.each([
    ['implementation', 'test-implementation', { impl: `${implBlock('RSP-001')}${implBlock('RSP-999')}` }, 'IMPLEMENTATION_RESPONSIBILITY_ORPHAN'],
    ['test-implementation', 'verification', { test: `${testBlock('RSP-001')}${testBlock('RSP-999')}` }, 'TEST_IMPLEMENTATION_RESPONSIBILITY_ORPHAN'],
    ['verification', 'judge', { ver: `${verBlock('RSP-001')}${verBlock('RSP-999')}` }, 'VERIFICATION_RESPONSIBILITY_ORPHAN'],
  ] as Array<[string, string, Partial<Scenario>, string]>)('%s orphan invalidates only when active', (leg, activeStage, scenario, sourceCode) => {
    const names = getWorkflow('feature').stages.map((s) => s.name);
    const inactive = run({ currentStage: names[names.indexOf(activeStage) - 1], ...scenario });
    expect(inactive.issues).toEqual([]);
    expect(inactive.state).toBe('complete');

    const active = run({ currentStage: activeStage, ...scenario });
    expect(active.state).toBe('invalid');
    expect(active.issues).toEqual([
      expect.objectContaining({
        code: 'SEMANTIC_CONTINUITY_ORPHAN_DECLARATION',
        sourceIssueCode: sourceCode,
        leg,
        responsibilityId: 'RSP-999',
      }),
    ]);
  });

  it('distinguishes malformed evidence (invalid) from absent evidence (missing)', () => {
    expect(run({ currentStage: 'test-implementation', impl: '' }).responsibilities[0].implementationState).toBe('missing');
    expect(run({ currentStage: 'test-implementation', impl: implBlock('RSP-001', '../x') }).responsibilities[0].implementationState).toBe('invalid');
  });
});

// ─── Verification diagnostic ────────────────────────────────────────────────

describe('verification diagnostic', () => {
  it('does not invalidate continuity', () => {
    const input = build({ currentStage: 'judge', ver: verBlock('RSP-001', 'pass', '3') });
    expect(input.verificationValidation.issues.map((i) => i.code)).toEqual([
      'VERIFICATION_RESPONSIBILITY_STATUS_EVIDENCE_INCONSISTENT',
    ]);
    expect(input.verificationAttribution.responsibilities[0].state).toBe('passed');
    const r = evaluateSemanticContinuity(input);
    expect(r.responsibilities[0].verificationState).toBe('satisfied');
    expect(r.state).toBe('complete');
    expect(r.issues).toEqual([]);
    expect(r.diagnostics).toEqual([
      expect.objectContaining({
        leg: 'verification',
        sourceIssueCode: 'VERIFICATION_RESPONSIBILITY_STATUS_EVIDENCE_INCONSISTENT',
        responsibilityId: 'RSP-001',
      }),
    ]);
  });
});

// ─── Zero responsibilities ──────────────────────────────────────────────────

describe('zero canonical responsibilities', () => {
  it('is incomplete when the strategy leg is active', () => {
    const r = run({ currentStage: 'implementation', strategy: 'No responsibilities here.' });
    expect(r.state).toBe('incomplete');
    expect(r.issues.map((i) => i.code)).toEqual(['SEMANTIC_CONTINUITY_RESPONSIBILITIES_MISSING']);
    expect(r.summary.totalResponsibilities).toBe(0);
  });
  it('is pending when the strategy leg is not yet active', () => {
    const r = run({ currentStage: 'test-strategy', strategy: '' });
    expect(r.state).toBe('pending');
    expect(r.issues).toEqual([]);
  });
});

// ─── Overall precedence, order, criticality summary ─────────────────────────

describe('overall state and summary', () => {
  const two = (verA: string, verB: string, extra: Partial<Scenario> = {}) =>
    run({
      currentStage: 'judge',
      strategy: `${strategyBlock('RSP-002', { criticality: 'noncritical' })}${strategyBlock('RSP-001', { criticality: 'critical' })}`,
      impl: `${implBlock('RSP-001')}${implBlock('RSP-002')}`,
      test: `${testBlock('RSP-001')}${testBlock('RSP-002')}`,
      ver: `${verA}${verB}`,
      producer: goodProducer('RSP-001', 'RSP-002'),
      ...extra,
    });

  it('keeps canonical strategy order and complete overall state', () => {
    const r = two(verBlock('RSP-001'), verBlock('RSP-002'));
    expect(r.responsibilities.map((x) => x.responsibilityId)).toEqual(['RSP-002', 'RSP-001']);
    expect(r.state).toBe('complete');
  });

  it.each([
    ['invalid', verBlock('RSP-001'), verBlock('RSP-002'), { traces: ['REQ-001'] }, 'invalid'],
    ['failed', verBlock('RSP-001', 'fail', '1'), verBlock('RSP-002', 'blocked'), {}, 'failed'],
    ['blocked', verBlock('RSP-001', 'blocked'), verBlock('RSP-002', 'skipped'), {}, 'blocked'],
    ['incomplete', verBlock('RSP-001'), verBlock('RSP-002', 'skipped'), {}, 'incomplete'],
    ['indeterminate', verBlock('RSP-001'), verBlock('RSP-002'), { producer: goodProducer('RSP-001') }, 'indeterminate'],
  ] as Array<[string, string, string, Partial<Scenario>, string]>)('overall %s', (_n, a, b, extra, expected) => {
    expect(two(a, b, extra).state).toBe(expected);
  });

  it('summarizes counts and IDs by criticality without letting criticality change state', () => {
    const r = two(verBlock('RSP-001'), verBlock('RSP-002', 'skipped'));
    expect(r.summary).toEqual({
      totalResponsibilities: 2,
      criticalResponsibilities: 1,
      noncriticalResponsibilities: 1,
      completeResponsibilities: 1,
      incompleteResponsibilities: 1,
      indeterminateResponsibilities: 0,
      failedResponsibilities: 0,
      blockedResponsibilities: 0,
      invalidResponsibilities: 0,
      criticalCompleteResponsibilityIds: ['RSP-001'],
      criticalUnsatisfiedResponsibilityIds: [],
      noncriticalCompleteResponsibilityIds: [],
      noncriticalUnsatisfiedResponsibilityIds: ['RSP-002'],
      unclassifiedResponsibilityIds: [],
    });
    // Same evidence gap on the critical responsibility gives the same state.
    const swapped = two(verBlock('RSP-001', 'skipped'), verBlock('RSP-002'));
    expect(swapped.responsibilities.find((x) => x.responsibilityId === 'RSP-001')!.state).toBe('incomplete');
    expect(swapped.summary.criticalUnsatisfiedResponsibilityIds).toEqual(['RSP-001']);
    expect(swapped.summary.noncriticalCompleteResponsibilityIds).toEqual(['RSP-002']);
  });

  it('carries criticality into each responsibility result', () => {
    const r = two(verBlock('RSP-001'), verBlock('RSP-002'));
    expect(r.responsibilities.map((x) => x.criticality)).toEqual(['noncritical', 'critical']);
  });
});

// ─── Purity ─────────────────────────────────────────────────────────────────

describe('purity', () => {
  it('is deterministic and does not mutate its input', () => {
    const input = build({ currentStage: 'judge', traces: ['REQ-001'], ver: verBlock('RSP-001', 'pass', '2') });
    const snapshot = JSON.stringify(input);
    const a = evaluateSemanticContinuity(input);
    const b = evaluateSemanticContinuity(input);
    expect(a).toEqual(b);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
