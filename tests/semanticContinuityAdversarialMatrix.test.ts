// v1.5.0 Batch 6: compatibility and adversarial matrix for Semantic Continuity.
//
// One integration matrix over the complete v1.5 workflow (activation, evidence
// bridges, whole-chain evaluator, RunIntegrityGate, lifecycle, mark, judge
// integrity, prompts, status/check/export). Test names carry the Batch 6
// category code (A..BW) so the report can map each case.
//
// Unlike Batch 5's command-surface suite, NOTHING is stubbed here: the ordinary
// artifact/contract/trace/prompt checkers, the semantic gate, judge integrity,
// and context readiness are all real, and category BQ also drives the BUILT
// CLI (dist/cli.js) when it exists.

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRun, RunMetadata } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { getWorkflow } from '../src/workflows';
import { WorkflowMode, VALID_MODES } from '../src/types';
import { getArtifactStatePath, readArtifactStateFile, setArtifactManualState } from '../src/artifactLifecycle';
import { resolveArtifactStateWithRunIntegrity, RunIntegrityGateResult, evaluateStageRunIntegrity } from '../src/runIntegrityGate';
import { evaluateJudgeIntegrity, evaluateFinalReportEligibility } from '../src/judgeIntegrity';
import { getNextStageWithRunIntegrity, resolveGateCurrentStage } from '../src/stageDetector';
import { getArtifactSectionRequirements, resolveArtifactKind } from '../src/artifactChecker';
import { parseDeclaredTraceIds } from '../src/traceChecker';
import { isCorrectableStage, parseAndRoute } from '../src/correctionRouter';
import { generateStagePrompt, generateLiveStagePrompt, writeStagePrompts } from '../src/promptGenerator';
import { createProgram } from '../src/program';
import { evaluateSemanticContinuity } from '../src/instructions/semanticContinuity';
import { evaluateImplementationEvidenceBridge, validateImplementationResponsibilities } from '../src/instructions/implementationResponsibilityEvidence';
import { evaluateTestImplementationBridge, validateTestImplementationResponsibilities } from '../src/instructions/testImplementationResponsibilityEvidence';
import { evaluateVerificationAttribution, validateVerificationResponsibilities } from '../src/instructions/verificationResponsibilityEvidence';
import { validateSemanticResponsibilities } from '../src/instructions/semanticResponsibility';
import { readRawContextCapsule } from '../src/instructions/myDevKitEvidenceSummary';
import { runCli } from './cliTestHelpers';
import { makeReadyRunFolder } from './readyContextTestHelpers';
import {
  gateAt,
  goodMapping,
  implBlock,
  makeSemanticRun,
  SemanticRunOptions,
  settleArtifactTimes,
  strategyBlock,
  testBlock,
  verBlock,
  writePriorArtifacts,
} from './semanticRunTestHelpers';

// ─── Fixture helpers ────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, '..');
const DIST_CLI = path.join(ROOT, 'dist', 'cli.js');
const FIRE_CODE = 'SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED';

function withRun<T>(opts: SemanticRunOptions, fn: (meta: RunMetadata, tmp: string) => T, prefix = 'mdko-adv-'): T {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return fn(makeSemanticRun(tmp, opts), tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const join = (...blocks: string[]): string => blocks.join('\n');
const crit = (id: string, traces?: string): string => strategyBlock(id, { criticality: 'critical', ...(traces ? { traces } : {}) });
const nonc = (id: string, traces?: string): string => strategyBlock(id, { criticality: 'noncritical', ...(traces ? { traces } : {}) });
const sym = (id: string) => ({ id, itemKind: 'symbol', path: id.slice('symbol:'.length).split('#')[0] });
const tf = (p: string) => ({ id: p, itemKind: 'test-file', path: p });
const mp = (id: string, o: { prod?: unknown[]; tests?: unknown[] } = {}): Record<string, unknown> => ({
  responsibilityId: id,
  mappingStatus: 'mapped',
  productionSymbols: o.prod ?? [sym('symbol:src/a.ts#run')],
  proposedOrExistingTestFiles: o.tests ?? [tf('tests/a.spec.ts')],
});

function rawCapsule(role: string, mappings: unknown[], truncated = false): string {
  return JSON.stringify({
    schemaVersion: '1.0.0',
    tool: { name: 'my-dev-kit', version: '1.12.4' },
    index: { indexPath: '/idx', manifestPath: '/idx/manifest.json' },
    request: { role },
    roleContext: { role },
    roleAdequacy: { status: 'context sufficient for implementation' },
    freshness: { role, state: 'fresh', comparedIdentities: [{ label: 'afterIndexPath', value: '/idx' }] },
    responsibilityMappings: { mappings, truncated },
    truncation: { truncated: false, records: [] },
    fullFileFallback: { used: 0 },
    provenance: [{ id: 'p1' }],
    warnings: [],
  });
}

// Replaces one context kind's raw capsule + audit (kept identical, as the ready fixture does).
function setCapsule(meta: RunMetadata, kind: 'implementation' | 'test', mappings: unknown[], truncated = false): void {
  const role = kind === 'implementation' ? 'implementation' : 'test-implementation';
  for (const suffix of ['capsule', 'audit']) {
    fs.writeFileSync(path.join(meta.runFolder, `${kind}-${suffix}.json`), rawCapsule(role, mappings, truncated), 'utf8');
  }
}

function srcCodes(gate: RunIntegrityGateResult): string[] {
  return (gate.semanticContinuity?.issues ?? []).map((i) => i.sourceIssueCode ?? i.code);
}
function respOf(gate: RunIntegrityGateResult, id: string) {
  const r = gate.semanticContinuity?.responsibilities.find((x) => x.responsibilityId === id);
  if (!r) throw new Error(`responsibility ${id} not in continuity result`);
  return r;
}
function judgeOf(meta: RunMetadata, stage: string, text?: string) {
  if (text !== undefined) fs.writeFileSync(path.join(meta.runFolder, 'artifacts', 'judge-report.txt'), text, 'utf8');
  const gate = gateAt(meta, stage);
  const integrity = evaluateJudgeIntegrity({ gate, runFolder: meta.runFolder, mode: meta.mode });
  const eligibility = evaluateFinalReportEligibility({
    gate,
    judgeIntegrity: integrity,
    runFolder: meta.runFolder,
    stages: meta.stages,
    stateFile: readArtifactStateFile(meta.runFolder),
    proofOnly: meta.proofOnly === true,
    verificationResponsibility: meta.verificationResponsibility,
  });
  return { gate, integrity, eligibility };
}
function field(text: string, label: string): string | undefined {
  const m = new RegExp(`${label}:\\s*(.+)`).exec(text);
  return m ? m[1].trim() : undefined;
}
function snapshotFiles(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out[path.relative(dir, full)] = fs.readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return out;
}

// ─── A. legacy v1.4.1 compatibility ─────────────────────────────────────────

describe('A. legacy absent-version runs', () => {
  it('A1: RSP-looking artifacts never activate the contract anywhere', () => {
    withRun({ version: null, ver: null }, (meta, tmp) => {
      writePriorArtifacts(meta, 'judge');
      expect(meta.semanticContinuityVersion).toBeUndefined();
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticContinuityRequired).toBe(false);
      expect(gate.semanticContinuityClassification).toBe('not-required');
      expect(gate.expectedJudgeVerdict).toBe('PASS');
      expect(gate.semanticBlockedStageNames).toEqual([]);
      for (const stage of meta.stages) {
        const p = generateStagePrompt(meta, stage.name);
        expect(p).not.toContain('SEMANTIC CONTINUITY');
      }
      expect(runCli(['status', '--root', tmp]).output).not.toContain('Semantic continuity');
      expect(runCli(['check', '--all', '--root', tmp]).output).not.toContain('Semantic continuity');
      expect(runCli(['export', '--root', tmp]).output).not.toContain('Semantic continuity');
    });
  });

  it('A2: lifecycle, mark, judge, and final-report eligibility are unchanged', () => {
    withRun({ version: null, impl: null, test: null, ver: null }, (meta, tmp) => {
      writePriorArtifacts(meta, 'final-report');
      const gate = gateAt(meta, 'final-report');
      expect(resolveArtifactStateWithRunIntegrity(meta.runFolder, 'artifacts/test-implementation-report.txt', meta.stages, readArtifactStateFile(meta.runFolder), gate)).toBe('complete');
      const { integrity, eligibility } = judgeOf(meta, 'final-report', 'Verdict: PASS');
      expect(integrity.judgeVerdictAccepted).toBe(true);
      expect(eligibility.eligible).toBe(true);
      // Manual mark of a gap-carrying artifact is accepted exactly as before v1.5.
      const mark = runCli(['mark', 'test-implementation-report.txt', '--state', 'complete', '--root', tmp]);
      expect(mark.exitCode).toBeUndefined();
    });
  });

  it('A3: arbitrary legacy responsibility IDs remain usable by the legacy context path', () => {
    withRun({ version: null, strategy: crit('TST-LEGACY-1'), mappings: [mp('TST-LEGACY-1')], impl: null, test: null, ver: null }, (meta) => {
      writePriorArtifacts(meta, 'test-implementation');
      const gate = gateAt(meta, 'test-implementation');
      expect(gate.contextReady).toBe(true);
      expect(gate.semanticContinuityRequired).toBe(false);
    });
  });

  it('A4: malformed/canonical-looking RSP text in a legacy strategy does not activate', () => {
    for (const id of ['RSP-01', 'rsp-001', 'RESP-001', 'RSP001']) {
      withRun({ version: null, strategy: crit(id), mappings: [mp(id)] }, (meta) => {
        const gate = gateAt(meta, 'judge');
        expect(gate.semanticContinuityRequired).toBe(false);
        expect(gate.semanticContinuityBlockingCodes).toEqual([]);
        expect(gate.contextReady).toBe(true);
      });
    }
  });
});

// ─── B. unsupported version ─────────────────────────────────────────────────

describe('B. unsupported contract version', () => {
  it('B1: fails closed everywhere and refuses every bypass', () => {
    withRun({ version: '999.0.0' }, (meta, tmp) => {
      writePriorArtifacts(meta, 'judge');
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticContinuityClassification).toBe('blocked');
      expect(gate.expectedJudgeVerdict).toBe('NEED_CONTEXT');
      expect(gate.recommendedCorrectionStage).toBeNull();
      expect(gate.semanticRecommendedCorrectionStage).toBeNull();

      const prompt = runCli(['prompt', '--root', tmp]).output;
      expect(prompt).toContain('external / run-contract resolution is required');
      expect(prompt).not.toContain('Required output artifact');
      expect(prompt).not.toContain('Correction task');

      const statePath = getArtifactStatePath(meta.runFolder);
      const before = fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf8') : null;
      const mark = runCli(['mark', 'judge-report.txt', '--state', 'complete', '--root', tmp]);
      expect(mark.exitCode).toBe(1);
      expect(fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf8') : null).toBe(before);

      const pass = judgeOf(meta, 'final-report', 'Verdict: PASS');
      expect(pass.integrity.judgeVerdictAccepted).toBe(false);
      expect(pass.eligibility.eligible).toBe(false);
      const needContext = judgeOf(meta, 'final-report', 'Verdict: NEED_CONTEXT\nRecommended next stage: architecture-context');
      expect(needContext.integrity.acceptedCorrectionStage).toBeNull();
      expect(needContext.integrity.correctionRequired).toBe(false);
      expect(needContext.eligibility.eligible).toBe(false);

      const status = runCli(['status', '--root', tmp]).output;
      const check = runCli(['check', '--all', '--root', tmp]);
      const exported = runCli(['export', '--root', tmp]).output;
      expect(field(status, 'Semantic classification')).toBe('blocked');
      expect(check.output).toContain('[fail] Semantic continuity 999.0.0: blocked');
      expect(check.exitCode).toBe(1);
      expect(field(exported, 'semanticClassification')).toBe('blocked');
      expect(field(exported, 'recommendedCorrectionStage')).toBe('(none)');
      expect(field(exported, 'expectedJudgeVerdict')).toBe('NEED_CONTEXT');
    });
  });
});

// ─── C/D. complete chains ───────────────────────────────────────────────────

describe.each([
  ['C', 'critical'],
  ['D', 'noncritical'],
] as const)('%s. fully complete %s responsibility', (code, criticality) => {
  it(`${code}1: ready, PASS expected, authored PASS accepted, final report eligible`, () => {
    withRun({ strategy: strategyBlock('RSP-001', { criticality }) }, (meta) => {
      writePriorArtifacts(meta, 'final-report');
      const { gate, integrity, eligibility } = judgeOf(meta, 'final-report', 'Verdict: PASS');
      expect(gate.semanticContinuityClassification).toBe('ready');
      expect(gate.runIntegrityReady).toBe(true);
      expect(gate.expectedJudgeVerdict).toBe('PASS');
      expect(gate.semanticContinuity?.state).toBe('complete');
      expect(respOf(gate, 'RSP-001')).toMatchObject({
        strategyState: 'satisfied',
        implementationState: 'satisfied',
        testImplementationState: 'satisfied',
        verificationState: 'satisfied',
        state: 'complete',
      });
      expect(integrity.judgeVerdictAccepted).toBe(true);
      expect(eligibility.eligible).toBe(true);
    });
  });
});

// ─── E. mixed ───────────────────────────────────────────────────────────────

const MIXED: SemanticRunOptions = {
  strategy: join(crit('RSP-001'), crit('RSP-002'), nonc('RSP-003')),
  impl: join(implBlock('RSP-001'), implBlock('RSP-002'), implBlock('RSP-003')),
  test: join(testBlock('RSP-001'), testBlock('RSP-002'), testBlock('RSP-003')),
  ver: join(verBlock('RSP-001'), verBlock('RSP-002')),
  mappings: [mp('RSP-001'), mp('RSP-002'), mp('RSP-003')],
};

describe('E. mixed critical and noncritical', () => {
  it('E1: a noncritical gap warns without blocking and PASS is accepted', () => {
    withRun(MIXED, (meta) => {
      writePriorArtifacts(meta, 'final-report');
      const { gate, integrity } = judgeOf(meta, 'final-report', 'Verdict: PASS');
      expect(gate.semanticContinuityClassification).toBe('warning');
      expect(gate.runIntegrityReady).toBe(true);
      expect(gate.expectedJudgeVerdict).toBe('PASS');
      expect(gate.semanticContinuityWarningResponsibilityIds).toEqual(['RSP-003']);
      expect(gate.semanticContinuityBlockingResponsibilityIds).toEqual([]);
      expect(respOf(gate, 'RSP-001').state).toBe('complete');
      expect(respOf(gate, 'RSP-002').state).toBe('complete');
      expect(respOf(gate, 'RSP-003').state).toBe('incomplete');
      expect(integrity.judgeVerdictAccepted).toBe(true);
    });
  });
});

// ─── F..P implementation / test / verification gaps ─────────────────────────

describe('F. critical implementation declaration missing', () => {
  it('F1: blocks test-implementation; the implementation target stays actionable', () => {
    withRun({ impl: 'no responsibility blocks\n', test: null, ver: null }, (meta) => {
      writePriorArtifacts(meta, 'test-implementation');
      const gate = gateAt(meta, 'test-implementation');
      expect(gate.semanticContinuityClassification).toBe('blocked');
      expect(gate.primarySemanticBlocker).toMatchObject({ leg: 'implementation', responsibilityId: 'RSP-001', recommendedCorrectionStage: 'implementation' });
      expect(respOf(gate, 'RSP-001').implementationState).toBe('missing');
      expect(evaluateStageRunIntegrity(gate, 'test-implementation')).toMatchObject({ semanticBlocked: true, stageMayRenderNormalPrompt: false });
      expect(evaluateStageRunIntegrity(gate, 'implementation')).toMatchObject({ blocked: false, stageMayRenderNormalPrompt: true });
    });
  });
});

describe('G/H/I/J. implementation evidence corroboration', () => {
  const gateWith = (opts: SemanticRunOptions, prod: unknown[] | null, truncated = false) =>
    withRun({ ...opts }, (meta) => {
      if (prod !== null) setCapsule(meta, 'implementation', [mp('RSP-001', { prod })]);
      else setCapsule(meta, 'implementation', [], truncated);
      return gateAt(meta, 'judge');
    });

  it('G1: partially-corroborated is incomplete and blocks, naming the unmatched reference', () => {
    const impl = 'implementation responsibility ID: RSP-001\nproduction file: src/a.ts\nproduction symbol: symbol:src/a.ts#run\n';
    const gate = gateWith({ impl }, [{ id: 'symbol:src/a.ts#run', itemKind: 'symbol' }]);
    expect(respOf(gate, 'RSP-001').implementationState).toBe('partial');
    expect(respOf(gate, 'RSP-001').state).toBe('incomplete');
    expect(gate.semanticContinuityClassification).toBe('blocked');
    withRun({ impl }, (meta) => {
      setCapsule(meta, 'implementation', [mp('RSP-001', { prod: [{ id: 'symbol:src/a.ts#run', itemKind: 'symbol' }] })]);
      const bridge = evaluateImplementationEvidenceBridge({
        semanticResponsibilities: validateSemanticResponsibilities(crit('RSP-001')).responsibilities,
        declarations: validateImplementationResponsibilities(impl).declarations,
        evidence: { responsibilityMappings: [mp('RSP-001', { prod: [{ id: 'symbol:src/a.ts#run', itemKind: 'symbol' }] }) as never], responsibilityMappingsTruncated: false },
      });
      expect(bridge.issues.map((i) => [i.code, i.context])).toEqual([['IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_UNCORROBORATED', 'src/a.ts']]);
    });
  });

  it('H1: uncorroborated (same-ID mapping, nothing matches) blocks', () => {
    const gate = gateWith({}, [sym('symbol:other/z.ts#zzz')]);
    expect(respOf(gate, 'RSP-001').implementationState).toBe('unsatisfied');
    expect(gate.semanticContinuityClassification).toBe('blocked');
    // The exact unmatched reference is visible on the bridge result (see G1); gate-level state is the leg state.
    expect(respOf(gate, 'RSP-001').state).toBe('incomplete');
  });

  it('I1: missing producer mapping is indeterminate and blocks with the MISSING source code', () => {
    const gate = gateWith({}, null);
    expect(respOf(gate, 'RSP-001').implementationState).toBe('indeterminate');
    expect(respOf(gate, 'RSP-001').state).toBe('indeterminate');
    expect(gate.semanticContinuityClassification).toBe('blocked');
  });

  it('I2/J1: missing and truncated producer mappings keep distinct source codes (bridge and adapter)', () => {
    const semantic = validateSemanticResponsibilities(crit('RSP-001')).responsibilities;
    const declarations = validateImplementationResponsibilities(implBlock('RSP-001')).declarations;
    const codeFor = (truncated: boolean) =>
      evaluateImplementationEvidenceBridge({ semanticResponsibilities: semantic, declarations, evidence: { responsibilityMappings: [], responsibilityMappingsTruncated: truncated } }).issues.map((i) => i.code);
    expect(codeFor(false)).toEqual(['IMPLEMENTATION_RESPONSIBILITY_PRODUCER_MAPPING_MISSING']);
    expect(codeFor(true)).toEqual(['IMPLEMENTATION_RESPONSIBILITY_PRODUCER_MAPPING_TRUNCATED']);
    const testDecl = validateTestImplementationResponsibilities(testBlock('RSP-001')).declarations;
    const testCode = (truncated: boolean) =>
      evaluateTestImplementationBridge({ semanticResponsibilities: semantic, declarations: testDecl, evidence: { responsibilityMappings: [], responsibilityMappingsTruncated: truncated } }).issues.map((i) => i.code);
    expect(testCode(false)).toEqual(['TEST_IMPLEMENTATION_RESPONSIBILITY_PRODUCER_MAPPING_MISSING']);
    expect(testCode(true)).toEqual(['TEST_IMPLEMENTATION_RESPONSIBILITY_PRODUCER_MAPPING_TRUNCATED']);
  });

  it('J2: a truncated producer report reaches the run adapter as a blocking, non-satisfied leg', () => {
    withRun({}, (meta) => {
      setCapsule(meta, 'implementation', [], true);
      const gate = gateAt(meta, 'judge');
      // Implementation-role readiness does not consider mapping truncation; the semantic bridge does.
      expect(gate.contextReady).toBe(true);
      expect(respOf(gate, 'RSP-001').implementationState).toBe('indeterminate');
      expect(gate.semanticContinuityClassification).toBe('blocked');
      expect(gate.runIntegrityReady).toBe(false);
      expect(gate.expectedJudgeVerdict).toBe('NEED_CONTEXT');
    });
  });
});

describe('K/L. test declaration and evidence gaps', () => {
  it('K1: missing critical test declaration blocks verification and corrects test-implementation', () => {
    withRun({ test: 'nothing declared\n', ver: null }, (meta) => {
      writePriorArtifacts(meta, 'verification');
      const gate = gateAt(meta, 'verification');
      expect(gate.primarySemanticBlocker).toMatchObject({ leg: 'test-implementation', recommendedCorrectionStage: 'test-implementation' });
      expect(gate.semanticBlockedStageNames).toEqual(['verification']);
      expect(respOf(gate, 'RSP-001').testImplementationState).toBe('missing');
    });
  });

  it('L1: partial / uncorroborated / mapping unavailable are distinct and blocking', () => {
    const partial = 'test implementation responsibility ID: RSP-001\ntest file: tests/a.spec.ts\ntest file: tests/b.spec.ts\n';
    withRun({ test: partial }, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(respOf(gate, 'RSP-001').testImplementationState).toBe('partial');
      expect(gate.semanticContinuityClassification).toBe('blocked');
      expect(respOf(gate, 'RSP-001').state).toBe('incomplete');
    });
    withRun({}, (meta) => {
      setCapsule(meta, 'test', [mp('RSP-001', { tests: [tf('tests/other.spec.ts')] })]);
      const gate = gateAt(meta, 'judge');
      expect(respOf(gate, 'RSP-001').testImplementationState).toBe('unsatisfied');
      expect(gate.semanticContinuityClassification).toBe('blocked');
    });
    withRun({}, (meta) => {
      setCapsule(meta, 'test', [mp('RSP-009')]);
      const gate = gateAt(meta, 'judge');
      expect(gate.runIntegrityReady).toBe(false);
    });
    // Bridge level: no test-symbol inference; a symbol-only producer item never matches a declared file.
    const bridge = evaluateTestImplementationBridge({
      semanticResponsibilities: validateSemanticResponsibilities(crit('RSP-001')).responsibilities,
      declarations: validateTestImplementationResponsibilities('test implementation responsibility ID: RSP-001\ntest file: tests/a.spec.ts\n').declarations,
      evidence: { responsibilityMappings: [{ responsibilityId: 'RSP-001', mappingStatus: 'mapped', proposedOrExistingTestFiles: [] } as never], responsibilityMappingsTruncated: false },
    });
    expect(bridge.responsibilities[0].state).toBe('uncorroborated');
  });
});

describe('M/N/O/P. verification legs', () => {
  it('M1: missing critical verification blocks judge and corrects verification', () => {
    withRun({ ver: 'no verification blocks\n' }, (meta) => {
      writePriorArtifacts(meta, 'judge');
      const gate = gateAt(meta, 'judge');
      expect(gate.primarySemanticBlocker).toMatchObject({ leg: 'verification', recommendedCorrectionStage: 'verification' });
      expect(gate.semanticBlockedStageNames).toEqual(['judge']);
      expect(gate.expectedJudgeVerdict).toBe('NEED_CONTEXT');
    });
  });

  it('N1: verification status fail with valid evidence is failed/failed and blocks (no exit-code reinterpretation)', () => {
    withRun({ ver: verBlock('RSP-001', 'fail', '1') }, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(respOf(gate, 'RSP-001')).toMatchObject({ verificationState: 'failed', state: 'failed' });
      expect(gate.semanticContinuityClassification).toBe('blocked');
      expect(gate.semanticContinuityBlockingResponsibilityIds).toEqual(['RSP-001']);
    });
    // Declared status wins over exit code: "fail" with exit code 0 stays failed (diagnostic only).
    withRun({ ver: verBlock('RSP-001', 'fail', '0') }, (meta) => {
      expect(respOf(gateAt(meta, 'judge'), 'RSP-001').verificationState).toBe('failed');
    });
  });

  it('O1: verification blocked with a reason is blocked and blocks', () => {
    withRun({ ver: verBlock('RSP-001', 'blocked') }, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(respOf(gate, 'RSP-001')).toMatchObject({ verificationState: 'blocked', state: 'blocked' });
      expect(gate.semanticContinuityClassification).toBe('blocked');
    });
  });

  it('P1: verification skipped is incomplete: critical blocks, noncritical warns', () => {
    withRun({ ver: verBlock('RSP-001', 'skipped') }, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(respOf(gate, 'RSP-001').state).toBe('incomplete');
      expect(gate.semanticContinuityClassification).toBe('blocked');
    });
    withRun({ strategy: nonc('RSP-001'), ver: verBlock('RSP-001', 'skipped') }, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticContinuityClassification).toBe('warning');
      expect(gate.expectedJudgeVerdict).toBe('PASS');
    });
  });

  it('Q1/BH1: a pass with all-nonzero exit codes is a warning-only diagnostic, surfaced consistently', () => {
    withRun({ ver: verBlock('RSP-001', 'pass', '3') }, (meta, tmp) => {
      writePriorArtifacts(meta, 'final-report');
      const gate = gateAt(meta, 'final-report');
      expect(gate.semanticContinuity?.diagnostics.map((d) => d.sourceIssueCode)).toEqual(['VERIFICATION_RESPONSIBILITY_STATUS_EVIDENCE_INCONSISTENT']);
      expect(respOf(gate, 'RSP-001').verificationState).toBe('satisfied');
      expect(gate.semanticContinuityClassification).toBe('warning');
      expect(gate.semanticContinuityBlockingResponsibilityIds).toEqual([]);
      expect(gate.expectedJudgeVerdict).toBe('PASS');
      expect(gate.runIntegrityReady).toBe(true);
      expect(field(runCli(['status', '--root', tmp]).output, 'Semantic classification')).toBe('warning');
      expect(runCli(['check', '--all', '--root', tmp]).output).toContain('[warn] Semantic continuity');
      expect(field(runCli(['export', '--root', tmp]).output, 'semanticClassification')).toBe('warning');
      expect(field(runCli(['export', '--root', tmp]).output, 'warningCodes')).toContain('VERIFICATION_RESPONSIBILITY_STATUS_EVIDENCE_INCONSISTENT');
    });
  });
});

// ─── R/S/AS/AT strategy identity and structure ──────────────────────────────

describe('R. malformed canonical RSP identity', () => {
  it.each(['RSP-01', 'rsp-001', 'RESP-001', 'RSP001'])('R1: activated strategy with "%s" is structurally invalid', (id) => {
    withRun({ strategy: crit(id), impl: null, test: null, ver: null }, (meta) => {
      writePriorArtifacts(meta, 'implementation');
      const gate = gateAt(meta, 'implementation');
      expect(gate.semanticContinuityClassification).toBe('blocked');
      expect(srcCodes(gate)).toContain('SEMANTIC_RESPONSIBILITY_ID_INVALID');
    });
  });
});

describe('S. duplicate canonical RSP', () => {
  it('S1: duplicate declarations are reported deterministically and never merged', () => {
    const strategy = join(crit('RSP-001'), strategyBlock('RSP-001', { criticality: 'noncritical' }));
    withRun({ strategy }, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticContinuity?.state).toBe('invalid');
      expect(srcCodes(gate)).toContain('SEMANTIC_RESPONSIBILITY_DUPLICATE');
      expect(gate.semanticContinuityClassification).toBe('blocked');
      // First parsed declaration remains authoritative (critical), not merged/overridden.
      const parsed = validateSemanticResponsibilities(strategy);
      expect(parsed.duplicateResponsibilityIds).toEqual(['RSP-001']);
      expect(parsed.responsibilities[0].criticality).toBe('critical');
    });
  });
});

describe('AS. unclassified responsibility', () => {
  it('AS1: missing or invalid criticality blocks and is never defaulted to noncritical', () => {
    for (const strategy of [strategyBlock('RSP-001', { criticality: '' }), strategyBlock('RSP-001', { criticality: 'important' })]) {
      withRun({ strategy }, (meta) => {
        const gate = gateAt(meta, 'judge');
        expect(gate.semanticContinuityClassification).toBe('blocked');
        expect(gate.semanticContinuityWarningResponsibilityIds).toEqual([]);
        expect(gate.semanticContinuity?.summary.noncriticalResponsibilities).toBe(0);
      });
    }
  });
});

describe('AT. zero active responsibilities', () => {
  it('AT1: pending before the strategy stage passes, blocking after', () => {
    withRun({ strategy: 'no blocks here\n', impl: null, test: null, ver: null }, (meta) => {
      const early = gateAt(meta, 'test-strategy');
      expect(early.semanticContinuity?.state).toBe('pending');
      expect(early.semanticContinuityClassification).toBe('ready');
      const late = gateAt(meta, 'implementation');
      expect(srcCodes(late)).toContain('SEMANTIC_CONTINUITY_RESPONSIBILITIES_MISSING');
      expect(late.semanticContinuityClassification).toBe('blocked');
      expect(late.primarySemanticBlocker?.primaryCode).toBe('SEMANTIC_CONTINUITY_GLOBAL_INTEGRITY_INVALID');
      expect(late.semanticRecommendedCorrectionStage).toBe('test-strategy');
    });
  });
});

// ─── T/U/V orphans and phase-inactive malformed evidence ────────────────────

describe('T/U/V. orphan declarations', () => {
  it('T1: implementation orphan blocks only once the implementation leg is active', () => {
    const impl = join(implBlock('RSP-001'), implBlock('RSP-999'));
    withRun({ impl, test: null, ver: null }, (meta) => {
      writePriorArtifacts(meta, 'implementation');
      expect(gateAt(meta, 'implementation').semanticContinuityClassification).toBe('ready');
      const active = gateAt(meta, 'test-implementation');
      expect(srcCodes(active)).toContain('IMPLEMENTATION_RESPONSIBILITY_ORPHAN');
      expect(active.semanticContinuityBlockingCodes).toContain('SEMANTIC_CONTINUITY_GLOBAL_INTEGRITY_INVALID');
      expect(active.semanticContinuity?.issues.some((i) => i.code === 'SEMANTIC_CONTINUITY_ORPHAN_DECLARATION')).toBe(true);
    });
  });

  it('U1: test orphan is inactive until the test leg is active', () => {
    const test = join(testBlock('RSP-001'), testBlock('RSP-999'));
    withRun({ test, ver: null }, (meta) => {
      expect(gateAt(meta, 'test-implementation').semanticContinuityClassification).toBe('ready');
      const gate = gateAt(meta, 'verification');
      expect(gate.semanticContinuityClassification).toBe('blocked');
      expect(gate.semanticContinuity?.issues.some((i) => i.code === 'SEMANTIC_CONTINUITY_ORPHAN_DECLARATION' && i.leg === 'test-implementation')).toBe(true);
    });
  });

  it('V1: verification orphan is inactive until the verification leg is active', () => {
    const ver = join(verBlock('RSP-001'), verBlock('RSP-999'));
    withRun({ ver }, (meta) => {
      expect(gateAt(meta, 'verification').semanticContinuityClassification).toBe('ready');
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticContinuityClassification).toBe('blocked');
      expect(gate.semanticContinuity?.issues.some((i) => i.code === 'SEMANTIC_CONTINUITY_ORPHAN_DECLARATION' && i.leg === 'verification')).toBe(true);
    });
  });
});

// ─── W/X/Y upstream traces ──────────────────────────────────────────────────

describe('W. missing upstream trace', () => {
  it('W1: critical blocks, noncritical attributable invalidity warns', () => {
    withRun({ strategy: crit('RSP-001', 'BEH-999') }, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(respOf(gate, 'RSP-001').strategyState).toBe('invalid');
      expect(respOf(gate, 'RSP-001').missingUpstreamTraceIds).toEqual(['BEH-999']);
      expect(srcCodes(gate)).toContain('SEMANTIC_CONTINUITY_UPSTREAM_TRACE_MISSING');
      expect(gate.semanticContinuityClassification).toBe('blocked');
      expect(gate.semanticRecommendedCorrectionStage).toBe('test-strategy');
    });
    withRun({ strategy: nonc('RSP-001', 'BEH-999') }, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticContinuityClassification).toBe('warning');
      expect(gate.expectedJudgeVerdict).toBe('PASS');
    });
  });
});

describe('X. TRN arrow declaration regression', () => {
  it('X1: a declaration containing "->" declares; a link line does not', () => {
    const ids = (t: string) => parseDeclaredTraceIds(t).map((x) => x.id);
    expect(ids('TRN-001: invalid-input -> validation-error\n')).toEqual(['TRN-001']);
    expect(ids('- TRN-002: a -> b\n')).toEqual(['TRN-002']);
    expect(ids('BEH-001 -> TST-001\n')).toEqual([]);
    expect(ids('REQ-001 -> BEH-999\nTRN-003: idle -> busy\n')).toEqual(['TRN-003']);
    expect(ids('see BEH-004: not at line start\n')).toEqual([]);
  });

  it('X2: traces to TRN-001 resolves end to end', () => {
    withRun({ upstream: 'REQ-001: r\nBEH-002: b\nTRN-001: invalid-input -> validation-error\n', strategy: crit('RSP-001', 'TRN-001') }, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(respOf(gate, 'RSP-001').missingUpstreamTraceIds).toEqual([]);
      expect(gate.semanticContinuityClassification).toBe('ready');
    });
  });

  it('X3: a link-only mention does not satisfy an upstream trace', () => {
    withRun({ upstream: 'REQ-001: r\nBEH-002: b\nBEH-001 -> TST-001\n', strategy: crit('RSP-001', 'TST-001') }, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(srcCodes(gate)).toContain('SEMANTIC_RESPONSIBILITY_TRACE_PREFIX_INVALID');
      expect(gate.semanticContinuityClassification).toBe('blocked');
    });
    withRun({ upstream: 'REQ-001: r\nBEH-002: b\nREQ-001 -> BEH-777\n', strategy: crit('RSP-001', 'BEH-777') }, (meta) => {
      expect(srcCodes(gateAt(meta, 'judge'))).toContain('SEMANTIC_CONTINUITY_UPSTREAM_TRACE_MISSING');
    });
  });
});

describe('Y. case-sensitive upstream identity', () => {
  it('Y1: beh-001 does not resolve BEH-001', () => {
    withRun({ upstream: 'REQ-001: r\nBEH-001: b\n', strategy: crit('RSP-001', 'beh-001') }, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticContinuityClassification).toBe('blocked');
      expect(srcCodes(gate).some((c) => c === 'SEMANTIC_RESPONSIBILITY_TRACE_INVALID' || c === 'SEMANTIC_CONTINUITY_UPSTREAM_TRACE_MISSING')).toBe(true);
    });
  });
});

// ─── Z/AA/BK/BL exact matching and path policy ──────────────────────────────

describe('Z/AA/BK/BL. exact identity matching', () => {
  const implOf = (file: string) => `implementation responsibility ID: RSP-001\nproduction file: ${file}\n`;
  const testOf = (file: string) => `test implementation responsibility ID: RSP-001\ntest file: ${file}\n`;

  it('Z1: same basename in a different directory never matches (production and test)', () => {
    withRun({ impl: implOf('src/a.ts') }, (meta) => {
      setCapsule(meta, 'implementation', [mp('RSP-001', { prod: [{ id: 'other/a.ts', itemKind: 'file', path: 'other/a.ts' }] })]);
      expect(respOf(gateAt(meta, 'judge'), 'RSP-001').implementationState).toBe('unsatisfied');
    });
    withRun({ test: testOf('tests/a.spec.ts') }, (meta) => {
      setCapsule(meta, 'test', [mp('RSP-001', { tests: [tf('other/a.spec.ts')] })]);
      expect(respOf(gateAt(meta, 'judge'), 'RSP-001').testImplementationState).toBe('unsatisfied');
    });
  });

  it('Z2: suffix / prefix / substring paths never match', () => {
    for (const producer of ['x/src/a.ts', 'src/a.ts.bak', 'src/a.t', 'src']) {
      withRun({ impl: implOf('src/a.ts') }, (meta) => {
        setCapsule(meta, 'implementation', [mp('RSP-001', { prod: [{ id: producer, itemKind: 'file', path: producer }] })]);
        expect(respOf(gateAt(meta, 'judge'), 'RSP-001').implementationState).toBe('unsatisfied');
      });
    }
  });

  it('AA1: same symbol name in a different file never matches', () => {
    withRun({ impl: 'implementation responsibility ID: RSP-001\nproduction symbol: symbol:src/b.ts#run\n' }, (meta) => {
      setCapsule(meta, 'implementation', [mp('RSP-001', { prod: [sym('symbol:src/a.ts#run')] })]);
      expect(respOf(gateAt(meta, 'judge'), 'RSP-001').implementationState).toBe('unsatisfied');
    });
  });

  it('BK1: Windows separators normalize to the same identity', () => {
    withRun({ impl: implOf('src\\config\\schema.ts'), test: testOf('tests\\config\\validate.spec.ts') }, (meta) => {
      setCapsule(meta, 'implementation', [mp('RSP-001', { prod: [{ id: 'src/config/schema.ts', itemKind: 'file', path: 'src/config/schema.ts' }] })]);
      setCapsule(meta, 'test', [mp('RSP-001', { tests: [tf('tests/config/validate.spec.ts')] })]);
      const r = respOf(gateAt(meta, 'judge'), 'RSP-001');
      expect(r.implementationState).toBe('satisfied');
      expect(r.testImplementationState).toBe('satisfied');
    });
  });

  it('BL1: path case is significant', () => {
    withRun({ impl: implOf('src/Config/schema.ts'), test: testOf('tests/Config/v.spec.ts') }, (meta) => {
      setCapsule(meta, 'implementation', [mp('RSP-001', { prod: [{ id: 'src/config/schema.ts', itemKind: 'file', path: 'src/config/schema.ts' }] })]);
      setCapsule(meta, 'test', [mp('RSP-001', { tests: [tf('tests/config/v.spec.ts')] })]);
      const r = respOf(gateAt(meta, 'judge'), 'RSP-001');
      expect(r.implementationState).toBe('unsatisfied');
      expect(r.testImplementationState).toBe('unsatisfied');
    });
  });

  it('BJ1: traversal / absolute / drive / URL paths are structurally invalid (production and test)', () => {
    for (const bad of ['../escape.ts', 'C:\\absolute\\a.ts', '/absolute/a.ts', 'https://example.com/a.ts']) {
      withRun({ impl: implOf(bad), test: testOf(bad) }, (meta) => {
        const gate = gateAt(meta, 'judge');
        expect(srcCodes(gate)).toContain('IMPLEMENTATION_RESPONSIBILITY_FILE_INVALID');
        expect(srcCodes(gate)).toContain('TEST_IMPLEMENTATION_RESPONSIBILITY_FILE_INVALID');
        expect(gate.semanticContinuityClassification).toBe('blocked');
      });
    }
  });

  it('BM1: paths with spaces parse, match, and survive CLI rendering', () => {
    withRun(
      { impl: implOf('src/my dir/a b.ts'), test: testOf('tests/my dir/a b.spec.ts') },
      (meta, tmp) => {
        setCapsule(meta, 'implementation', [mp('RSP-001', { prod: [{ id: 'src/my dir/a b.ts', itemKind: 'file', path: 'src/my dir/a b.ts' }] })]);
        setCapsule(meta, 'test', [mp('RSP-001', { tests: [tf('tests/my dir/a b.spec.ts')] })]);
        writePriorArtifacts(meta, 'judge');
        const gate = gateAt(meta, 'judge');
        expect(respOf(gate, 'RSP-001')).toMatchObject({ implementationState: 'satisfied', testImplementationState: 'satisfied' });
        for (const cmd of [['status'], ['check', '--all'], ['export'], ['prompt', 'judge']]) {
          const out = runCli([...cmd, '--root', tmp]).output;
          if (cmd[0] === 'prompt') { expect(out).toContain('Required output artifact: JudgeReport'); continue; }
          expect(out).toContain(path.basename(meta.runFolder));
          expect(out).toMatch(/Semantic classification: ready|semanticClassification: ready|\[pass\] Semantic continuity/);
        }
      },
      'mdko adv space ',
    );
  });
});

// ─── AB..AF strategy change, identity, correction phase ─────────────────────

describe('AB/AC/AD/AE. strategy change after downstream artifacts', () => {
  it('AB1: a responsibility added later has no downstream continuity; RSP-001 stays intact', () => {
    withRun({ mappings: [mp('RSP-001'), mp('RSP-002')] }, (meta) => {
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/test-strategy-packet.txt'), join(crit('RSP-001'), crit('RSP-002')), 'utf8');
      const gate = gateAt(meta, 'judge');
      expect(respOf(gate, 'RSP-001').state).toBe('complete');
      expect(respOf(gate, 'RSP-002')).toMatchObject({ implementationState: 'missing', testImplementationState: 'missing', verificationState: 'missing', state: 'incomplete' });
      expect(gate.semanticContinuityBlockingResponsibilityIds).toEqual(['RSP-002']);
      expect(gate.semanticContinuityClassification).toBe('blocked');
      expect(gate.semanticRecommendedCorrectionStage).toBe('implementation');
    });
  });

  it('AB2: lifecycle staleness still works independently (older downstream artifact after a newer strategy)', () => {
    withRun({}, (meta) => {
      writePriorArtifacts(meta, 'judge');
      const future = Date.now() / 1000 + 600;
      fs.utimesSync(path.join(meta.runFolder, 'artifacts/test-strategy-packet.txt'), future, future);
      const states = getWorkflow(meta.mode).stages.map((s) => s.name);
      expect(states).toContain('implementation');
      const next = getNextStageWithRunIntegrity(meta, readArtifactStateFile(meta.runFolder), gateAt(meta, 'judge'));
      expect(next?.name).toBe('implementation');
    });
  });

  it('AC1: a removed responsibility leaves an orphan downstream declaration that blocks globally', () => {
    withRun({ strategy: join(crit('RSP-001'), crit('RSP-002')), impl: join(implBlock('RSP-001'), implBlock('RSP-002')), test: join(testBlock('RSP-001'), testBlock('RSP-002')), ver: join(verBlock('RSP-001'), verBlock('RSP-002')), mappings: [mp('RSP-001'), mp('RSP-002')] }, (meta) => {
      expect(gateAt(meta, 'judge').semanticContinuityClassification).toBe('ready');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/test-strategy-packet.txt'), crit('RSP-001'), 'utf8');
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticContinuityClassification).toBe('blocked');
      const orphans = gate.semanticContinuity?.issues.filter((i) => i.code === 'SEMANTIC_CONTINUITY_ORPHAN_DECLARATION') ?? [];
      expect(orphans.map((o) => o.responsibilityId).sort()).toEqual(['RSP-002', 'RSP-002', 'RSP-002']);
      expect(gate.semanticContinuityBlockingCodes).toContain('SEMANTIC_CONTINUITY_GLOBAL_INTEGRITY_INVALID');
    });
  });

  it('AD1: prose changes with the ID retained do not change identity handling (no semantic equivalence checking)', () => {
    withRun({}, (meta) => {
      const before = gateAt(meta, 'judge');
      const rewritten = strategyBlock('RSP-001').replace('Reject malformed configuration', 'Completely different meaning now');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/test-strategy-packet.txt'), rewritten, 'utf8');
      const after = gateAt(meta, 'judge');
      expect(after.semanticContinuityClassification).toBe(before.semanticContinuityClassification);
      expect(respOf(after, 'RSP-001').state).toBe('complete');
    });
  });

  it('AE1: repurposing an RSP ID is NOT detectable (documented limitation, no false claim)', () => {
    // The runtime keeps no ID history and no semantic comparison. A repurposed ID with
    // unchanged downstream declarations remains "complete"; this asserts the limitation
    // rather than pretending to detect it.
    withRun({}, (meta) => {
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/test-strategy-packet.txt'), strategyBlock('RSP-001').replace('Reject malformed configuration', 'Unrelated new obligation'), 'utf8');
      expect(gateAt(meta, 'judge').semanticContinuityClassification).toBe('ready');
      const src = fs.readFileSync(path.join(ROOT, 'src/instructions/semanticContinuityPrompt.ts'), 'utf8');
      expect(src).toContain('the runtime cannot prove two texts mean the same thing');
    });
  });
});

describe('AF/AG. correction-phase safety', () => {
  const DOWNSTREAM_BAD = {
    test: `${testBlock('RSP-001', '../escape.ts')}${testBlock('RSP-999')}`,
    ver: 'verification responsibility ID: RSP-001\nverification status: nope\n',
  };

  it('AF1: downstream defects are inactive during an implementation correction and reactivate at judge', () => {
    withRun({ ...DOWNSTREAM_BAD, impl: 'nothing\n' }, (meta, tmp) => {
      const during = gateAt(meta, 'implementation');
      expect(during.semanticContinuityClassification).toBe('ready');
      expect(during.semanticBlockedStageNames).toEqual([]);
      // implementation correction prompt remains available (no deadlock)
      const out = generateLiveStagePrompt(meta, 'implementation', during);
      expect(out).not.toContain('BLOCKED by Semantic Continuity');
      const back = gateAt(meta, 'judge');
      expect(back.semanticContinuityClassification).toBe('blocked');
      expect(srcCodes(back)).toEqual(expect.arrayContaining(['TEST_IMPLEMENTATION_RESPONSIBILITY_FILE_INVALID', 'VERIFICATION_RESPONSIBILITY_STATUS_INVALID']));
      expect(tmp).toBeTruthy();
    });
  });

  it('AG1: a test-implementation correction is not blocked by verification defects', () => {
    withRun({ test: 'none\n', ver: 'verification responsibility ID: RSP-001\nverification status: nope\n' }, (meta) => {
      const during = gateAt(meta, 'test-implementation');
      expect(during.semanticContinuityClassification).toBe('ready');
      expect(evaluateStageRunIntegrity(during, 'test-implementation').blocked).toBe(false);
      const later = gateAt(meta, 'verification');
      expect(later.semanticRecommendedCorrectionStage).toBe('test-implementation');
    });
  });
});

// ─── AH/AI mode-specific strategy correction ────────────────────────────────

describe('AH/AI. mode-owned strategy correction', () => {
  it.each([
    ['repair', 'regression-test-strategy', ['divergence-report.txt', 'correction-design.txt', 'architecture-context-packet.txt']],
    ['refactor', 'compatibility-test-strategy', ['existing-behavior-map.txt', 'preserved-invariant-list.txt', 'architecture-context-packet.txt']],
    ['harden', 'resilience-test-strategy', ['assumption-report.txt', 'failure-mode-matrix.txt', 'guard-pseudocode-packet.txt', 'architecture-context-packet.txt']],
  ] as const)('AH1: %s routes to %s end to end', (mode, stage, inputs) => {
    withRun({ mode, upstream: 'REQ-001: only one\n' }, (meta, tmp) => {
      writePriorArtifacts(meta, 'final-report');
      const { gate, integrity } = judgeOf(meta, 'final-report', 'Verdict: PASS');
      expect(gate.recommendedCorrectionStage).toBe(stage);
      expect(integrity.correctionRequired).toBe(true);
      expect(integrity.acceptedCorrectionStage).toBe(stage);
      const out = runCli(['prompt', '--root', tmp]).output;
      expect(out).toContain(`Stage: ${stage} (correction)`);
      for (const f of inputs) expect(out).toContain(`artifacts/${f}`);
      expect(out).toContain('Keep unaffected RSP IDs and blocks');
      expect(out).toContain('do not regenerate or renumber the whole strategy');
    });
  });

  it('AI1: wrong-mode strategy stages are never accepted as recommendations', () => {
    expect(isCorrectableStage('resilience-test-strategy', 'feature')).toBe(false);
    expect(isCorrectableStage('regression-test-strategy', 'test')).toBe(false);
    expect(isCorrectableStage('compatibility-test-strategy', 'repair')).toBe(false);
    expect(parseAndRoute('Verdict: TEST_COVERAGE_INCOMPLETE\nRecommended next stage: resilience-test-strategy', { workflowMode: 'feature' }).routedStage).toBe('test-strategy');
  });
});

// ─── AJ/AK/AL context interplay ─────────────────────────────────────────────

function blockContext(meta: RunMetadata, kind: 'implementation' | 'test'): void {
  const files = kind === 'implementation'
    ? ['artifacts/implementation-context-packet.txt', 'reports/implementation-context-retrieval-report.txt']
    : ['artifacts/test-context-packet.txt', 'reports/test-context-retrieval-report.txt'];
  for (const rel of files) {
    const p = path.join(meta.runFolder, rel);
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('Status: populated', 'Status: template'), 'utf8');
  }
}
function unblockContext(meta: RunMetadata, kind: 'implementation' | 'test'): void {
  const files = kind === 'implementation'
    ? ['artifacts/implementation-context-packet.txt', 'reports/implementation-context-retrieval-report.txt']
    : ['artifacts/test-context-packet.txt', 'reports/test-context-retrieval-report.txt'];
  for (const rel of files) {
    const p = path.join(meta.runFolder, rel);
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('Status: template', 'Status: populated'), 'utf8');
  }
}

describe('AJ. context blocker + semantic blocker', () => {
  it('AJ1: context keeps primary precedence, semantic stays visible, all surfaces agree', () => {
    withRun({ ver: 'none\n' }, (meta, tmp) => {
      writePriorArtifacts(meta, 'judge');
      blockContext(meta, 'implementation');
      const gate = gateAt(meta, 'judge');
      expect(gate.contextReady).toBe(false);
      expect(gate.semanticContinuityClassification).toBe('blocked');
      expect(gate.recommendedCorrectionStage).toBe('implementation');
      expect(gate.primaryBlockingCode).toBe(gate.primaryBlocker?.primaryCode);
      const status = runCli(['status', '--root', tmp]).output;
      const exported = runCli(['export', '--root', tmp]).output;
      const check = runCli(['check', '--all', '--root', tmp]).output;
      const judge = runCli(['prompt', 'judge', '--root', tmp]).output;
      expect(field(status, 'Semantic classification')).toBe('blocked');
      expect(field(exported, 'semanticClassification')).toBe('blocked');
      expect(check).toContain('[fail] Semantic continuity');
      expect(field(status, 'Run integrity ready')).toBe('no');
      expect(field(exported, 'runIntegrityReady')).toBe('false');
      expect(judge).toBeTruthy();
    });
  });
});

describe('AK/AL/BT. derived state recomputes from current evidence', () => {
  it('AK1: context becomes ready after being refresh-required; semantic state follows', () => {
    withRun({}, (meta) => {
      blockContext(meta, 'implementation');
      const blocked = gateAt(meta, 'judge');
      expect(blocked.contextReady).toBe(false);
      expect(respOf(blocked, 'RSP-001').implementationState).toBe('indeterminate');
      unblockContext(meta, 'implementation');
      const ready = gateAt(meta, 'judge');
      expect(ready.contextReady).toBe(true);
      expect(respOf(ready, 'RSP-001').implementationState).toBe('satisfied');
      expect(ready.semanticContinuityClassification).toBe('ready');
    });
  });

  it('AL1/BT1: replacing producer evidence updates every surface immediately with no semantic cache', () => {
    withRun({}, (meta, tmp) => {
      writePriorArtifacts(meta, 'final-report');
      setCapsule(meta, 'implementation', [mp('RSP-001', { prod: [sym('symbol:zzz/none.ts#x')] })]);
      expect(gateAt(meta, 'judge').semanticContinuityClassification).toBe('blocked');
      expect(field(runCli(['status', '--root', tmp]).output, 'Semantic classification')).toBe('blocked');
      expect(field(runCli(['export', '--root', tmp]).output, 'semanticClassification')).toBe('blocked');
      setCapsule(meta, 'implementation', [mp('RSP-001')]);
      expect(gateAt(meta, 'judge').semanticContinuityClassification).toBe('ready');
      expect(field(runCli(['status', '--root', tmp]).output, 'Semantic classification')).toBe('ready');
      expect(field(runCli(['export', '--root', tmp]).output, 'semanticClassification')).toBe('ready');
      expect(runCli(['check', '--all', '--root', tmp]).output).toContain('[pass] Semantic continuity');
    });
  });
});

// ─── AM..AR bypass attempts ─────────────────────────────────────────────────

describe('AM/AN. manual mark and pre-existing artifact bypass', () => {
  it.each([
    ['test-implementation blocked by implementation gap', { impl: 'none\n', test: null, ver: null }, 'test-implementation', 'test-implementation-report.txt'],
    ['verification blocked by test gap', { test: 'none\n', ver: null }, 'verification', 'verification-report.txt'],
    ['judge blocked by verification gap', { ver: 'none\n' }, 'judge', 'judge-report.txt'],
  ] as Array<[string, SemanticRunOptions, string, string]>)('AM1: %s cannot be marked complete', (_n, opts, stage, file) => {
    withRun(opts, (meta, tmp) => {
      writePriorArtifacts(meta, stage);
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts', file), 'placeholder artifact content long enough to exist\n', 'utf8');
      const statePath = getArtifactStatePath(meta.runFolder);
      const before = fs.existsSync(statePath) ? fs.readFileSync(statePath) : null;
      const r = runCli(['mark', file, '--state', 'complete', '--root', tmp]);
      expect(r.exitCode).toBe(1);
      const after = fs.existsSync(statePath) ? fs.readFileSync(statePath) : null;
      expect(after === null ? null : after.toString('hex')).toBe(before === null ? null : before.toString('hex'));
    });
  });

  it('AN1: an on-disk artifact that is also manually complete still resolves blocked', () => {
    withRun({ impl: 'none\n', test: null, ver: null }, (meta) => {
      writePriorArtifacts(meta, 'test-implementation');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/test-implementation-report.txt'), 'exists on disk and is long enough to look real\n', 'utf8');
      setArtifactManualState(meta.runFolder, 'artifacts/test-implementation-report.txt', 'complete', {});
      const gate = gateAt(meta, 'test-implementation');
      expect(resolveArtifactStateWithRunIntegrity(meta.runFolder, 'artifacts/test-implementation-report.txt', meta.stages, readArtifactStateFile(meta.runFolder), gate)).toBe('blocked');
    });
  });
});

describe('AO/AP/AQ/AR. judge bypass matrix', () => {
  it('AO1: authored PASS against a critical blocker is rejected and routed canonically', () => {
    withRun({ ver: 'none\n' }, (meta) => {
      writePriorArtifacts(meta, 'final-report');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/final-report.txt'), 'a manually created final report file with content\n', 'utf8');
      const { gate, integrity, eligibility } = judgeOf(meta, 'final-report', 'Verdict: PASS');
      expect(gate.expectedJudgeVerdict).toBe('NEED_CONTEXT');
      expect(integrity.judgeVerdictAccepted).toBe(false);
      expect(integrity.blockingCodes).toEqual(['JUDGE_VERDICT_CONTRADICTS_RUN_INTEGRITY']);
      expect(integrity.acceptedCorrectionStage).toBe(gate.recommendedCorrectionStage);
      expect(eligibility.eligible).toBe(false);
    });
  });

  it('AP1/AQ1: canonical null or canonical stage wins over an authored NEED_CONTEXT recommendation', () => {
    withRun({ version: '999.0.0' }, (meta) => {
      const r = judgeOf(meta, 'final-report', 'Verdict: NEED_CONTEXT\nRecommended next stage: architecture-context');
      expect(r.integrity.acceptedCorrectionStage).toBeNull();
      expect(r.integrity.correctionRequired).toBe(false);
    });
    withRun({ impl: 'none\n' }, (meta) => {
      const r = judgeOf(meta, 'final-report', 'Verdict: NEED_CONTEXT\nRecommended next stage: architecture-context');
      expect(r.integrity.acceptedCorrectionStage).toBe('implementation');
    });
  });

  it('AR1: a noncritical warning permits an accepted PASS and semantic eligibility', () => {
    withRun({ strategy: nonc('RSP-001'), ver: 'none\n' }, (meta) => {
      writePriorArtifacts(meta, 'final-report');
      const { gate, integrity, eligibility } = judgeOf(meta, 'final-report', 'Verdict: PASS');
      expect(gate.expectedJudgeVerdict).toBe('PASS');
      expect(integrity.judgeVerdictAccepted).toBe(true);
      expect(eligibility.eligible).toBe(true);
    });
  });

  it('BG1: a critical gap at final-report denies eligibility even with a manual final-report file', () => {
    withRun({ ver: verBlock('RSP-001', 'fail', '1') }, (meta) => {
      writePriorArtifacts(meta, 'final-report');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/final-report.txt'), 'manually created final report contents that exist\n', 'utf8');
      expect(judgeOf(meta, 'final-report', 'Verdict: PASS').eligibility.eligible).toBe(false);
      const gate = gateAt(meta, 'final-report');
      expect(gate.semanticBlockedStageNames).toEqual(['final-report']);
    });
  });
});

// ─── AU/AV/AW/AX mode compatibility ────────────────────────────────────────

describe('AU. test mode', () => {
  it('AU1: requires strategy, test implementation, and verification, but no production implementation', () => {
    withRun({ mode: 'test' }, (meta) => {
      expect(meta.stages.some((s) => s.name === 'implementation')).toBe(false);
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticContinuity?.implementationApplicable).toBe(false);
      expect(respOf(gate, 'RSP-001').implementationState).toBe('not-applicable');
      expect(gate.semanticContinuityClassification).toBe('ready');
      expect(gate.expectedJudgeVerdict).toBe('PASS');
    });
    withRun({ mode: 'test', test: 'none\n' }, (meta) => {
      expect(gateAt(meta, 'judge').primarySemanticBlocker?.leg).toBe('test-implementation');
    });
    withRun({ mode: 'test', ver: 'none\n' }, (meta) => {
      expect(gateAt(meta, 'judge').primarySemanticBlocker?.leg).toBe('verification');
    });
  });
});

describe('AV/AW. greenfield and proof-only stay outside', () => {
  it('AV1: greenfield start persists no version, has no RSP prompts, and reports no semantic state', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-adv-gf-'));
    try {
      runCli(['start', 'a new app', '--mode', 'greenfield', '--root', tmp]);
      const runsDir = path.join(tmp, '.my-dev-kit-orchestrator', 'runs');
      const run = fs.readdirSync(runsDir)[0];
      const meta = JSON.parse(fs.readFileSync(path.join(runsDir, run, 'run.json'), 'utf8'));
      expect('semanticContinuityVersion' in meta).toBe(false);
      for (const f of fs.readdirSync(path.join(runsDir, run, 'prompts'))) {
        expect(fs.readFileSync(path.join(runsDir, run, 'prompts', f), 'utf8')).not.toContain('SEMANTIC CONTINUITY');
      }
      for (const cmd of [['status'], ['check', '--all'], ['export']]) {
        expect(runCli([...cmd, '--root', tmp]).output).not.toContain('Semantic continuity');
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('AW1: proof-only start persists no version; proof contract and prompts are unchanged', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-adv-po-'));
    try {
      runCli(['start', 'proof', '--mode', 'feature', '--proof-only', '--verification-responsibility', 'proof/r.txt', '--root', tmp]);
      const runsDir = path.join(tmp, '.my-dev-kit-orchestrator', 'runs');
      const run = fs.readdirSync(runsDir)[0];
      const meta = JSON.parse(fs.readFileSync(path.join(runsDir, run, 'run.json'), 'utf8'));
      expect('semanticContinuityVersion' in meta).toBe(false);
      expect(meta.verificationResponsibility).toBe('proof/r.txt');
      const ver = fs.readFileSync(path.join(runsDir, run, 'prompts', '08-verification.prompt.txt'), 'utf8');
      expect(ver).toContain('Proof result: PASS');
      expect(ver).not.toContain('verification responsibility ID');
      expect(runCli(['status', '--root', tmp]).output).not.toContain('Semantic continuity');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('AX. extraction target/source separation', () => {
  it('AX1: a source-repo path is not target evidence merely because it exists in the source repo', () => {
    withRun({ mode: 'extraction', impl: 'implementation responsibility ID: RSP-001\nproduction file: src/only-in-source.ts\n' }, (meta, tmp) => {
      fs.mkdirSync(path.join(tmp, 'source-repo', 'src'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'source-repo', 'src', 'only-in-source.ts'), 'export const x = 1;\n');
      setCapsule(meta, 'implementation', [mp('RSP-001', { prod: [sym('symbol:src/target-impl.ts#run')] })]);
      const gate = gateAt(meta, 'judge');
      expect(respOf(gate, 'RSP-001').implementationState).toBe('unsatisfied');
      expect(gate.semanticContinuityClassification).toBe('blocked');
      const prompt = generateStagePrompt(createExtractionMeta(tmp), 'implementation');
      expect(prompt).toContain('TARGET repository identities');
    });
  });
});

function createExtractionMeta(tmp: string): RunMetadata {
  const root = fs.mkdtempSync(path.join(tmp, 'ex-'));
  initWorkspace(root);
  const meta = createRun({ request: 'extract', mode: 'extraction', projectRoot: root, sourceRepoRoot: path.join(tmp, 'source-repo'), targetRepoRoot: root, semanticContinuityVersion: '1.0.0' });
  makeReadyRunFolder(meta.runFolder, 'extraction');
  return meta;
}

// ─── AY/AZ/BA producer compatibility ────────────────────────────────────────

describe('AY/AZ/BA. producer evidence compatibility', () => {
  it('AY1: historical schema-major-1 evidence (no additive fields) parses and yields uncorroborated, not a crash', () => {
    const fixture = path.join(ROOT, 'tests/fixtures/context-contracts/my-dev-kit-1.10.2/implementation.context-capsule.json');
    const raw = JSON.parse(fs.readFileSync(fixture, 'utf8'));
    withRun({}, (meta) => {
      raw.responsibilityMappings = { ...raw.responsibilityMappings, mappings: [{ responsibilityId: 'RSP-001', mappingStatus: 'mapped' }] };
      const copy = path.join(meta.runFolder, 'historical-capsule.json');
      fs.writeFileSync(copy, JSON.stringify(raw), 'utf8');
      const parsed = readRawContextCapsule(copy, meta.runFolder);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.projection.responsibilityMappings[0].productionSymbols).toEqual([]);
      expect(parsed.projection.responsibilityMappings[0].proposedOrExistingTestFiles).toEqual([]);
      const bridge = evaluateImplementationEvidenceBridge({
        semanticResponsibilities: validateSemanticResponsibilities(crit('RSP-001')).responsibilities,
        declarations: validateImplementationResponsibilities(implBlock('RSP-001')).declarations,
        evidence: parsed.projection,
      });
      expect(bridge.responsibilities[0].state).toBe('uncorroborated');
    });
    // The historical fixture on disk is untouched.
    expect(JSON.parse(fs.readFileSync(fixture, 'utf8')).responsibilityMappings.mappings).toEqual([]);
  });

  it('AZ1: current 1.12.4-shaped evidence corroborates exactly', () => {
    withRun({}, (meta) => {
      setCapsule(meta, 'implementation', [mp('RSP-001', { prod: [sym('symbol:src/a.ts#run')] })]);
      setCapsule(meta, 'test', [mp('RSP-001', { tests: [tf('tests/a.spec.ts')] })]);
      const r = respOf(gateAt(meta, 'judge'), 'RSP-001');
      expect(r).toMatchObject({ implementationState: 'satisfied', testImplementationState: 'satisfied', state: 'complete' });
    });
  });

  it('BA1: shared request-scoped producer evidence keeps each RSP independent', () => {
    const shared = [sym('symbol:src/a.ts#run')];
    withRun({
      strategy: join(crit('RSP-001'), crit('RSP-002')),
      impl: join(implBlock('RSP-001'), 'implementation responsibility ID: RSP-002\nproduction file: src/not-shared.ts\n'),
      test: join(testBlock('RSP-001'), testBlock('RSP-002')),
      ver: join(verBlock('RSP-001'), verBlock('RSP-002')),
      mappings: [mp('RSP-001', { prod: shared }), mp('RSP-002', { prod: shared })],
    }, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(respOf(gate, 'RSP-001').implementationState).toBe('satisfied');
      expect(respOf(gate, 'RSP-002').implementationState).toBe('unsatisfied');
      expect(gate.semanticContinuityBlockingResponsibilityIds).toEqual(['RSP-002']);
    });
    // The identical declared identity corroborates both when both declare it.
    withRun({
      strategy: join(crit('RSP-001'), crit('RSP-002')),
      impl: join(implBlock('RSP-001'), implBlock('RSP-002')),
      test: join(testBlock('RSP-001'), testBlock('RSP-002')),
      ver: join(verBlock('RSP-001'), verBlock('RSP-002')),
      mappings: [mp('RSP-001', { prod: shared }), mp('RSP-002', { prod: shared })],
    }, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticContinuity?.responsibilities.map((r) => [r.responsibilityId, r.state])).toEqual([['RSP-001', 'complete'], ['RSP-002', 'complete']]);
    });
  });
});

// ─── BB..BF ordering, precedence, phase boundaries ──────────────────────────

describe('BB/BC/BD/BE. ordering and precedence', () => {
  it('BB1: canonical strategy order (not numeric/alphabetical) is preserved everywhere', () => {
    const order = ['RSP-010', 'RSP-002', 'RSP-100'];
    withRun({
      strategy: join(...order.map((id) => crit(id))),
      impl: join(...order.map((id) => implBlock(id))),
      test: join(...order.map((id) => testBlock(id))),
      ver: join(...order.map((id) => verBlock(id, 'fail', '1'))),
      mappings: order.map((id) => mp(id)),
    }, (meta, tmp) => {
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticContinuity?.responsibilities.map((r) => r.responsibilityId)).toEqual(order);
      expect(gate.semanticContinuityBlockingResponsibilityIds).toEqual(order);
      expect(gate.primarySemanticBlocker?.responsibilityId).toBe('RSP-010');
      writePriorArtifacts(meta, 'final-report');
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/judge-report.txt'), 'Verdict: NEED_CONTEXT\n', 'utf8');
      expect(field(runCli(['status', '--root', tmp]).output, 'Blocking responsibility IDs')).toBe(order.join(', '));
      expect(field(runCli(['export', '--root', tmp]).output, 'blockingResponsibilityIds')).toBe(order.join(', '));
    });
  });

  it('BC1: the earliest broken leg of one RSP wins (implementation before verification)', () => {
    withRun({ impl: 'none\n', ver: 'none\n' }, (meta) => {
      const gate = gateAt(meta, 'judge');
      expect(gate.semanticRecommendedCorrectionStage).toBe('implementation');
      expect(gate.primarySemanticBlocker?.leg).toBe('implementation');
    });
  });

  it('BD1: owner-stage precedence across RSPs beats responsibility order', () => {
    withRun({
      strategy: join(crit('RSP-001'), crit('RSP-002')),
      impl: implBlock('RSP-001'),
      test: join(testBlock('RSP-001'), testBlock('RSP-002')),
      ver: verBlock('RSP-002'),
      mappings: [mp('RSP-001'), mp('RSP-002')],
    }, (meta) => {
      const gate = gateAt(meta, 'judge');
      // RSP-001 has the verification gap, RSP-002 the implementation gap.
      expect(gate.semanticContinuityBlockingResponsibilityIds).toEqual(['RSP-001', 'RSP-002']);
      expect(gate.primarySemanticBlocker).toMatchObject({ responsibilityId: 'RSP-002', leg: 'implementation' });
      expect(gate.semanticRecommendedCorrectionStage).toBe('implementation');
    });
  });

  it('BE1: same-leg ties break by strategy declaration order', () => {
    withRun({
      strategy: join(crit('RSP-020'), crit('RSP-003')),
      impl: 'none\n',
      test: join(testBlock('RSP-020'), testBlock('RSP-003')),
      ver: join(verBlock('RSP-020'), verBlock('RSP-003')),
      mappings: [mp('RSP-020'), mp('RSP-003')],
    }, (meta) => {
      expect(gateAt(meta, 'judge').primarySemanticBlocker?.responsibilityId).toBe('RSP-020');
    });
  });
});

describe('BF. phase boundary exactness', () => {
  it('BF1: a leg is pending at its owner stage and active immediately after', () => {
    withRun({ strategy: 'no blocks\n', impl: 'none\n', test: 'none\n', ver: 'none\n' }, (meta) => {
      const stages = meta.stages.map((s) => s.name);
      const legOf = (stage: string) => gateAt(meta, stage);
      // strategy
      expect(legOf('test-strategy').semanticContinuity?.state).toBe('pending');
      expect(legOf(stages[stages.indexOf('test-strategy') + 1]).semanticContinuity?.strategyActive).toBe(true);
      // implementation / test / verification owners
      const active = (stage: string) => {
        const c = legOf(stage).semanticContinuity!;
        return [c.implementationActive, c.testImplementationActive, c.verificationActive];
      };
      expect(active('implementation')).toEqual([false, false, false]);
      expect(active('test-implementation')).toEqual([true, false, false]);
      expect(active('verification')).toEqual([true, true, false]);
      expect(active('judge')).toEqual([true, true, true]);
      expect(active('final-report')).toEqual([true, true, true]);
    });
  });
});

// ─── BI/BN malformed verification and line endings ──────────────────────────

describe('BI. malformed verification declarations', () => {
  const bad = [
    'verification responsibility ID: RSP-001\nverification status: success\n',
    'verification responsibility ID: RSP-001\nverification status: pass\nverification evidence:\nworking directory: .\nexit code: 0\n',
    'verification responsibility ID: RSP-001\nverification status: pass\nverification evidence:\ncommand: npm test\nworking directory: .\nexit code: abc\n',
  ];
  it.each(bad.map((b, i) => [i, b] as const))('BI1: malformed variant %i invalidates only when active', (_i, ver) => {
    withRun({ ver }, (meta) => {
      const active = gateAt(meta, 'judge');
      expect(active.semanticContinuity?.state).toBe('invalid');
      expect(active.semanticContinuityClassification).toBe('blocked');
      const future = gateAt(meta, 'verification');
      expect(future.semanticContinuityClassification).toBe('ready');
      expect(future.semanticBlockedStageNames).toEqual([]);
    });
  });
});

describe('BN. LF versus CRLF', () => {
  it('BN1: equivalent artifacts evaluate identically', () => {
    const lf = { strategy: crit('RSP-001'), impl: implBlock('RSP-001'), test: testBlock('RSP-001'), ver: verBlock('RSP-001'), upstream: 'REQ-001: a\nBEH-002: b\nTRN-003: x -> y\n' };
    const crlf = Object.fromEntries(Object.entries(lf).map(([k, v]) => [k, (v as string).replace(/\n/g, '\r\n')])) as SemanticRunOptions;
    const a = withRun(lf, (meta) => JSON.stringify(gateAt(meta, 'judge').semanticContinuity));
    const b = withRun(crlf, (meta) => JSON.stringify(gateAt(meta, 'judge').semanticContinuity));
    expect(b).toBe(a);
    expect(JSON.parse(a).state).toBe('complete');
  });
});

// ─── BO/BP prompts ──────────────────────────────────────────────────────────

describe('BO. live prompt transition after context becomes ready', () => {
  it('BO1: refresh-only -> normal semantic-aware implementation and test-implementation prompts', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-adv-bo-'));
    try {
      runCli(['start', 'transition run', '--mode', 'feature', '--root', tmp]);
      const runsDir = path.join(tmp, '.my-dev-kit-orchestrator', 'runs');
      const runDir = path.join(runsDir, fs.readdirSync(runsDir)[0]);
      const meta = JSON.parse(fs.readFileSync(path.join(runDir, 'run.json'), 'utf8')) as RunMetadata;
      // Reach the implementation phase with valid upstream + strategy artifacts.
      const w = (rel: string, text: string) => fs.writeFileSync(path.join(runDir, rel), text, 'utf8');
      for (const s of meta.stages.slice(0, 4)) w(s.artifactFile, `${s.name} done\n`);
      w(meta.stages[0].artifactFile, 'REQ-001: r\nBEH-002: b\n');
      w('artifacts/test-strategy-packet.txt', crit('RSP-001'));
      settleArtifactTimes(meta);
      const fresh = runCli(['prompt', 'implementation', '--root', tmp]).output;
      expect(fresh).toContain('BLOCKED on repository context');
      expect(fresh).not.toContain('Required output artifact');
      // Populate valid context evidence (mirror the ready fixture) and rerun.
      makeReadyRunFolder(runDir, 'feature');
      w('artifacts/test-strategy-packet.txt', crit('RSP-001'));
      setCapsuleAt(runDir, [mp('RSP-001')]);
      const ready = runCli(['prompt', 'implementation', '--root', tmp]).output;
      expect(ready).not.toContain('BLOCKED on repository context');
      expect(ready).toContain('Required output artifact: ImplementationReport');
      expect(ready).toContain('implementation responsibility ID: RSP-001');
      expect(ready).toContain('Post-change evidence refresh (REQUIRED');
      w(meta.stages.find((s) => s.name === 'implementation')!.artifactFile, implBlock('RSP-001'));
      settleArtifactTimes(meta);
      const testPrompt = runCli(['prompt', 'test-implementation', '--root', tmp]).output;
      expect(testPrompt).toContain('test implementation responsibility ID: RSP-001');
      expect(testPrompt).toContain('Post-test evidence refresh (REQUIRED');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

function setCapsuleAt(runDir: string, mappings: unknown[]): void {
  for (const [kind, role] of [['implementation', 'implementation'], ['test', 'test-implementation']] as const) {
    for (const suffix of ['capsule', 'audit']) {
      const f = path.join(runDir, `${kind}-${suffix}.json`);
      if (fs.existsSync(f)) fs.writeFileSync(f, rawCapsule(role, mappings), 'utf8');
    }
  }
}

describe('BP. saved template versus live blocked prompt', () => {
  it('BP1: the saved test-implementation template teaches authoring; the live prompt for a blocked current stage returns correction guidance', () => {
    withRun({ impl: 'none\n', test: null, ver: null }, (meta, tmp) => {
      writeStagePrompts(meta);
      const saved = fs.readFileSync(path.join(meta.runFolder, meta.stages.find((s) => s.name === 'test-implementation')!.promptFile), 'utf8');
      expect(saved).toContain('SEMANTIC CONTINUITY');
      expect(saved).not.toContain('BLOCKED by Semantic Continuity');
      writePriorArtifacts(meta, 'test-implementation');
      const live = runCli(['prompt', '--root', tmp]).output;
      expect(live).toContain('BLOCKED by Semantic Continuity');
      expect(live).toContain('Recommended correction stage: implementation');
      expect(live).not.toContain('Required output artifact: TestImplementationReport');
      // Saved files are not rewritten by the live command.
      expect(fs.readFileSync(path.join(meta.runFolder, meta.stages.find((s) => s.name === 'test-implementation')!.promptFile), 'utf8')).toBe(saved);
    });
  });
});

// ─── BQ real, non-stubbed CLI matrix ────────────────────────────────────────

const GENERIC = 'Realistic fixture detail written so that this section is comfortably longer than the placeholder threshold used by the content checker.';

function sectionsFor(stageName: string, mode: string): string[] {
  const kind = resolveArtifactKind(stageName);
  const req = kind ? getArtifactSectionRequirements(kind) : undefined;
  const lines: string[] = [];
  for (const section of req?.required ?? []) {
    if (section === 'Artifact') lines.push(`Artifact: ${kind}`);
    else if (section === 'Workflow mode') lines.push(`Workflow mode: ${mode}`);
    else if (section === 'Status') lines.push('Status: complete');
    else if (section === 'Run ID') lines.push('Run ID: adversarial-run');
    else lines.push(`${section}: ${GENERIC}`);
  }
  // Extra prose so short artifact kinds clear the placeholder-length heuristic.
  lines.push(`Notes: ${GENERIC}`);
  return lines;
}

interface Realistic {
  strategy?: string;
  impl?: string;
  test?: string;
  ver?: string;
  judge?: string;
  mappings?: unknown[];
  mode?: WorkflowMode;
}

// Builds an activated run whose EVERY stage artifact satisfies the ordinary content
// contracts (required sections, non-placeholder text, Status: complete), with the
// semantic blocks appended to the semantic-owning artifacts and refreshed prompt files.
function realisticRun(tmp: string, o: Realistic = {}): RunMetadata {
  const mode = o.mode ?? 'feature';
  const meta = makeSemanticRun(tmp, {
    mode,
    strategy: o.strategy ?? crit('RSP-001'),
    impl: o.impl ?? implBlock('RSP-001'),
    test: o.test ?? testBlock('RSP-001'),
    ver: o.ver ?? verBlock('RSP-001'),
    ...(o.mappings ? { mappings: o.mappings } : {}),
  });
  const strategyFile = getWorkflow(mode).stages.find((s) => s.name === 'test-strategy')!.artifactFile;
  const semanticOwner: Record<string, string> = {
    [meta.stages[0].artifactFile]: 'REQ-001: requirement one\nBEH-002: behavior two\n',
    [strategyFile]: o.strategy ?? crit('RSP-001'),
    'artifacts/implementation-report.txt': o.impl ?? implBlock('RSP-001'),
    'artifacts/test-implementation-report.txt': o.test ?? testBlock('RSP-001'),
    'artifacts/verification-report.txt': o.ver ?? verBlock('RSP-001'),
  };
  for (const stage of meta.stages) {
    const lines = sectionsFor(stage.name, mode);
    if (stage.name === 'judge') {
      const i = lines.findIndex((l) => l.startsWith('Verdict:'));
      const verdict = o.judge ?? 'PASS';
      if (i >= 0) lines[i] = `Verdict: ${verdict}`;
      else lines.push(`Verdict: ${verdict}`);
    }
    const tail = semanticOwner[stage.artifactFile] ? `\n${semanticOwner[stage.artifactFile]}` : '';
    fs.writeFileSync(path.join(meta.runFolder, stage.artifactFile), `${lines.join('\n')}\n${tail}\n`, 'utf8');
  }
  writeStagePrompts(meta);
  settleArtifactTimes(meta);
  return meta;
}

function runBuilt(args: string[], root: string): { status: number; output: string } {
  try {
    const out = execFileSync('node', [DIST_CLI, ...args, '--root', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { status: 0, output: out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? -1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

type Runner = (args: string[], root: string) => { status: number; output: string };
const inProcess: Runner = (args, root) => {
  const r = runCli([...args, '--root', root]);
  return { status: r.exitCode ?? 0, output: r.output };
};

const CHECK_VARIANTS: Array<[string, string[]]> = [['default', []], ['--artifacts', ['--artifacts']], ['--all', ['--all']]];

function bqMatrix(name: string, run: Runner): void {
  describe(`BQ. real non-stubbed check matrix (${name})`, () => {
    const withReal = <T,>(o: Realistic, fn: (meta: RunMetadata, tmp: string) => T): T => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-adv-real-'));
      try {
        return fn(realisticRun(tmp, o), tmp);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    };
    const failLines = (out: string) => out.split('\n').filter((l) => /\[fail\]/.test(l));

    it.each(CHECK_VARIANTS)('complete chain: %s exits 0 (also with --strict), proving the fixture is otherwise clean', (_l, args) => {
      withReal({}, (_m, tmp) => {
        const r = run(['check', ...args], tmp);
        expect(r.output).toContain('[pass] Semantic continuity 1.0.0: ready (continuity: complete)');
        expect(failLines(r.output)).toEqual([]);
        expect(r.status).toBe(0);
        expect(run(['check', ...args, '--strict'], tmp).status).toBe(0);
      });
    });

    it.each(CHECK_VARIANTS)('semantic warning: %s exits 0 normally, 1 under --strict (differential vs complete)', (_l, args) => {
      withReal(MIXED as Realistic, (_m, tmp) => {
        const r = run(['check', ...args], tmp);
        expect(r.output).toContain('[warn] Semantic continuity 1.0.0: warning');
        expect(r.output).toContain('Warning responsibility IDs: RSP-003');
        expect(failLines(r.output)).toEqual([]);
        expect(r.status).toBe(0);
        expect(run(['check', ...args, '--strict'], tmp).status).toBe(1);
      });
    });

    it.each(CHECK_VARIANTS)('semantic blocker: %s exits 1 and the only [fail] is the semantic section (differential vs complete)', (_l, args) => {
      withReal({ ver: 'no verification block for the responsibility\n', judge: 'NEED_CONTEXT' }, (_m, tmp) => {
        const r = run(['check', ...args], tmp);
        expect(r.output).toContain('[fail] Semantic continuity 1.0.0: blocked');
        expect(r.output).toContain('Broken leg: verification');
        expect(r.output).toContain('Recommended correction stage: verification');
        expect(failLines(r.output).every((l) => l.includes('Semantic continuity'))).toBe(true);
        expect(r.status).toBe(1);
      });
    });

    it('cross-surface agreement on the same real blocked fixture (BR)', () => {
      withReal({ ver: 'no verification block for the responsibility\n', judge: 'NEED_CONTEXT' }, (_m, tmp) => {
        const status = run(['status'], tmp).output;
        const check = run(['check', '--all'], tmp).output;
        const exported = run(['export'], tmp).output;
        const judge = run(['prompt', 'judge'], tmp).output;
        expect(field(status, 'Contract version')).toBe('1.0.0');
        expect(field(exported, 'contractVersion')).toBe('1.0.0');
        expect(field(judge, 'Semantic continuity contract')).toBe('1.0.0');
        expect(field(status, 'Semantic classification')).toBe('blocked');
        expect(field(exported, 'semanticClassification')).toBe('blocked');
        expect(field(judge, 'Semantic classification')).toBe('blocked');
        expect(check).toContain('[fail] Semantic continuity');
        expect(field(status, 'Blocking responsibility IDs')).toBe('RSP-001');
        expect(field(exported, 'blockingResponsibilityIds')).toBe('RSP-001');
        expect(field(judge, 'Blocking responsibility IDs')).toBe('RSP-001');
        const code = 'SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED';
        expect(field(check, 'Primary blocking code')).toBe(code);
        expect(field(exported, 'primaryBlockingCode')).toBe(code);
        expect(field(judge, 'Primary blocking code')).toBe(code);
        expect(field(check, 'Primary reason')).toBe(field(judge, 'Primary blocking reason'));
        expect(field(exported, 'primaryBlockingReason')).toBe(field(judge, 'Primary blocking reason'));
        expect(field(status, 'Recommended correction stage')).toBe('verification');
        expect(field(exported, 'recommendedCorrectionStage')).toBe('verification');
        expect(field(judge, 'Canonical recommended correction stage')).toBe('verification');
        expect(field(exported, 'expectedJudgeVerdict')).toBe('NEED_CONTEXT');
        expect(field(judge, 'Expected judge verdict')).toBe('NEED_CONTEXT');
        expect(field(status, 'Continuity state')).toBe(field(exported, 'continuityState'));
        expect(field(status, 'Continuity state')).toBe(field(judge, 'Continuity state'));
        expect(field(status, 'Run integrity ready')).toBe('no');
        expect(field(exported, 'runIntegrityReady')).toBe('false');
        expect(field(judge, 'Run integrity ready')).toBe('no');
      });
    });

    it('no semantic state file is persisted by any surface (BS)', () => {
      withReal({}, (meta, tmp) => {
        for (const args of [['status'], ['check', '--all'], ['export'], ['prompt'], ['prompt', 'judge']]) run(args, tmp);
        const names = Object.keys(snapshotFiles(tmp)).map((f) => path.basename(f));
        for (const forbidden of ['semantic-continuity.json', 'semantic-check-results.json', 'rsp-state.json']) {
          expect(names).not.toContain(forbidden);
        }
        expect(names.filter((n) => /semantic|rsp-state/i.test(n))).toEqual([]);
        expect(meta.semanticContinuityVersion).toBe('1.0.0');
      });
    });
  });
}

bqMatrix('in-process, unstubbed', inProcess);
(fs.existsSync(DIST_CLI) ? describe : describe.skip)('BQ built CLI', () => {
  bqMatrix('built dist/cli.js', runBuilt);
});

// ─── BR/BS also on the shared minimal fixture: agreement for warning state ──

describe('BR. warning-state agreement', () => {
  it('BR2: status, export, and judge prompt agree on warning IDs and PASS expectation', () => {
    withRun(MIXED, (meta, tmp) => {
      writePriorArtifacts(meta, 'judge');
      const status = runCli(['status', '--root', tmp]).output;
      const exported = runCli(['export', '--root', tmp]).output;
      const judge = runCli(['prompt', 'judge', '--root', tmp]).output;
      for (const t of [field(status, 'Warning responsibility IDs'), field(exported, 'warningResponsibilityIds'), field(judge, 'Warning responsibility IDs')]) {
        expect(t).toBe('RSP-003');
      }
      expect(field(exported, 'expectedJudgeVerdict')).toBe('PASS');
      expect(field(judge, 'Expected judge verdict')).toBe('PASS');
    });
  });
});

// ─── BU/BV/BW public surface and boundaries ─────────────────────────────────

describe('BU. public surface', () => {
  it('BU1: 8 commands, 7 modes, 79 native stages, no semantic flag, no status JSON', () => {
    const program = createProgram();
    expect(program.commands.map((c) => c.name()).sort()).toEqual(['check', 'export', 'init', 'list', 'mark', 'prompt', 'start', 'status']);
    expect(VALID_MODES).toHaveLength(7);
    expect(VALID_MODES.reduce((n, m) => n + getWorkflow(m).stages.length, 0)).toBe(79);
    for (const cmd of program.commands) {
      const flags = cmd.options.map((o) => o.long);
      for (const banned of ['--semantic', '--continuity', '--rsp', '--direct', '--full-stage-context']) expect(flags).not.toContain(banned);
    }
    expect(program.commands.find((c) => c.name() === 'status')!.options.map((o) => o.long)).not.toContain('--json');
    expect(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version).toBe('1.6.0');
  });
});

describe('BV. prompt leakage', () => {
  it('BV1: activated public prompts do not mention orchestrator-maintainer paths', () => {
    withRun({}, (meta) => {
      for (const stage of meta.stages) {
        const p = generateStagePrompt(meta, stage.name);
        expect(p).not.toMatch(/src\/instructions\/|src\/promptGenerator|docs\/reports|\.my-dev-kit-context|AGENTS\.txt|tests\/semantic/);
      }
    });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-adv-leak-'));
    try {
      initWorkspace(tmp);
      const gf = createRun({ request: 'new app', mode: 'greenfield', projectRoot: tmp });
      for (const stage of gf.stages) {
        expect(generateStagePrompt(gf, stage.name)).not.toMatch(/src\/instructions\/|src\/promptGenerator|docs\/reports|\.my-dev-kit-context/);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('BW. producer boundary', () => {
  it('BW1: the semantic modules perform no I/O beyond the run adapter and no producer invocation', () => {
    for (const f of ['semanticContinuity.ts', 'semanticResponsibility.ts', 'implementationResponsibilityEvidence.ts', 'testImplementationResponsibilityEvidence.ts', 'verificationResponsibilityEvidence.ts']) {
      const src = fs.readFileSync(path.join(ROOT, 'src/instructions', f), 'utf8');
      expect(src).not.toMatch(/from 'fs'|from 'child_process'|execSync|spawn\(/);
    }
  });
});

// Keep an explicit reference so an accidental rename of the gate-code constant is caught.
it('constants: critical blocker code is stable', () => {
  expect(FIRE_CODE).toBe('SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED');
  expect(evaluateSemanticContinuity).toBeDefined();
  expect(evaluateVerificationAttribution).toBeDefined();
  expect(validateVerificationResponsibilities('').declarations).toEqual([]);
  expect(goodMapping('RSP-001').responsibilityId).toBe('RSP-001');
  expect(resolveGateCurrentStage).toBeDefined();
});
