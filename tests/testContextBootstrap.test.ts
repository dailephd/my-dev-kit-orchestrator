// v1.6.1 test-context bootstrap correction.
//
// test-implementation is the stage that creates related-test and
// oracle/assertion evidence, so requiring that evidence to ENTER the stage is
// circular. These tests prove the phase-aware correction:
//   - ENTRY (stage current, TestImplementationReport absent) accepts critical
//     responsibilities whose raw mappings are partially-mapped ONLY for
//     test-side reasons, over fully grounded production evidence;
//   - the raw producer mappingStatus stays truthfully partially-mapped;
//   - completion (report exists), verification, judge and final-report keep
//     the strict contract, and every production-side gap still blocks.
// Fixtures use generic repository-relative names only.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { evaluateContextReadiness } from '../src/instructions/contextReadiness';
import { evaluateRunContextReadiness } from '../src/instructions/runContextReadiness';
import {
  STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS,
  TEST_IMPLEMENTATION_REPORT_ARTIFACT,
  isTestImplementationPreTestEntry,
} from '../src/instructions/stageRepositoryEvidenceRequirements';
import { CONTEXT_TEST_EVIDENCE_PENDING_PRETEST, assessPreTestDeferral } from '../src/instructions/testContextBootstrap';
import type { RawResponsibilityMappingEntry } from '../src/instructions/myDevKitEvidenceSummary';
import type { TestResponsibilityParseResult } from '../src/instructions/testResponsibilityCriticality';
import { createRun, RunMetadata } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { getAllWorkflows } from '../src/workflows';
import { makeReadyRunFolder } from './readyContextTestHelpers';
import { runCli } from './cliTestHelpers';

const testRequirement = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find((r) => r.stageId === 'stage.feature.test-implementation')!;

const PRODUCTION_SYMBOL = { id: 'symbol:src/area/unit.ts#doWork', itemKind: 'symbol', symbolId: 'symbol:src/area/unit.ts#doWork' };
const CONTRACT = { id: 'file:src/area/types.ts', itemKind: 'file', path: 'src/area/types.ts' };
const RELATED_TEST = { id: 'tests/area/unit.spec.ts', itemKind: 'test-file', path: 'tests/area/unit.spec.ts' };
const RUNNER = { id: 'vitest run', itemKind: 'command' };

type Mapping = Record<string, unknown>;

// Raw producer mapping exactly as a newly created subsystem yields it before
// any test exists: production side grounded, test side absent.
function preTestMapping(id: string, overrides: Mapping = {}): Mapping {
  return {
    responsibilityId: id,
    mappingStatus: 'partially-mapped',
    productionSymbols: [PRODUCTION_SYMBOL],
    contracts: [CONTRACT],
    validators: [],
    constants: [],
    errors: [],
    proposedOrExistingTestFiles: [],
    oracleEvidence: [],
    testCommands: [RUNNER],
    unresolvedReasons: ['no related test', 'no oracle evidence'],
    ...overrides,
  };
}

// Raw producer mapping after tests exist and context was refreshed.
function postTestMapping(id: string): Mapping {
  return {
    responsibilityId: id,
    mappingStatus: 'mapped',
    productionSymbols: [PRODUCTION_SYMBOL],
    contracts: [CONTRACT],
    proposedOrExistingTestFiles: [RELATED_TEST],
    oracleEvidence: [{ id: 'oracle:tests/area/unit.spec.ts', itemKind: 'test-file' }],
    testCommands: [RUNNER, { id: 'vitest run tests/area/unit.spec.ts', itemKind: 'command' }],
    unresolvedReasons: [],
  };
}

const CRITICAL_IDS = ['TST-001', 'TST-002', 'TST-003'];
const NONCRITICAL_ID = 'TST-004';

function strategyText(entries: Array<[string, string]> = [...CRITICAL_IDS.map((id): [string, string] => [id, 'critical']), [NONCRITICAL_ID, 'noncritical']]): string {
  return entries
    .map(
      ([id, crit]) => `
test responsibility ID: ${id}
criticality: ${crit}
traces to: x
setup: x
action or trigger: x
expected result: x
test level: unit
`,
    )
    .join('\n');
}

interface RawOptions {
  mappings: Mapping[];
  mappingsTruncated?: boolean;
  capsule?: Record<string, unknown>;
  audit?: Record<string, unknown>;
}

function rawEvidence(opts: RawOptions, which: 'capsule' | 'audit'): string {
  const role = 'test-implementation';
  return JSON.stringify({
    schemaVersion: '1.0.0',
    tool: { name: 'my-dev-kit', version: '1.12.5' },
    index: { indexPath: '/idx', manifestPath: '/idx/manifest.json' },
    request: { role },
    roleContext: { role },
    roleAdequacy: { status: 'context sufficient with listed assumptions' },
    freshness: { role, state: 'fresh', comparedIdentities: [{ label: 'afterIndexPath', value: '/idx' }] },
    responsibilityMappings: { mappings: opts.mappings, truncated: opts.mappingsTruncated === true },
    truncation: { truncated: false, records: [] },
    fullFileFallback: { used: 0 },
    provenance: [{ id: 'p1' }],
    warnings: [],
    ...(which === 'capsule' ? opts.capsule : (opts.audit ?? opts.capsule)),
  });
}

// Overwrites the raw test capsule/audit of a run folder previously populated
// by makeReadyRunFolder (the packet/report already reference these files).
function writeTestEvidence(runFolder: string, opts: RawOptions): void {
  fs.writeFileSync(path.join(runFolder, 'test-capsule.json'), rawEvidence(opts, 'capsule'), 'utf8');
  fs.writeFileSync(path.join(runFolder, 'test-audit.json'), rawEvidence(opts, 'audit'), 'utf8');
}

function makeRunFolder(opts: RawOptions, strategy = strategyText()): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-bootstrap-'));
  makeReadyRunFolder(dir, 'feature');
  fs.writeFileSync(path.join(dir, 'artifacts', 'test-strategy-packet.txt'), strategy, 'utf8');
  writeTestEvidence(dir, opts);
  return dir;
}

function evaluate(runFolder: string, preTestEntry: boolean, extra: { projectRoot?: string } = {}) {
  return evaluateContextReadiness({
    requirement: testRequirement,
    stageId: testRequirement.stageId,
    runFolder,
    mode: 'feature',
    preTestEntry,
    ...extra,
  });
}

const allPreTest = (): RawOptions => ({ mappings: [...CRITICAL_IDS, NONCRITICAL_ID].map((id) => preTestMapping(id)) });

describe('assessPreTestDeferral (policy)', () => {
  const parsed = (ids: Array<[string, 'critical' | 'noncritical']>): TestResponsibilityParseResult =>
    ({
      responsibilities: ids.map(([responsibilityId, criticality], blockIndex) => ({
        responsibilityId,
        criticality,
        criticalityRaw: criticality,
        missingFields: [],
        blockIndex,
      })),
      issues: [],
      duplicateResponsibilityIds: [],
    }) as unknown as TestResponsibilityParseResult;

  const asRaw = (m: Mapping) => m as unknown as RawResponsibilityMappingEntry;
  const raw = (m: Mapping) => [asRaw(m)];

  it('defers a critical partial mapping whose only gaps are test-side', () => {
    const result = assessPreTestDeferral(parsed([['A', 'critical']]), raw(preTestMapping('A', { contractLikeEvidenceCount: 1 })).map(project));
    expect(result.deferrable).toBe(true);
    expect(result.deferredResponsibilityIds).toEqual(['A']);
    expect(result.deferredReasons).toEqual(['no oracle evidence', 'no related test']);
  });

  // The policy consumes the typed projection, so build entries through it.
  function project(entry: RawResponsibilityMappingEntry): RawResponsibilityMappingEntry {
    const m = entry as unknown as Mapping;
    return {
      responsibilityId: m.responsibilityId as string,
      mappingStatus: m.mappingStatus as string,
      productionSymbols: (m.productionSymbols as Array<{ id: string }>) ?? [],
      proposedOrExistingTestFiles: (m.proposedOrExistingTestFiles as Array<{ id: string }>) ?? [],
      contractLikeEvidenceCount: ['contracts', 'validators', 'constants', 'errors'].reduce(
        (n, k) => n + (Array.isArray(m[k]) ? (m[k] as unknown[]).length : 0),
        0,
      ),
      testCommandCount: Array.isArray(m.testCommands) ? m.testCommands.length : 0,
      oracleEvidenceCount: Array.isArray(m.oracleEvidence) ? m.oracleEvidence.length : 0,
      unresolvedReasons: (m.unresolvedReasons as string[]) ?? [],
    };
  }
  const assess = (mapping: Mapping) => assessPreTestDeferral(parsed([['A', 'critical']]), [project(asRaw(mapping))]);

  it('ignores noncritical and already-mapped responsibilities', () => {
    const result = assessPreTestDeferral(
      parsed([
        ['A', 'critical'],
        ['B', 'noncritical'],
        ['C', 'critical'],
      ]),
      [project(asRaw(preTestMapping('A'))), project(asRaw(preTestMapping('B', { productionSymbols: [] }))), project(asRaw(postTestMapping('C')))],
    );
    expect(result.deferredResponsibilityIds).toEqual(['A']);
    expect(result.nonDeferrableResponsibilityIds).toEqual([]);
  });

  const nonDeferrable: Array<[string, Mapping]> = [
    ['no production symbols', preTestMapping('A', { productionSymbols: [] })],
    ['no contract/validator/constant/error evidence', preTestMapping('A', { contracts: [] })],
    ['no test command', preTestMapping('A', { testCommands: [], unresolvedReasons: ['no related test', 'no oracle evidence', 'no test command'] })],
    ['an existing related test', preTestMapping('A', { proposedOrExistingTestFiles: [RELATED_TEST], unresolvedReasons: ['no oracle evidence'] })],
    ['a production-side unresolved reason', preTestMapping('A', { unresolvedReasons: ['no related test', 'no production symbol'] })],
    ['a contract-side unresolved reason', preTestMapping('A', { unresolvedReasons: ['no contract, validator, or error evidence'] })],
    ['an unrecognized reason', preTestMapping('A', { unresolvedReasons: ['no related test', 'something else'] })],
    ['no declared reasons (older producer)', preTestMapping('A', { unresolvedReasons: [] })],
    ['an unmapped status', preTestMapping('A', { mappingStatus: 'unmapped' })],
  ];
  it.each(nonDeferrable)('does not defer when the mapping has %s', (_label, mapping) => {
    const result = assess(mapping);
    expect(result.deferrable).toBe(false);
    expect(result.nonDeferrableResponsibilityIds).toEqual(['A']);
  });

  it('does not defer a critical responsibility with no raw mapping at all', () => {
    const result = assessPreTestDeferral(parsed([['A', 'critical']]), []);
    expect(result.deferrable).toBe(false);
    expect(result.nonDeferrableResponsibilityIds).toEqual(['A']);
  });

  it('one non-deferrable critical responsibility makes the whole assessment non-deferrable', () => {
    const result = assessPreTestDeferral(
      parsed([
        ['A', 'critical'],
        ['B', 'critical'],
      ]),
      [project(asRaw(preTestMapping('A'))), project(asRaw(preTestMapping('B', { productionSymbols: [] })))],
    );
    expect(result.deferrable).toBe(false);
    expect(result.deferredResponsibilityIds).toEqual(['A']);
    expect(result.nonDeferrableResponsibilityIds).toEqual(['B']);
  });
});

describe('isTestImplementationPreTestEntry (phase)', () => {
  it('is entry only for the test-implementation stage with no report yet', () => {
    const dir = makeRunFolder(allPreTest());
    expect(isTestImplementationPreTestEntry({ stageName: 'test-implementation', runFolder: dir })).toBe(true);
    for (const stageName of ['verification', 'judge', 'final-report', 'implementation', 'test-strategy', undefined]) {
      expect(isTestImplementationPreTestEntry({ stageName, runFolder: dir })).toBe(false);
    }
  });

  it('stops being entry as soon as the TestImplementationReport exists', () => {
    const dir = makeRunFolder(allPreTest());
    fs.writeFileSync(path.join(dir, TEST_IMPLEMENTATION_REPORT_ARTIFACT), 'draft', 'utf8');
    expect(isTestImplementationPreTestEntry({ stageName: 'test-implementation', runFolder: dir })).toBe(false);
  });

  it('uses the same artifact path every workflow assigns to the test-implementation stage', () => {
    for (const workflow of getAllWorkflows()) {
      const stage = workflow.stages.find((s) => s.name === 'test-implementation');
      if (stage) expect(stage.artifactFile).toBe(TEST_IMPLEMENTATION_REPORT_ARTIFACT);
    }
  });
});

describe('evaluateContextReadiness: pre-test entry (defect replay at readiness level)', () => {
  it('without the phase flag the exact discovered state still blocks (strict contract unchanged)', () => {
    const result = evaluate(makeRunFolder(allPreTest()), false);
    expect(result.decision).toBe('refresh-required');
    expect(result.blockingIssueCodes).toContain('CONTEXT_CRITICAL_RESPONSIBILITY_PARTIALLY_MAPPED');
    expect(result.deferredTestEvidence).toBeUndefined();
  });

  it('with the phase flag the same state is ready for ENTRY with explicit deferred test evidence', () => {
    const result = evaluate(makeRunFolder(allPreTest()), true);
    expect(result.decision).toBe('ready');
    expect(result.classification).toBe('ready');
    expect(result.readyWithAssumptions).toBe(true);
    expect(result.blockingIssueCodes).toEqual([]);
    expect(result.deferredTestEvidence).toEqual({
      responsibilityIds: CRITICAL_IDS,
      reasons: ['no oracle evidence', 'no related test'],
    });
    expect(result.warnings.some((w) => w.startsWith(`${CONTEXT_TEST_EVIDENCE_PENDING_PRETEST}:`))).toBe(true);
    expect(result.affectedResponsibilityIds).toEqual([]);
  });

  it('never falsifies the raw mapping: critical responsibilities are still reported as not fully mapped', () => {
    const result = evaluate(makeRunFolder(allPreTest()), true);
    const summary = result.criticalResponsibilitySummary!;
    expect(summary.criticalResponsibilities).toBe(3);
    expect(summary.criticalMapped).toBe(0);
    expect(summary.criticalPartiallyMapped).toBe(3);
  });

  it('noncritical partial mappings keep their existing warning-only policy in both phases', () => {
    for (const phase of [false, true]) {
      const dir = makeRunFolder({ mappings: [...CRITICAL_IDS.map((id) => postTestMapping(id)), preTestMapping(NONCRITICAL_ID)] });
      const result = evaluate(dir, phase);
      expect(result.decision).toBe('ready');
      expect(result.deferredTestEvidence).toBeUndefined();
      expect(result.warnings.some((w) => w.includes(NONCRITICAL_ID))).toBe(true);
    }
  });

  it('fully mapped critical responsibilities are ordinary ready with no deferral', () => {
    const result = evaluate(makeRunFolder({ mappings: [...CRITICAL_IDS, NONCRITICAL_ID].map((id) => postTestMapping(id)) }), true);
    expect(result.decision).toBe('ready');
    expect(result.deferredTestEvidence).toBeUndefined();
    expect(result.criticalResponsibilitySummary?.criticalMapped).toBe(3);
  });

  it('keeps not-applicable behavior unchanged (a not-applicable critical mapping is still not fully mapped, strict and entry alike)', () => {
    const mixed: RawOptions = {
      mappings: [preTestMapping('TST-001'), preTestMapping('TST-002'), { responsibilityId: 'TST-003', mappingStatus: 'not-applicable' }, preTestMapping(NONCRITICAL_ID)],
    };
    const strict = evaluate(makeRunFolder(mixed), false);
    const entry = evaluate(makeRunFolder(mixed), true);
    // Entry relaxes only partially-mapped test-side gaps; it never changes how
    // not-applicable is counted, so the summary is identical in both phases.
    expect(entry.criticalResponsibilitySummary).toEqual(strict.criticalResponsibilitySummary);
  });
});

describe('evaluateContextReadiness: pre-test relaxation fails closed (negative matrix)', () => {
  function expectStillBlocked(runFolder: string, extra: { projectRoot?: string } = {}) {
    const result = evaluate(runFolder, true, extra);
    expect(result.decision).toBe('refresh-required');
    expect(result.deferredTestEvidence).toBeUndefined();
    expect(result.warnings.some((w) => w.startsWith(CONTEXT_TEST_EVIDENCE_PENDING_PRETEST))).toBe(false);
    return result;
  }

  const withMapping = (override: Mapping): RawOptions => ({
    mappings: [preTestMapping('TST-001', override), preTestMapping('TST-002'), preTestMapping('TST-003'), preTestMapping(NONCRITICAL_ID)],
  });

  it('missing production symbols', () => {
    const r = expectStillBlocked(makeRunFolder(withMapping({ productionSymbols: [] })));
    expect(r.blockingIssueCodes).toContain('CONTEXT_CRITICAL_RESPONSIBILITY_PARTIALLY_MAPPED');
  });

  it('missing changed-surface/production grounding for every responsibility', () => {
    expectStillBlocked(makeRunFolder({ mappings: [...CRITICAL_IDS, NONCRITICAL_ID].map((id) => preTestMapping(id, { productionSymbols: [], unresolvedReasons: ['no production symbol', 'no related test', 'no oracle evidence'] })) }));
  });

  it('missing required contract/validator/constant/error evidence', () => {
    expectStillBlocked(makeRunFolder(withMapping({ contracts: [], unresolvedReasons: ['no contract, validator, or error evidence', 'no related test'] })));
  });

  it('a production-side reason mixed with test-side reasons', () => {
    expectStillBlocked(makeRunFolder(withMapping({ unresolvedReasons: ['no related test', 'no production symbol'] })));
  });

  it('no test runner/infrastructure evidence', () => {
    expectStillBlocked(makeRunFolder(withMapping({ testCommands: [], unresolvedReasons: ['no related test', 'no oracle evidence', 'no test command'] })));
  });

  it('a critical responsibility that is genuinely unmapped', () => {
    const r = expectStillBlocked(makeRunFolder(withMapping({ mappingStatus: 'unmapped', productionSymbols: [], unresolvedReasons: ['no production symbol'] })));
    expect(r.classification).toBe('critical-responsibilities-unmapped');
  });

  it('a critical responsibility with no raw mapping', () => {
    expectStillBlocked(makeRunFolder({ mappings: [preTestMapping('TST-001'), preTestMapping('TST-002')] }));
  });

  it('stale context', () => {
    const o = allPreTest();
    o.capsule = { freshness: { role: 'test-implementation', state: 'stale', comparedIdentities: [] } };
    o.audit = o.capsule;
    expectStillBlocked(makeRunFolder(o));
  });

  it('unknown freshness', () => {
    const o = allPreTest();
    o.capsule = { freshness: { role: 'test-implementation', state: 'unknown', comparedIdentities: [] } };
    o.audit = o.capsule;
    expectStillBlocked(makeRunFolder(o));
  });

  it('repository mismatch', () => {
    const o = allPreTest();
    o.capsule = { index: { indexPath: '/idx', manifestPath: '/idx/manifest.json', projectRoot: '/repo/unrelated' } };
    o.audit = o.capsule;
    const r = expectStillBlocked(makeRunFolder(o), { projectRoot: '/repo/active' });
    expect(r.blockingIssueCodes).toContain('CONTEXT_SOURCE_REPOSITORY_MISMATCH');
  });

  it('declared index identity mismatch', () => {
    const dir = makeRunFolder(allPreTest());
    const packet = path.join(dir, 'artifacts/test-context-packet.txt');
    fs.writeFileSync(packet, fs.readFileSync(packet, 'utf8').replace('Index identity: unknown', 'Index identity: /unrelated/index'), 'utf8');
    const r = expectStillBlocked(dir);
    expect(r.blockingIssueCodes).toContain('CONTEXT_DECLARED_INDEX_IDENTITY_MISMATCH');
  });

  it('capsule/audit disagreement', () => {
    const o = allPreTest();
    o.capsule = {};
    o.audit = { freshness: { role: 'test-implementation', state: 'stale', comparedIdentities: [] } };
    const r = expectStillBlocked(makeRunFolder(o));
    expect(r.blockingIssueCodes).toContain('CONTEXT_SOURCE_SUMMARY_MISMATCH');
  });

  it('required evidence truncation', () => {
    const o = allPreTest();
    o.capsule = { truncation: { truncated: true, records: [{ id: 't', requiredEvidenceLost: true }] } };
    o.audit = o.capsule;
    expectStillBlocked(makeRunFolder(o));
  });

  it('critical responsibility-mapping truncation', () => {
    const r = expectStillBlocked(makeRunFolder({ ...allPreTest(), mappingsTruncated: true }));
    expect(r.blockingIssueCodes).toContain('CONTEXT_RESPONSIBILITY_MAPPINGS_TRUNCATED');
  });

  it('missing provenance', () => {
    const o = allPreTest();
    o.capsule = { provenance: [] };
    o.audit = o.capsule;
    const r = expectStillBlocked(makeRunFolder(o));
    expect(r.blockingIssueCodes).toContain('CONTEXT_PROVENANCE_MISSING');
  });

  it('missing TestStrategyPacket', () => {
    const dir = makeRunFolder(allPreTest());
    fs.rmSync(path.join(dir, 'artifacts/test-strategy-packet.txt'));
    const r = expectStillBlocked(dir);
    expect(r.classification).toBe('test-strategy-missing');
  });

  it('malformed TestStrategyPacket (a responsibility block with no criticality)', () => {
    const noCriticality = `
test responsibility ID: TST-001
traces to: x
setup: x
action or trigger: x
expected result: x
test level: unit
`;
    expectStillBlocked(makeRunFolder(allPreTest(), noCriticality + strategyText([['TST-002', 'critical'], ['TST-003', 'critical']])));
  });

  it('duplicate responsibility ids', () => {
    const r = expectStillBlocked(makeRunFolder(allPreTest(), strategyText([['TST-001', 'critical'], ['TST-001', 'critical'], ['TST-002', 'critical'], ['TST-003', 'critical']])));
    expect(r.classification).toBe('test-responsibility-invalid');
  });

  it('unknown criticality', () => {
    const r = expectStillBlocked(makeRunFolder(allPreTest(), strategyText([['TST-001', 'critical'], ['TST-002', 'maybe'], ['TST-003', 'critical']])));
    expect(r.classification).toBe('test-responsibility-criticality-unknown');
  });

  it('malformed raw mapping evidence', () => {
    const dir = makeRunFolder(allPreTest());
    writeTestEvidence(dir, { mappings: [preTestMapping('TST-001', { productionSymbols: 'oops' }), preTestMapping('TST-002'), preTestMapping('TST-003')] });
    expectStillBlocked(dir);
  });

  it('an unready implementation context is unaffected by the test-context relaxation', () => {
    const dir = makeRunFolder(allPreTest());
    fs.rmSync(path.join(dir, 'artifacts/implementation-context-packet.txt'));
    const summary = evaluateRunContextReadiness({
      mode: 'feature',
      runFolder: dir,
      workflowStageNames: ['implementation', 'test-implementation', 'verification', 'judge'],
      currentStage: 'test-implementation',
    });
    expect(summary.overallDecision).toBe('refresh-required');
    expect(summary.implementationContext?.decision).toBe('refresh-required');
  });
});

describe('evaluateRunContextReadiness: phase by stage', () => {
  const STAGES = ['implementation', 'test-implementation', 'verification', 'judge', 'final-report'];
  const run = (dir: string, currentStage: string | undefined) =>
    evaluateRunContextReadiness({ mode: 'feature', runFolder: dir, workflowStageNames: STAGES, currentStage });

  it('entering test-implementation without a report is ready with pending test evidence', () => {
    const summary = run(makeRunFolder(allPreTest()), 'test-implementation');
    expect(summary.overallDecision).toBe('ready');
    expect(summary.readyWithAssumptions).toBe(true);
    expect(summary.testContext?.deferredTestEvidence).toBeDefined();
  });

  it('once the report exists the strict contract returns', () => {
    const dir = makeRunFolder(allPreTest());
    fs.writeFileSync(path.join(dir, TEST_IMPLEMENTATION_REPORT_ARTIFACT), 'draft', 'utf8');
    const summary = run(dir, 'test-implementation');
    expect(summary.overallDecision).toBe('refresh-required');
    expect(summary.blockingIssueCodes).toContain('CONTEXT_CRITICAL_RESPONSIBILITY_PARTIALLY_MAPPED');
    expect(summary.recommendedNextStage).toBe('test-implementation');
  });

  it.each(['verification', 'judge', 'final-report', undefined, '(complete)', 'unknown-stage'])(
    'never inherits the relaxation for %s (even with no report yet)',
    (stage) => {
      const summary = run(makeRunFolder(allPreTest()), stage);
      expect(summary.overallDecision).toBe('refresh-required');
      expect(summary.testContext?.deferredTestEvidence).toBeUndefined();
    },
  );

  it('refreshed post-test evidence is ready for completion and downstream stages', () => {
    const dir = makeRunFolder({ mappings: [...CRITICAL_IDS, NONCRITICAL_ID].map((id) => postTestMapping(id)) });
    fs.writeFileSync(path.join(dir, TEST_IMPLEMENTATION_REPORT_ARTIFACT), 'report', 'utf8');
    for (const stage of ['test-implementation', 'verification', 'judge']) {
      expect(run(dir, stage).overallDecision).toBe('ready');
    }
  });
});

describe('real defect replay through the CLI: pre-test partial mapping -> entry -> tests -> refresh -> completion', () => {
  function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-bootstrap-cli-'));
  }

  function makeRun(tmp: string, opts: RawOptions): RunMetadata {
    initWorkspace(tmp);
    const meta = createRun({ request: 'bootstrap replay', mode: 'feature', projectRoot: tmp });
    // Real strategy and context evidence first, then the stage placeholders in
    // workflow order (skipping the real TestStrategyPacket) so no downstream
    // artifact is older than its upstream, which would make it stale.
    makeReadyRunFolder(meta.runFolder, 'feature');
    writeTestEvidence(meta.runFolder, opts);
    const idx = meta.stages.findIndex((s) => s.name === 'test-implementation');
    for (const s of meta.stages.slice(0, idx)) {
      const content = s.artifactFile === 'artifacts/test-strategy-packet.txt' ? strategyText() : 'done';
      fs.writeFileSync(path.join(meta.runFolder, s.artifactFile), content, 'utf8');
    }
    return meta;
  }

  // Seven new generic production files, no related tests at pre-test entry.
  const sevenFileSurface = (id: string): Mapping =>
    preTestMapping(id, {
      productionSymbols: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n) => ({ id: `symbol:src/area/${n}.ts#${n}`, itemKind: 'symbol', symbolId: `symbol:src/area/${n}.ts#${n}` })),
    });

  it('walks the whole lifecycle', () => {
    const tmp = makeTempDir();
    try {
      const pre: RawOptions = { mappings: [...CRITICAL_IDS, NONCRITICAL_ID].map(sevenFileSurface) };
      const meta = makeRun(tmp, pre);

      // 1. Pre-test partial mapping: entry allowed everywhere, honestly described.
      const status = runCli(['status', '--root', tmp]).output;
      expect(status).toContain('Pre-test bootstrap');
      expect(status).toContain('NOT completion-eligible');
      expect(status).toContain('0/3 fully mapped');
      const prompt = runCli(['prompt', 'test-implementation', '--root', tmp]).output;
      expect(prompt).not.toContain('BLOCKED on repository context');
      expect(prompt).toContain('Pre-test bootstrap: ENTRY ALLOWED, COMPLETION NOT YET ELIGIBLE.');
      for (const step of [
        '1. Implement the tests required by the existing TestStrategyPacket.',
        '3. After the test files exist, rebuild/refresh test repository context',
        '4. Regenerate the test context capsule and audit',
        '5. Require actual related-test and oracle mapping for every critical responsibility',
        '6. Re-run `my-dev-kit-orchestrator status` and `my-dev-kit-orchestrator check`.',
        '7. Create the TestImplementationReport and mark this stage complete only after post-test readiness is satisfied.',
      ]) {
        expect(prompt).toContain(step);
      }
      expect(runCli(['check', '--root', tmp]).output).toContain('Pre-test bootstrap');

      // 2. Tests written + report created, context NOT refreshed: completion blocked.
      fs.writeFileSync(path.join(meta.runFolder, TEST_IMPLEMENTATION_REPORT_ARTIFACT), 'tests written', 'utf8');
      const mark = runCli(['mark', 'test-implementation-report.txt', '--state', 'complete', '--root', tmp]);
      expect(mark.exitCode).toBe(1);
      const blockedStatus = runCli(['status', '--root', tmp]).output;
      expect(blockedStatus).toContain('CONTEXT_CRITICAL_RESPONSIBILITY_PARTIALLY_MAPPED');
      expect(blockedStatus).not.toContain('Pre-test bootstrap');
      const verification = runCli(['prompt', 'verification', '--root', tmp]).output;
      expect(verification).not.toContain('Pre-test bootstrap');
      expect(verification).toContain('Required context is not ready');

      // 3. Refreshed post-test evidence with related tests, oracle and full mapping.
      writeTestEvidence(meta.runFolder, { mappings: [...CRITICAL_IDS, NONCRITICAL_ID].map(postTestMapping) });
      const complete = runCli(['mark', 'test-implementation-report.txt', '--state', 'complete', '--root', tmp]);
      expect(complete.exitCode).not.toBe(1);
      const afterStatus = runCli(['status', '--root', tmp]).output;
      expect(afterStatus).not.toContain('CONTEXT_CRITICAL_RESPONSIBILITY_PARTIALLY_MAPPED');
      expect(afterStatus).toContain('3/3 fully mapped');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a legacy run without semanticContinuityVersion receives the correction without any run.json mutation', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeRun(tmp, allPreTest());
      const runJsonPath = path.join(meta.runFolder, 'run.json');
      // The CLI persists reconciled currentStage/status as pre-existing
      // bookkeeping; the correction must not add or change any other field
      // (in particular no contract/opt-in field) in run.json.
      const snapshot = () => {
        const parsed = JSON.parse(fs.readFileSync(runJsonPath, 'utf8')) as Record<string, unknown>;
        delete parsed.currentStage;
        delete parsed.status;
        return parsed;
      };
      const before = snapshot();
      expect(before.semanticContinuityVersion).toBeUndefined();
      const prompt = runCli(['prompt', 'test-implementation', '--root', tmp]).output;
      expect(prompt).toContain('Pre-test bootstrap: ENTRY ALLOWED');
      runCli(['status', '--root', tmp]);
      runCli(['check', '--root', tmp]);
      expect(snapshot()).toEqual(before);
      expect(Object.keys(snapshot())).not.toContain('semanticContinuityVersion');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
