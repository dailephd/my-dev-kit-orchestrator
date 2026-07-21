import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { evaluateContextReadiness, notRequiredContextReadiness } from '../src/instructions/contextReadiness';
import { writeSupplementalContextTemplates } from '../src/instructions/supplementalContextTemplates';
import { STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS } from '../src/instructions/stageRepositoryEvidenceRequirements';
import { fillRequiredSections } from './readyContextTestHelpers';

const implRequirement = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find((r) => r.stageId === 'stage.feature.implementation')!;
const testRequirement = STAGE_REPOSITORY_EVIDENCE_REQUIREMENTS.find((r) => r.stageId === 'stage.feature.test-implementation')!;

function makeRunFolder(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-readiness-'));
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
      freshness: {
        role: 'implementation',
        state: 'fresh',
        comparedIdentities: [{ label: 'afterIndexPath', value: '/idx' }],
      },
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

function populateWithRawEvidence(
  runFolder: string,
  kind: 'implementation' | 'test',
  capsuleOverrides: Record<string, unknown> = {},
  auditOverrides: Record<string, unknown> = capsuleOverrides,
) {
  writeSupplementalContextTemplates('feature', runFolder);
  const packetRel = kind === 'implementation' ? 'artifacts/implementation-context-packet.txt' : 'artifacts/test-context-packet.txt';
  const reportRel = kind === 'implementation' ? 'reports/implementation-context-retrieval-report.txt' : 'reports/test-context-retrieval-report.txt';
  const packetPath = path.join(runFolder, packetRel);
  const reportPath = path.join(runFolder, reportRel);

  const role = kind === 'implementation' ? 'implementation' : 'test-implementation';
  const capsulePath = writeRawCapsule(runFolder, `${kind}-capsule.json`, { request: { role }, roleContext: { role }, freshness: { role, state: 'fresh', comparedIdentities: [{ label: 'afterIndexPath', value: '/idx' }] }, ...capsuleOverrides });
  const auditPath = writeRawCapsule(runFolder, `${kind}-audit.json`, { request: { role }, roleContext: { role }, freshness: { role, state: 'fresh', comparedIdentities: [{ label: 'afterIndexPath', value: '/idx' }] }, ...auditOverrides });

  const packetKind = kind === 'implementation' ? 'implementation-context-packet' : 'test-context-packet';
  for (const file of [packetPath, reportPath] as const) {
    let text = fs
      .readFileSync(file, 'utf8')
      .replace('Status: template', 'Status: populated')
      .replace('Source context capsule: unknown', `Source context capsule: ${capsulePath}`)
      .replace('Source retrieval audit: unknown', `Source retrieval audit: ${auditPath}`);
    if (file === packetPath) {
      text = fillRequiredSections(text, packetKind);
    }
    fs.writeFileSync(file, text, 'utf8');
  }

  return { packetPath, reportPath, capsulePath, auditPath };
}

describe('evaluateContextReadiness: common structural states', () => {
  it('missing files -> refresh-required / missing', () => {
    const runFolder = makeRunFolder();
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('missing');
  });

  it('starter templates -> refresh-required / template', () => {
    const runFolder = makeRunFolder();
    writeSupplementalContextTemplates('feature', runFolder);
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('template');
  });

  it('malformed packet -> refresh-required / malformed', () => {
    const runFolder = makeRunFolder();
    writeSupplementalContextTemplates('feature', runFolder);
    fs.writeFileSync(path.join(runFolder, 'artifacts', 'implementation-context-packet.txt'), 'garbage', 'utf8');
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('malformed');
  });

  it('populated documents with unknown raw-evidence references -> source-reference-missing', () => {
    const runFolder = makeRunFolder();
    writeSupplementalContextTemplates('feature', runFolder);
    const packetRel = 'artifacts/implementation-context-packet.txt';
    for (const rel of [packetRel, 'reports/implementation-context-retrieval-report.txt']) {
      const p = path.join(runFolder, rel);
      let text = fs.readFileSync(p, 'utf8').replace('Status: template', 'Status: populated');
      if (rel === packetRel) text = fillRequiredSections(text, 'implementation-context-packet');
      fs.writeFileSync(p, text, 'utf8');
    }
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('source-reference-missing');
  });
});

describe('evaluateContextReadiness: raw-evidence-driven states', () => {
  it('fully ready implementation context', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'implementation');
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('ready');
    expect(result.classification).toBe('ready');
    expect(result.evaluatedFreshness).toBe('fresh');
    expect(result.evaluatedAdequacy).toBe('sufficient');
    expect(result.readyWithAssumptions).toBe(false);
  });

  it('ready with assumptions when adequacy is sufficient-with-assumptions', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'implementation', {
      roleAdequacy: { status: 'context sufficient with listed assumptions' },
    });
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('ready');
    expect(result.readyWithAssumptions).toBe(true);
  });

  it('unknown freshness blocks', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'implementation', {
      freshness: { role: 'implementation', state: 'unknown', comparedIdentities: [] },
    });
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('freshness-unknown');
  });

  it('stale freshness blocks', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'implementation', {
      freshness: { role: 'implementation', state: 'stale', comparedIdentities: [] },
    });
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('stale');
  });

  it('a fresh declaration without valid after-index evidence is treated as unknown', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'implementation', {
      freshness: { role: 'implementation', state: 'fresh', comparedIdentities: [{ label: 'afterIndexPath', value: null }] },
    });
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('freshness-unknown');
  });

  it('insufficient adequacy blocks', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'implementation', {
      roleAdequacy: { status: 'context insufficient and more retrieval required' },
    });
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('inadequate');
  });

  it('conflict adequacy blocks', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'implementation', {
      roleAdequacy: { status: 'context conflict found and user or upstream stage decision required' },
    });
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('conflict');
  });

  it('unknown adequacy text blocks', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'implementation', { roleAdequacy: { status: 'something else entirely' } });
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('adequacy-unknown');
  });

  it('required-evidence truncation blocks', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'implementation', {
      truncation: { truncated: true, records: [{ requiredEvidenceLost: true }] },
    });
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('required-evidence-truncated');
  });

  it('optional-only truncation does not block, but is a warning', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'implementation', {
      truncation: { truncated: true, records: [{ requiredEvidenceLost: false }] },
    });
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('ready');
    expect(result.warnings.some((w) => w.includes('Optional-only'))).toBe(true);
  });

  it('missing provenance blocks', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'implementation', { provenance: [] });
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('provenance-missing');
  });

  it('unsupported raw schema major blocks', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'implementation', { schemaVersion: '2.0.0' });
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('source-evidence-unsupported-schema');
  });

  it('malformed raw JSON blocks', () => {
    const runFolder = makeRunFolder();
    const written = populateWithRawEvidence(runFolder, 'implementation');
    fs.writeFileSync(written.capsulePath, 'not json', 'utf8');
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('source-evidence-malformed');
  });
});

describe('evaluateContextReadiness: test-context criticality overlay', () => {
  function writeStrategy(runFolder: string, body: string) {
    fs.writeFileSync(path.join(runFolder, 'artifacts', 'test-strategy-packet.txt'), body, 'utf8');
  }

  const STRATEGY = `
test responsibility ID: TST-001
criticality: critical
traces to: x
setup: x
action or trigger: x
expected result: x
test level: unit
`;

  it('blocks when the TestStrategyPacket is missing', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'test');
    const result = evaluateContextReadiness({ requirement: testRequirement, stageId: testRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('test-strategy-missing');
  });

  it('ready when the critical responsibility is fully mapped', () => {
    const runFolder = makeRunFolder();
    writeStrategy(runFolder, STRATEGY);
    populateWithRawEvidence(runFolder, 'test', {
      responsibilityMappings: { mappings: [{ responsibilityId: 'TST-001', mappingStatus: 'mapped' }], truncated: false },
    });
    const result = evaluateContextReadiness({ requirement: testRequirement, stageId: testRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('ready');
    expect(result.criticalResponsibilitySummary?.criticalMapped).toBe(1);
  });

  it('blocks when a critical responsibility is unmapped', () => {
    const runFolder = makeRunFolder();
    writeStrategy(runFolder, STRATEGY);
    populateWithRawEvidence(runFolder, 'test', {
      responsibilityMappings: { mappings: [{ responsibilityId: 'TST-001', mappingStatus: 'unmapped' }], truncated: false },
    });
    const result = evaluateContextReadiness({ requirement: testRequirement, stageId: testRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('critical-responsibilities-unmapped');
    expect(result.affectedResponsibilityIds).toContain('TST-001');
  });

  it('blocks on responsibility-mapping truncation unless critical coverage is proven', () => {
    const runFolder = makeRunFolder();
    writeStrategy(runFolder, STRATEGY);
    populateWithRawEvidence(runFolder, 'test', {
      responsibilityMappings: { mappings: [{ responsibilityId: 'TST-001', mappingStatus: 'unmapped' }], truncated: true },
    });
    const result = evaluateContextReadiness({ requirement: testRequirement, stageId: testRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
  });

  it('truncation with proven full critical coverage remains a warning, not blocking', () => {
    const runFolder = makeRunFolder();
    writeStrategy(runFolder, STRATEGY);
    populateWithRawEvidence(runFolder, 'test', {
      responsibilityMappings: { mappings: [{ responsibilityId: 'TST-001', mappingStatus: 'mapped' }], truncated: true },
    });
    const result = evaluateContextReadiness({ requirement: testRequirement, stageId: testRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('ready');
    expect(result.warnings.some((w) => w.toLowerCase().includes('truncated'))).toBe(true);
  });
});

describe('notRequiredContextReadiness', () => {
  it('returns a not-required decision with empty issues', () => {
    const result = notRequiredContextReadiness('stage.greenfield.scaffold-plan', 'implementation', 'implementation');
    expect(result.decision).toBe('not-required');
    expect(result.classification).toBe('not-required');
    expect(result.issues).toEqual([]);
    expect(result.blockingIssueCodes).toEqual([]);
  });
});
