// Focused tests for the canonical RunIntegrityGate (v1.2.3 Batch 2). Proves
// the pure gate-derivation logic on top of real RunMetadata-backed run
// folders -- reusing the same raw-evidence/supplemental-document patterns
// tests/contextReadiness.test.ts already established for Batch 1, rather
// than re-deriving readiness policy here. This file owns only "does the gate
// project readiness into the right blocked stages, blocking codes, and
// expected verdict" -- not readiness policy itself.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun, RunMetadata } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { writeSupplementalContextTemplates } from '../src/instructions/supplementalContextTemplates';
import { makeReadyRunFolder, fillRequiredSections } from './readyContextTestHelpers';
import {
  evaluateRunIntegrityGate,
  evaluateStageRunIntegrity,
  isContextBlockedArtifactFile,
  resolveArtifactStateWithRunIntegrity,
  RunIntegrityGateResult,
} from '../src/runIntegrityGate';
import { readArtifactStateFile } from '../src/artifactLifecycle';
import { SupplementalContextDocumentKind } from '../src/instructions/supplementalContextTypes';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-run-integrity-'));
}

function gateFor(meta: RunMetadata): RunIntegrityGateResult {
  return evaluateRunIntegrityGate({
    mode: meta.mode,
    runFolder: meta.runFolder,
    workflowStageNames: meta.stages.map((s) => s.name),
    projectRoot: meta.projectRoot,
  });
}

// Reverts a populated packet/report back to "Status: template" so the
// helper-populated kind becomes refresh-required again -- the cheapest way
// to get a mixed impl-ready/test-blocked (or vice versa) scenario on top of
// makeReadyRunFolder without duplicating its wiring.
function blockKind(runFolder: string, kind: 'implementation' | 'test') {
  const packetRel = kind === 'implementation' ? 'artifacts/implementation-context-packet.txt' : 'artifacts/test-context-packet.txt';
  const reportRel = kind === 'implementation' ? 'reports/implementation-context-retrieval-report.txt' : 'reports/test-context-retrieval-report.txt';
  for (const rel of [packetRel, reportRel]) {
    const p = path.join(runFolder, rel);
    const text = fs.readFileSync(p, 'utf8').replace('Status: populated', 'Status: template');
    fs.writeFileSync(p, text, 'utf8');
  }
}

function rawEvidenceJson(role: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: '1.0.0',
    tool: { name: 'my-dev-kit', version: '1.10.4' },
    index: { indexPath: '/idx', manifestPath: '/idx/manifest.json' },
    request: { role },
    roleContext: { role },
    roleAdequacy: { status: 'context sufficient for implementation' },
    freshness: { role, state: 'fresh', comparedIdentities: [{ label: 'afterIndexPath', value: '/idx' }] },
    responsibilityMappings: { mappings: [{ responsibilityId: 'TST-GATE-001', mappingStatus: 'mapped' }], truncated: false },
    truncation: { truncated: false, records: [] },
    fullFileFallback: { used: 0 },
    provenance: [{ id: 'p1' }],
    warnings: [],
    ...overrides,
  });
}

// Populates one kind's packet/report/raw-evidence pair with full control
// over capsule/audit overrides, mirroring tests/contextReadiness.test.ts's
// populateWithRawEvidence helper (kept local -- see AGENTS.txt's "no
// reusable concrete scenario details inside generic prompts/guidelines"
// spirit applied to test helpers: this file's scenario shaping stays here).
function populateKindWithRawEvidence(
  runFolder: string,
  kind: 'implementation' | 'test',
  capsuleOverrides: Record<string, unknown> = {},
  auditOverrides: Record<string, unknown> = capsuleOverrides,
) {
  const packetRel = kind === 'implementation' ? 'artifacts/implementation-context-packet.txt' : 'artifacts/test-context-packet.txt';
  const reportRel = kind === 'implementation' ? 'reports/implementation-context-retrieval-report.txt' : 'reports/test-context-retrieval-report.txt';
  const packetPath = path.join(runFolder, packetRel);
  const reportPath = path.join(runFolder, reportRel);
  const role = kind === 'implementation' ? 'implementation' : 'test-implementation';

  const capsulePath = path.join(runFolder, `${kind}-gate-capsule.json`);
  const auditPath = path.join(runFolder, `${kind}-gate-audit.json`);
  fs.writeFileSync(capsulePath, rawEvidenceJson(role, capsuleOverrides), 'utf8');
  fs.writeFileSync(auditPath, rawEvidenceJson(role, auditOverrides), 'utf8');

  const packetKind: SupplementalContextDocumentKind = kind === 'implementation' ? 'implementation-context-packet' : 'test-context-packet';
  for (const file of [packetPath, reportPath] as const) {
    let text = fs
      .readFileSync(file, 'utf8')
      .replace('Status: template', 'Status: populated')
      .replace('Source context capsule: unknown', `Source context capsule: ${capsulePath}`)
      .replace('Source retrieval audit: unknown', `Source retrieval audit: ${auditPath}`);
    if (file === packetPath) text = fillRequiredSections(text, packetKind);
    fs.writeFileSync(file, text, 'utf8');
  }
}

function makeFeatureRun(tmp: string, request = 'gate test'): RunMetadata {
  initWorkspace(tmp);
  return createRun({ request, mode: 'feature', projectRoot: tmp });
}

describe('RunIntegrityGate: pure evaluator', () => {
  it('context not required (greenfield)', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'a new app', mode: 'greenfield', projectRoot: tmp });
      const gate = gateFor(meta);
      expect(gate.contextRequired).toBe(false);
      expect(gate.contextReady).toBe(true);
      expect(gate.readinessClassification).toBe('not-required');
      expect(gate.blockedStageNames).toEqual([]);
      expect(gate.expectedJudgeVerdict).toBe('PASS');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('required context ready -> expected judge verdict PASS', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      const gate = gateFor(meta);
      expect(gate.contextRequired).toBe(true);
      expect(gate.contextReady).toBe(true);
      expect(gate.readinessClassification).toBe('ready');
      expect(gate.blockedStageNames).toEqual([]);
      expect(gate.expectedJudgeVerdict).toBe('PASS');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('implementation context refresh-required (test ready) -> expected judge verdict NEED_CONTEXT', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      blockKind(meta.runFolder, 'implementation');
      const gate = gateFor(meta);
      expect(gate.contextReady).toBe(false);
      expect(gate.blockedStageNames).toEqual(['implementation']);
      expect(gate.expectedJudgeVerdict).toBe('NEED_CONTEXT');
      expect(gate.recommendedCorrectionStage).toBe('implementation');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('test context refresh-required (implementation ready)', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      makeReadyRunFolder(meta.runFolder, 'feature');
      blockKind(meta.runFolder, 'test');
      const gate = gateFor(meta);
      expect(gate.contextReady).toBe(false);
      expect(gate.blockedStageNames).toEqual(['test-implementation']);
      expect(gate.expectedJudgeVerdict).toBe('NEED_CONTEXT');
      expect(gate.recommendedCorrectionStage).toBe('test-implementation');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('both context kinds refresh-required (fresh run)', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      const gate = gateFor(meta);
      expect(gate.contextReady).toBe(false);
      expect([...gate.blockedStageNames].sort()).toEqual(['implementation', 'test-implementation']);
      expect(gate.expectedJudgeVerdict).toBe('NEED_CONTEXT');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('identity failure (wrong repository root) blocks', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeSupplementalContextTemplates('feature', meta.runFolder);
      populateKindWithRawEvidence(meta.runFolder, 'implementation', {
        index: { indexPath: '/idx', manifestPath: '/idx/manifest.json', projectRoot: '/repo/wrong' },
      });
      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        projectRoot: '/repo/expected',
      });
      expect(gate.blockedStageNames).toContain('implementation');
      expect(gate.implementationContext?.classification).toBe('repository-scope-mismatch');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('freshness failure (stale) blocks', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeSupplementalContextTemplates('feature', meta.runFolder);
      populateKindWithRawEvidence(meta.runFolder, 'implementation', {
        freshness: { role: 'implementation', state: 'stale', comparedIdentities: [] },
      });
      const gate = gateFor(meta);
      expect(gate.blockedStageNames).toContain('implementation');
      expect(gate.implementationContext?.evaluatedFreshness).toBe('stale');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('provenance failure (missing provenance) blocks', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeSupplementalContextTemplates('feature', meta.runFolder);
      populateKindWithRawEvidence(meta.runFolder, 'implementation', { provenance: [] });
      const gate = gateFor(meta);
      expect(gate.blockedStageNames).toContain('implementation');
      expect(gate.implementationContext?.classification).toBe('provenance-missing');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('raw/supplemental (capsule/audit) contradiction blocks', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeSupplementalContextTemplates('feature', meta.runFolder);
      populateKindWithRawEvidence(
        meta.runFolder,
        'implementation',
        {},
        { roleAdequacy: { status: 'context insufficient and more retrieval required' } },
      );
      const gate = gateFor(meta);
      expect(gate.blockedStageNames).toContain('implementation');
      expect(gate.implementationContext?.blockingIssueCodes).toContain('CONTEXT_SOURCE_SUMMARY_MISMATCH');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('critical responsibility mapping failure blocks test context', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeSupplementalContextTemplates('feature', meta.runFolder);
      fs.writeFileSync(
        path.join(meta.runFolder, 'artifacts', 'test-strategy-packet.txt'),
        '\ntest responsibility ID: TST-GATE-001\ncriticality: critical\ntraces to: x\nsetup: x\naction or trigger: x\nexpected result: x\ntest level: unit\n',
        'utf8',
      );
      populateKindWithRawEvidence(meta.runFolder, 'test', {
        responsibilityMappings: { mappings: [{ responsibilityId: 'TST-GATE-001', mappingStatus: 'unmapped' }], truncated: false },
      });
      const gate = gateFor(meta);
      expect(gate.blockedStageNames).toContain('test-implementation');
      expect(gate.testContext?.classification).toBe('critical-responsibilities-unmapped');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('optional-only truncation with sufficient producer adequacy remains ready (nonblocking)', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeSupplementalContextTemplates('feature', meta.runFolder);
      populateKindWithRawEvidence(meta.runFolder, 'implementation', {
        truncation: { truncated: true, records: [{ requiredEvidenceLost: false }] },
      });
      const gate = gateFor(meta);
      expect(gate.blockedStageNames).not.toContain('implementation');
      expect(gate.implementationContext?.decision).toBe('ready');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('required-condition witness loss blocks independently of general truncation (v1.10.4 / Batch 1)', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeSupplementalContextTemplates('feature', meta.runFolder);
      populateKindWithRawEvidence(meta.runFolder, 'implementation', {
        roleConditionCoverage: [
          {
            conditionId: 'implementation.required-contract',
            role: 'implementation',
            required: true,
            retainedWitnessIds: [],
            conditionSatisfied: false,
            lostRequiredCondition: true,
          },
        ],
      });
      const gate = gateFor(meta);
      expect(gate.blockedStageNames).toContain('implementation');
      expect(gate.implementationContext?.blockingIssueCodes).toContain('CONTEXT_REQUIRED_CONDITION_WITNESS_LOST');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('deterministic blocking-code ordering across repeated evaluation', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      writeSupplementalContextTemplates('feature', meta.runFolder);
      populateKindWithRawEvidence(meta.runFolder, 'implementation', { provenance: [] });
      const gate1 = gateFor(meta);
      const gate2 = gateFor(meta);
      expect(gate1.blockingCodes).toEqual(gate2.blockingCodes);
      expect(gate1.blockedStageNames).toEqual(gate2.blockedStageNames);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('deterministic recommended-stage selection: implementation before test-implementation', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      // both blocked (fresh run): implementation must be recommended first,
      // matching the "repair implementation before test" policy tested at
      // the readiness-aggregation layer (runContextReadiness.ts).
      const gate = gateFor(meta);
      expect(gate.recommendedCorrectionStage).toBe('implementation');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('RunIntegrityGate: per-stage projection', () => {
  it('evaluateStageRunIntegrity blocks implementation and permits unrelated stages', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      const gate = gateFor(meta);
      const implDecision = evaluateStageRunIntegrity(gate, 'implementation');
      expect(implDecision.contextSensitive).toBe(true);
      expect(implDecision.blocked).toBe(true);
      expect(implDecision.stageMayRenderNormalPrompt).toBe(false);
      expect(implDecision.stageMayCreateOrAcceptCompletionArtifact).toBe(false);
      expect(implDecision.stageMayMarkComplete).toBe(false);
      expect(implDecision.stageMayAdvance).toBe(false);
      expect(implDecision.blockingReason).toBeTruthy();

      const unrelated = evaluateStageRunIntegrity(gate, 'behavior-model');
      expect(unrelated.contextSensitive).toBe(false);
      expect(unrelated.blocked).toBe(false);
      expect(unrelated.stageMayMarkComplete).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('isContextBlockedArtifactFile and resolveArtifactStateWithRunIntegrity agree, and force "blocked" over file presence', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts', 'implementation-report.txt'), 'Status: complete\n', 'utf8');
      const gate = gateFor(meta);
      expect(isContextBlockedArtifactFile(gate, meta.stages, 'artifacts/implementation-report.txt')).toBe(true);
      const stateFile = readArtifactStateFile(meta.runFolder);
      const resolved = resolveArtifactStateWithRunIntegrity(
        meta.runFolder,
        'artifacts/implementation-report.txt',
        meta.stages,
        stateFile,
        gate,
      );
      expect(resolved).toBe('blocked');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('is not context-sensitive for a stage without a repository-evidence requirement', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeFeatureRun(tmp);
      const gate = gateFor(meta);
      expect(isContextBlockedArtifactFile(gate, meta.stages, 'artifacts/behavior-model.txt')).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
