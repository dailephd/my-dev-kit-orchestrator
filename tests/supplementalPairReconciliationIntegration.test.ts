// v1.2.2 Batch 3 (F-007): integration tests proving evaluateContextReadiness
// reconciles the packet and retrieval-report declarations instead of
// letting the packet's value silently win via `??` precedence.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { evaluateContextReadiness } from '../src/instructions/contextReadiness';
import { writeSupplementalContextTemplates } from '../src/instructions/supplementalContextTemplates';
import { STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS } from '../src/instructions/stageRepositoryEvidenceRequirements';
import { fillRequiredSections } from './readyContextTestHelpers';

const implRequirement = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find((r) => r.stageId === 'stage.feature.implementation')!;
const testRequirement = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find((r) => r.stageId === 'stage.feature.test-implementation')!;

function makeRunFolder(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-pair-recon-'));
  fs.mkdirSync(path.join(dir, 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'reports'), { recursive: true });
  return dir;
}

function writeRawCapsule(runFolder: string, name: string, overrides: Record<string, unknown> = {}): string {
  const p = path.join(runFolder, name);
  fs.writeFileSync(
    p,
    JSON.stringify({
      schemaVersion: '1.0.0',
      tool: { name: 'my-dev-kit', version: '1.10.2' },
      index: { indexPath: '/idx', manifestPath: '/idx/manifest.json' },
      request: { role: 'implementation' },
      roleContext: { role: 'implementation' },
      roleAdequacy: { status: 'context sufficient for implementation' },
      freshness: { role: 'implementation', state: 'fresh', comparedIdentities: [{ label: 'afterIndexPath', value: '/idx' }] },
      responsibilityMappings: { mappings: [], truncated: false },
      truncation: { truncated: false, records: [] },
      fullFileFallback: { used: 0 },
      provenance: [{ id: 'p1' }],
      warnings: [],
      ...overrides,
    }),
    'utf8',
  );
  return p;
}

// Populates a run folder for `kind`, applying independent text patches to
// the packet and report metadata before evaluation. Both documents point at
// the same raw capsule/audit by default (callers patch the "Source context
// capsule"/"Source retrieval audit" lines directly when a path-mismatch
// scenario is wanted).
function populate(
  runFolder: string,
  kind: 'implementation' | 'test',
  packetPatch: (t: string) => string = (t) => t,
  reportPatch: (t: string) => string = (t) => t,
  capsuleOverrides: Record<string, unknown> = {},
) {
  writeSupplementalContextTemplates('feature', runFolder);
  const packetRel = kind === 'implementation' ? 'artifacts/implementation-context-packet.txt' : 'artifacts/test-context-packet.txt';
  const reportRel = kind === 'implementation' ? 'reports/implementation-context-retrieval-report.txt' : 'reports/test-context-retrieval-report.txt';
  const packetPath = path.join(runFolder, packetRel);
  const reportPath = path.join(runFolder, reportRel);
  const role = kind === 'implementation' ? 'implementation' : 'test-implementation';
  const capsulePath = writeRawCapsule(runFolder, `${kind}-capsule.json`, { request: { role }, roleContext: { role }, ...capsuleOverrides });
  const auditPath = writeRawCapsule(runFolder, `${kind}-audit.json`, { request: { role }, roleContext: { role }, ...capsuleOverrides });

  const packetKind = kind === 'implementation' ? 'implementation-context-packet' : 'test-context-packet';

  let packetText = fs
    .readFileSync(packetPath, 'utf8')
    .replace('Status: template', 'Status: populated')
    .replace('Source context capsule: unknown', `Source context capsule: ${capsulePath}`)
    .replace('Source retrieval audit: unknown', `Source retrieval audit: ${auditPath}`);
  packetText = fillRequiredSections(packetPatch(packetText), packetKind);
  fs.writeFileSync(packetPath, packetText, 'utf8');

  let reportText = fs
    .readFileSync(reportPath, 'utf8')
    .replace('Status: template', 'Status: populated')
    .replace('Source context capsule: unknown', `Source context capsule: ${capsulePath}`)
    .replace('Source retrieval audit: unknown', `Source retrieval audit: ${auditPath}`);
  reportText = reportPatch(reportText);
  fs.writeFileSync(reportPath, reportText, 'utf8');

  return { capsulePath, auditPath };
}

function evalImpl(runFolder: string) {
  return evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
}
function evalTest(runFolder: string) {
  return evaluateContextReadiness({ requirement: testRequirement, stageId: testRequirement.stageId, runFolder, mode: 'feature' });
}

describe('supplemental pair reconciliation: precedence-regression cases (F-007)', () => {
  it('packet fresh / report stale blocks with a blocking issue and no ready result', () => {
    const runFolder = makeRunFolder();
    populate(runFolder, 'implementation', (t) => t.replace('Freshness: unknown', 'Freshness: fresh'), (t) => t.replace('Freshness: unknown', 'Freshness: stale'));
    const result = evalImpl(runFolder);
    expect(result.decision).toBe('refresh-required');
    expect(result.blockingIssueCodes).toContain('CONTEXT_SUPPLEMENTAL_SOURCE_MISMATCH');
  });

  it('packet stale / report fresh blocks', () => {
    const runFolder = makeRunFolder();
    populate(runFolder, 'implementation', (t) => t.replace('Freshness: unknown', 'Freshness: stale'), (t) => t.replace('Freshness: unknown', 'Freshness: fresh'));
    const result = evalImpl(runFolder);
    expect(result.decision).toBe('refresh-required');
  });

  it('packet sufficient / report insufficient blocks', () => {
    const runFolder = makeRunFolder();
    populate(runFolder, 'implementation', (t) => t.replace('Adequacy: unknown', 'Adequacy: sufficient'), (t) => t.replace('Adequacy: unknown', 'Adequacy: insufficient'));
    const result = evalImpl(runFolder);
    expect(result.decision).toBe('refresh-required');
  });

  it('packet insufficient / report sufficient blocks', () => {
    const runFolder = makeRunFolder();
    populate(runFolder, 'implementation', (t) => t.replace('Adequacy: unknown', 'Adequacy: insufficient'), (t) => t.replace('Adequacy: unknown', 'Adequacy: sufficient'));
    const result = evalImpl(runFolder);
    expect(result.decision).toBe('refresh-required');
  });

  it('different required-truncation declarations block', () => {
    const runFolder = makeRunFolder();
    populate(runFolder, 'implementation', (t) => t.replace('Required evidence truncated: unknown', 'Required evidence truncated: yes'), (t) => t.replace('Required evidence truncated: unknown', 'Required evidence truncated: no'));
    const result = evalImpl(runFolder);
    expect(result.decision).toBe('refresh-required');
  });

  it('different repository scopes block', () => {
    const runFolder = makeRunFolder();
    populate(runFolder, 'implementation', (t) => t, (t) => t.replace('Repository scope: single-repository', 'Repository scope: source-target'));
    const result = evalImpl(runFolder);
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('repository-scope-mismatch');
  });

  it('different active index (declared "Index identity") values block', () => {
    const runFolder = makeRunFolder();
    populate(runFolder, 'implementation', (t) => t.replace('Index identity: unknown', 'Index identity: /idx'), (t) => t.replace('Index identity: unknown', 'Index identity: /other-idx'));
    const result = evalImpl(runFolder);
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('index-identity-mismatch');
  });

  it('different declared after-index values block', () => {
    const runFolder = makeRunFolder();
    populate(runFolder, 'implementation', (t) => t.replace('After index: unknown', 'After index: /idx'), (t) => t.replace('After index: unknown', 'After index: /other-after'));
    const result = evalImpl(runFolder);
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('index-identity-mismatch');
  });

  it('different capsule paths block and neither source is trusted (raw evidence is never opened)', () => {
    const runFolder = makeRunFolder();
    const decoy = writeRawCapsule(runFolder, 'decoy-capsule.json');
    populate(runFolder, 'implementation', (t) => t, (t) => t.replace(/Source context capsule: .*/, `Source context capsule: ${decoy}`));
    const result = evalImpl(runFolder);
    expect(result.decision).toBe('refresh-required');
    expect(result.sourceCapsulePath).toBeUndefined();
    expect(result.sourceAuditPath).toBeUndefined();
  });

  it('different audit paths block and neither source is trusted', () => {
    const runFolder = makeRunFolder();
    const decoy = writeRawCapsule(runFolder, 'decoy-audit.json');
    populate(runFolder, 'implementation', (t) => t, (t) => t.replace(/Source retrieval audit: .*/, `Source retrieval audit: ${decoy}`));
    const result = evalImpl(runFolder);
    expect(result.decision).toBe('refresh-required');
  });

  it('a matching pair with declared real values agreeing remains ready', () => {
    const runFolder = makeRunFolder();
    const patch = (t: string) => t.replace('Freshness: unknown', 'Freshness: fresh').replace('Adequacy: unknown', 'Adequacy: sufficient').replace('Index identity: unknown', 'Index identity: /idx').replace('After index: unknown', 'After index: /idx');
    populate(runFolder, 'implementation', patch, patch);
    const result = evalImpl(runFolder);
    expect(result.decision).toBe('ready');
  });
});

describe('supplemental pair reconciliation: optionality (one-sided values permitted)', () => {
  it('packet declares freshness, report leaves it "unknown" -- packet value carries forward, no block', () => {
    const runFolder = makeRunFolder();
    populate(runFolder, 'implementation', (t) => t.replace('Freshness: unknown', 'Freshness: fresh'), (t) => t);
    const result = evalImpl(runFolder);
    expect(result.decision).toBe('ready');
    expect(result.declaredFreshness).toBe('fresh');
  });

  it('report declares freshness, packet leaves it "unknown" -- report value carries forward, no block', () => {
    const runFolder = makeRunFolder();
    populate(runFolder, 'implementation', (t) => t, (t) => t.replace('Freshness: unknown', 'Freshness: fresh'));
    const result = evalImpl(runFolder);
    expect(result.decision).toBe('ready');
    expect(result.declaredFreshness).toBe('fresh');
  });

  it('both sides leave the optional capsule/audit path declarations at "unknown" -> source-reference-missing (not a disagreement)', () => {
    const runFolder = makeRunFolder();
    writeSupplementalContextTemplates('feature', runFolder);
    const packetPath = path.join(runFolder, 'artifacts/implementation-context-packet.txt');
    const reportPath = path.join(runFolder, 'reports/implementation-context-retrieval-report.txt');
    for (const p of [packetPath, reportPath]) {
      let text = fs.readFileSync(p, 'utf8').replace('Status: template', 'Status: populated');
      if (p === packetPath) text = fillRequiredSections(text, 'implementation-context-packet');
      fs.writeFileSync(p, text, 'utf8');
    }
    const result = evalImpl(runFolder);
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('source-reference-missing');
  });
});

describe('supplemental pair reconciliation: test-kind responsibility-mapping fields', () => {
  const STRATEGY = `
test responsibility ID: TST-001
criticality: critical
traces to: x
setup: x
action or trigger: x
expected result: x
test level: unit
`;

  function writeStrategy(runFolder: string) {
    fs.writeFileSync(path.join(runFolder, 'artifacts', 'test-strategy-packet.txt'), STRATEGY, 'utf8');
  }

  it('different "Responsibility mappings truncated" declarations block', () => {
    const runFolder = makeRunFolder();
    writeStrategy(runFolder);
    populate(
      runFolder,
      'test',
      (t) => t.replace('Responsibility mappings truncated: unknown', 'Responsibility mappings truncated: yes'),
      (t) => t.replace('Responsibility mappings truncated: unknown', 'Responsibility mappings truncated: no'),
      { responsibilityMappings: { mappings: [{ responsibilityId: 'TST-001', mappingStatus: 'mapped' }], truncated: false } },
    );
    const result = evalTest(runFolder);
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('responsibility-mappings-truncated');
  });

  it('different "Critical responsibility mapping status" declarations block', () => {
    const runFolder = makeRunFolder();
    writeStrategy(runFolder);
    populate(
      runFolder,
      'test',
      (t) => t.replace('Critical responsibility mapping status: unknown', 'Critical responsibility mapping status: fully-mapped'),
      (t) => t.replace('Critical responsibility mapping status: unknown', 'Critical responsibility mapping status: partially-mapped'),
      { responsibilityMappings: { mappings: [{ responsibilityId: 'TST-001', mappingStatus: 'mapped' }], truncated: false } },
    );
    const result = evalTest(runFolder);
    expect(result.decision).toBe('refresh-required');
  });

  it('a matching test-kind pair with a fully mapped critical responsibility remains ready', () => {
    const runFolder = makeRunFolder();
    writeStrategy(runFolder);
    populate(
      runFolder,
      'test',
      (t) => t,
      (t) => t,
      { responsibilityMappings: { mappings: [{ responsibilityId: 'TST-001', mappingStatus: 'mapped' }], truncated: false } },
    );
    const result = evalTest(runFolder);
    expect(result.decision).toBe('ready');
  });
});

describe('supplemental pair reconciliation: deterministic ordering', () => {
  it('the same contradiction always yields the same classification and blocking issue codes', () => {
    const runFolder1 = makeRunFolder();
    const runFolder2 = makeRunFolder();
    const packetPatch = (t: string) => t.replace('Freshness: unknown', 'Freshness: fresh');
    const reportPatch = (t: string) => t.replace('Freshness: unknown', 'Freshness: stale');
    populate(runFolder1, 'implementation', packetPatch, reportPatch);
    populate(runFolder2, 'implementation', packetPatch, reportPatch);
    const r1 = evalImpl(runFolder1);
    const r2 = evalImpl(runFolder2);
    expect(r1.classification).toBe(r2.classification);
    expect(r1.blockingIssueCodes).toEqual(r2.blockingIssueCodes);
  });
});

describe('supplemental pair reconciliation: Batch 1 and Batch 2 regressions retained', () => {
  it('Batch 1: a raw capsule/audit freshness contradiction still blocks', () => {
    const runFolder = makeRunFolder();
    populate(runFolder, 'implementation', (t) => t, (t) => t, {});
    // Directly break capsule-vs-audit agreement (Batch 1 concern), independent of packet/report.
    const capsulePath = path.join(runFolder, 'implementation-capsule.json');
    const data = JSON.parse(fs.readFileSync(capsulePath, 'utf8'));
    data.freshness.state = 'stale';
    fs.writeFileSync(capsulePath, JSON.stringify(data), 'utf8');
    const result = evalImpl(runFolder);
    expect(result.decision).toBe('refresh-required');
  });

  it('Batch 2: a repository-identity mismatch against the active run still blocks', () => {
    const runFolder = makeRunFolder();
    populate(runFolder, 'implementation', (t) => t, (t) => t, { index: { indexPath: '/idx', manifestPath: '/idx/manifest.json', projectRoot: '/repo/unrelated' } });
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature', projectRoot: '/repo/orchestrator' });
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('repository-scope-mismatch');
  });
});
