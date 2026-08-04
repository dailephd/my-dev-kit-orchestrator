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

describe('evaluateContextReadiness: raw capsule/audit contradictions fail closed (v1.2.2 Batch 1 / F-005)', () => {
  function contradictionCase(
    label: string,
    capsuleOverrides: Record<string, unknown>,
    auditOverrides: Record<string, unknown>,
  ) {
    it(`${label} -> refresh-required with a blocking CONTEXT_SOURCE_SUMMARY_MISMATCH and a primary blocker`, () => {
      const runFolder = makeRunFolder();
      populateWithRawEvidence(runFolder, 'implementation', capsuleOverrides, auditOverrides);
      const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
      expect(result.decision).toBe('refresh-required');
      expect(result.blockingIssueCodes).toContain('CONTEXT_SOURCE_SUMMARY_MISMATCH');
      expect(result.classification).not.toBe('ready');
      expect(result.decision).not.toBe('ready');
    });
  }

  contradictionCase(
    'capsule fresh / audit stale',
    {},
    { freshness: { role: 'implementation', state: 'stale', comparedIdentities: [] } },
  );

  contradictionCase(
    'capsule stale / audit fresh',
    { freshness: { role: 'implementation', state: 'stale', comparedIdentities: [] } },
    {},
  );

  contradictionCase(
    'capsule overall-adequacy sufficient / audit overall-adequacy insufficient',
    {},
    { contextAdequacy: { status: 'context insufficient and more retrieval required' } },
  );

  contradictionCase(
    'capsule overall-adequacy insufficient / audit overall-adequacy sufficient',
    { contextAdequacy: { status: 'context insufficient and more retrieval required' } },
    {},
  );

  contradictionCase(
    'capsule role-adequacy sufficient / audit role-adequacy insufficient',
    {},
    { roleAdequacy: { status: 'context insufficient and more retrieval required' } },
  );

  contradictionCase(
    'capsule role-adequacy insufficient / audit role-adequacy sufficient',
    { roleAdequacy: { status: 'context insufficient and more retrieval required' } },
    {},
  );

  contradictionCase(
    'required truncation false / true',
    {},
    { truncation: { truncated: true, records: [{ requiredEvidenceLost: true }] } },
  );

  contradictionCase(
    'fallback false / true',
    {},
    { fullFileFallback: { used: 1 } },
  );

  contradictionCase(
    'provenance present / mismatched count (missing evidence)',
    {},
    { provenance: [] },
  );

  contradictionCase(
    'responsibility mapping truncated: complete / incomplete',
    {},
    { responsibilityMappings: { mappings: [], truncated: true } },
  );

  contradictionCase(
    'different active (index) identities',
    {},
    { index: { indexPath: '/other-active', manifestPath: '/other-active/manifest.json' } },
  );

  contradictionCase(
    'different before-index identities',
    {
      freshness: {
        role: 'implementation',
        state: 'fresh',
        comparedIdentities: [
          { label: 'afterIndexPath', value: '/idx' },
          { label: 'beforeIndexPath', value: '/before-a' },
        ],
      },
    },
    {
      freshness: {
        role: 'implementation',
        state: 'fresh',
        comparedIdentities: [
          { label: 'afterIndexPath', value: '/idx' },
          { label: 'beforeIndexPath', value: '/before-b' },
        ],
      },
    },
  );

  contradictionCase(
    'different after-index identities',
    {},
    { freshness: { role: 'implementation', state: 'fresh', comparedIdentities: [{ label: 'afterIndexPath', value: '/other-after' }] } },
  );

  it('primary-blocker selection is deterministic: the same contradictory pair always yields the same classification', () => {
    const runFolder1 = makeRunFolder();
    const runFolder2 = makeRunFolder();
    const overrides = { freshness: { role: 'implementation', state: 'stale', comparedIdentities: [] } };
    populateWithRawEvidence(runFolder1, 'implementation', {}, overrides);
    populateWithRawEvidence(runFolder2, 'implementation', {}, overrides);
    const r1 = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder: runFolder1, mode: 'feature' });
    const r2 = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder: runFolder2, mode: 'feature' });
    expect(r1.classification).toBe(r2.classification);
    expect(r1.decision).toBe(r2.decision);
    expect(r1.blockingIssueCodes).toEqual(r2.blockingIssueCodes);
  });

  it('a matching (non-contradictory) raw pair with otherwise valid evidence remains ready', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'implementation');
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('ready');
    expect(result.blockingIssueCodes).not.toContain('CONTEXT_SOURCE_SUMMARY_MISMATCH');
  });
});

describe('evaluateContextReadiness: v1.10.4 condition-aware producer contract (v1.2.3 Batch 1)', () => {
  const SATISFIED_ROLE_CONDITION_COVERAGE = [
    {
      conditionId: 'implementation.selected-owner',
      role: 'implementation',
      required: true,
      retainedWitnessIds: ['owner-1'],
      conditionSatisfied: true,
      lostRequiredCondition: false,
    },
    {
      conditionId: 'implementation.required-contract',
      role: 'implementation',
      required: true,
      retainedWitnessIds: ['contract-1'],
      conditionSatisfied: true,
      lostRequiredCondition: false,
    },
  ];

  const LOST_ROLE_CONDITION_COVERAGE = [
    SATISFIED_ROLE_CONDITION_COVERAGE[0],
    {
      conditionId: 'implementation.required-contract',
      role: 'implementation',
      required: true,
      retainedWitnessIds: [],
      conditionSatisfied: false,
      lostRequiredCondition: true,
    },
  ];

  it('a v1.10.4 producer artifact with fully satisfied condition coverage remains ready', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'implementation', { roleConditionCoverage: SATISFIED_ROLE_CONDITION_COVERAGE });
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('ready');
  });

  it('a schema-major-1 producer artifact predating v1.10.4 (no roleConditionCoverage) remains supported', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'implementation');
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('ready');
  });

  it('optional-only truncation remains acceptable alongside sufficient-with-assumptions adequacy', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'implementation', {
      roleAdequacy: { status: 'context sufficient with listed assumptions' },
      truncation: { truncated: true, records: [{ requiredEvidenceLost: false }] },
      roleConditionCoverage: SATISFIED_ROLE_CONDITION_COVERAGE,
    });
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('ready');
    expect(result.readyWithAssumptions).toBe(true);
    expect(result.warnings.some((w) => w.toLowerCase().includes('truncat'))).toBe(true);
  });

  it('retained required-condition witnesses remain sufficient even when other evidence was truncated', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'implementation', {
      truncation: { truncated: true, records: [{ requiredEvidenceLost: false }] },
      roleConditionCoverage: SATISFIED_ROLE_CONDITION_COVERAGE,
    });
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('ready');
  });

  it('required-condition witness loss blocks independently of the generic truncation flag', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'implementation', { roleConditionCoverage: LOST_ROLE_CONDITION_COVERAGE });
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.blockingIssueCodes).toContain('CONTEXT_REQUIRED_CONDITION_WITNESS_LOST');
  });

  it('capsule roleConditionCoverage disagreeing with the audit fails closed', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(
      runFolder,
      'implementation',
      { roleConditionCoverage: LOST_ROLE_CONDITION_COVERAGE },
      { roleConditionCoverage: SATISFIED_ROLE_CONDITION_COVERAGE },
    );
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.blockingIssueCodes).toContain('CONTEXT_SOURCE_SUMMARY_MISMATCH');
  });

  it('audit roleConditionCoverage disagreeing with the capsule fails closed', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(
      runFolder,
      'implementation',
      { roleConditionCoverage: SATISFIED_ROLE_CONDITION_COVERAGE },
      { roleConditionCoverage: LOST_ROLE_CONDITION_COVERAGE },
    );
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.blockingIssueCodes).toContain('CONTEXT_SOURCE_SUMMARY_MISMATCH');
  });

  it('a malformed roleConditionCoverage field fails closed as malformed evidence, not silently ignored', () => {
    const runFolder = makeRunFolder();
    populateWithRawEvidence(runFolder, 'implementation', { roleConditionCoverage: 'not-an-array' });
    const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
    expect(result.decision).toBe('refresh-required');
    expect(result.classification).toBe('source-evidence-malformed');
  });

  describe('responsibility-mapping raw/supplemental reconciliation (v1.2.3 Batch 1)', () => {
    const CRITICAL_STRATEGY = `
test responsibility ID: TST-COND-001
criticality: critical
traces to: x
setup: x
action or trigger: x
expected result: x
test level: unit
`;

    function declareResponsibilityMappingsTruncated(runFolder: string, value: 'yes' | 'no') {
      for (const rel of ['artifacts/test-context-packet.txt', 'reports/test-context-retrieval-report.txt']) {
        const p = path.join(runFolder, rel);
        const text = fs.readFileSync(p, 'utf8').replace('Responsibility mappings truncated: unknown', `Responsibility mappings truncated: ${value}`);
        fs.writeFileSync(p, text, 'utf8');
      }
    }

    it('packet/report agreeing "no" while raw evidence truncated the mappings fails closed', () => {
      const runFolder = makeRunFolder();
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'test-strategy-packet.txt'), CRITICAL_STRATEGY, 'utf8');
      populateWithRawEvidence(runFolder, 'test', {
        responsibilityMappings: { mappings: [{ responsibilityId: 'TST-COND-001', mappingStatus: 'mapped' }], truncated: true },
      });
      declareResponsibilityMappingsTruncated(runFolder, 'no');
      const result = evaluateContextReadiness({ requirement: testRequirement, stageId: testRequirement.stageId, runFolder, mode: 'feature' });
      expect(result.decision).toBe('refresh-required');
      expect(result.blockingIssueCodes).toContain('CONTEXT_SOURCE_SUMMARY_MISMATCH');
    });

    it('packet/report agreeing "yes" while raw evidence was not truncated fails closed', () => {
      const runFolder = makeRunFolder();
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'test-strategy-packet.txt'), CRITICAL_STRATEGY, 'utf8');
      populateWithRawEvidence(runFolder, 'test', {
        responsibilityMappings: { mappings: [{ responsibilityId: 'TST-COND-001', mappingStatus: 'mapped' }], truncated: false },
      });
      declareResponsibilityMappingsTruncated(runFolder, 'yes');
      const result = evaluateContextReadiness({ requirement: testRequirement, stageId: testRequirement.stageId, runFolder, mode: 'feature' });
      expect(result.decision).toBe('refresh-required');
      expect(result.blockingIssueCodes).toContain('CONTEXT_SOURCE_SUMMARY_MISMATCH');
    });

    it('packet/report agreeing "no" while raw evidence was not truncated remains ready', () => {
      const runFolder = makeRunFolder();
      fs.writeFileSync(path.join(runFolder, 'artifacts', 'test-strategy-packet.txt'), CRITICAL_STRATEGY, 'utf8');
      populateWithRawEvidence(runFolder, 'test', {
        responsibilityMappings: { mappings: [{ responsibilityId: 'TST-COND-001', mappingStatus: 'mapped' }], truncated: false },
      });
      declareResponsibilityMappingsTruncated(runFolder, 'no');
      const result = evaluateContextReadiness({ requirement: testRequirement, stageId: testRequirement.stageId, runFolder, mode: 'feature' });
      expect(result.decision).toBe('ready');
    });
  });
});

describe('evaluateContextReadiness: identity enforcement (v1.2.2 Batch 2 / F-006)', () => {
  const ACTIVE_REPO = '/repo/orchestrator';

  describe('repository identity', () => {
    it('matching declared repository identity remains ready', () => {
      const runFolder = makeRunFolder();
      populateWithRawEvidence(runFolder, 'implementation', { index: { indexPath: '/idx', manifestPath: '/idx/manifest.json', projectRoot: ACTIVE_REPO } });
      const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature', projectRoot: ACTIVE_REPO });
      expect(result.decision).toBe('ready');
    });

    it('an equivalent normalized repository path (separator/case-insensitive drive) remains ready', () => {
      const runFolder = makeRunFolder();
      populateWithRawEvidence(runFolder, 'implementation', { index: { indexPath: '/idx', manifestPath: '/idx/manifest.json', projectRoot: 'C:/Users/dev/Repo' } });
      const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature', projectRoot: 'C:\\Users\\dev\\Repo\\' });
      expect(result.decision).toBe('ready');
    });

    it('a path containing spaces compares correctly', () => {
      const runFolder = makeRunFolder();
      const repo = 'C:\\Users\\dev\\My Project (2)\\repo';
      populateWithRawEvidence(runFolder, 'implementation', { index: { indexPath: '/idx', manifestPath: '/idx/manifest.json', projectRoot: repo } });
      const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature', projectRoot: repo });
      expect(result.decision).toBe('ready');
    });

    it('a wrong (unrelated) repository blocks with a deterministic primary blocker', () => {
      const runFolder = makeRunFolder();
      populateWithRawEvidence(runFolder, 'implementation', { index: { indexPath: '/idx', manifestPath: '/idx/manifest.json', projectRoot: '/repo/unrelated-project' } });
      const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature', projectRoot: ACTIVE_REPO });
      expect(result.decision).toBe('refresh-required');
      expect(result.classification).toBe('repository-scope-mismatch');
      expect(result.blockingIssueCodes).toContain('CONTEXT_SOURCE_REPOSITORY_MISMATCH');
    });

    it('a merely different (but real) repository path is never treated as equal to the active one', () => {
      const runFolder = makeRunFolder();
      populateWithRawEvidence(runFolder, 'implementation', { index: { indexPath: '/idx', manifestPath: '/idx/manifest.json', projectRoot: '/repo/orchestrator-lab' } });
      const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature', projectRoot: ACTIVE_REPO });
      expect(result.decision).toBe('refresh-required');
    });

    it('missing declared repository identity on both raw sources remains compatible (legacy schema-major-1 evidence)', () => {
      const runFolder = makeRunFolder();
      populateWithRawEvidence(runFolder, 'implementation');
      const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature', projectRoot: ACTIVE_REPO });
      expect(result.decision).toBe('ready');
    });

    it('caller not supplying an expected repository root leaves repository enforcement inactive (backward compatible)', () => {
      const runFolder = makeRunFolder();
      populateWithRawEvidence(runFolder, 'implementation', { index: { indexPath: '/idx', manifestPath: '/idx/manifest.json', projectRoot: '/repo/anything' } });
      const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
      expect(result.decision).toBe('ready');
    });

    it('an incomplete declared pair (capsule declares it, audit does not) blocks -- both the raw consistency check and the dedicated incomplete-pair check fire', () => {
      const runFolder = makeRunFolder();
      populateWithRawEvidence(
        runFolder,
        'implementation',
        { index: { indexPath: '/idx', manifestPath: '/idx/manifest.json', projectRoot: ACTIVE_REPO } },
        { index: { indexPath: '/idx', manifestPath: '/idx/manifest.json' } },
      );
      const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature', projectRoot: ACTIVE_REPO });
      expect(result.decision).toBe('refresh-required');
      // Batch 1's raw capsule/audit consistency check (findCapsuleAuditInconsistencies)
      // fires first and wins the deterministic primary-blocker slot.
      expect(result.classification).toBe('repository-scope-mismatch');
      expect(result.blockingIssueCodes).toContain('CONTEXT_SOURCE_SUMMARY_MISMATCH');
      expect(result.blockingIssueCodes).toContain('CONTEXT_SOURCE_REPOSITORY_INCOMPLETE');
    });
  });

  describe('declared index identity (packet vs. raw evidence)', () => {
    function withDeclaredIndexIdentity(runFolder: string, value: string) {
      const packetPath = path.join(runFolder, 'artifacts/implementation-context-packet.txt');
      const text = fs.readFileSync(packetPath, 'utf8').replace('Index identity: unknown', `Index identity: ${value}`);
      fs.writeFileSync(packetPath, text, 'utf8');
    }

    it('a matching declared index identity remains ready', () => {
      const runFolder = makeRunFolder();
      populateWithRawEvidence(runFolder, 'implementation');
      withDeclaredIndexIdentity(runFolder, '/idx');
      const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
      expect(result.decision).toBe('ready');
    });

    it('leaving the declared index identity as "unknown" (the template default) remains ready -- optional', () => {
      const runFolder = makeRunFolder();
      populateWithRawEvidence(runFolder, 'implementation');
      const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
      expect(result.decision).toBe('ready');
    });

    it('a mismatched declared index identity blocks', () => {
      const runFolder = makeRunFolder();
      populateWithRawEvidence(runFolder, 'implementation');
      withDeclaredIndexIdentity(runFolder, '/completely/unrelated/index/path');
      const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
      expect(result.decision).toBe('refresh-required');
      expect(result.classification).toBe('index-identity-mismatch');
      expect(result.blockingIssueCodes).toContain('CONTEXT_DECLARED_INDEX_IDENTITY_MISMATCH');
    });

    it('a malformed-but-present declared index identity blocks rather than crashing', () => {
      const runFolder = makeRunFolder();
      populateWithRawEvidence(runFolder, 'implementation');
      withDeclaredIndexIdentity(runFolder, 'not a path at all !!');
      expect(() =>
        evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' }),
      ).not.toThrow();
      const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
      expect(result.decision).toBe('refresh-required');
    });
  });

  describe('declared after-index identity (packet vs. raw evidence)', () => {
    function withDeclaredAfterIndex(runFolder: string, value: string) {
      const packetPath = path.join(runFolder, 'artifacts/implementation-context-packet.txt');
      const text = fs.readFileSync(packetPath, 'utf8').replace('After index: unknown', `After index: ${value}`);
      fs.writeFileSync(packetPath, text, 'utf8');
    }

    it('a matching declared after-index remains ready', () => {
      const runFolder = makeRunFolder();
      populateWithRawEvidence(runFolder, 'implementation');
      withDeclaredAfterIndex(runFolder, '/idx');
      const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
      expect(result.decision).toBe('ready');
    });

    it('a mismatched declared after-index blocks', () => {
      const runFolder = makeRunFolder();
      populateWithRawEvidence(runFolder, 'implementation');
      withDeclaredAfterIndex(runFolder, '/unrelated/after/index');
      const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
      expect(result.decision).toBe('refresh-required');
      expect(result.classification).toBe('index-identity-mismatch');
      expect(result.blockingIssueCodes).toContain('CONTEXT_DECLARED_AFTER_INDEX_MISMATCH');
    });
  });

  describe('role identity (regression: already enforced prior to Batch 2)', () => {
    it('the correct implementation role remains ready', () => {
      const runFolder = makeRunFolder();
      populateWithRawEvidence(runFolder, 'implementation');
      const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
      expect(result.decision).toBe('ready');
    });

    it('test-implementation role evidence supplied to an implementation stage blocks', () => {
      const runFolder = makeRunFolder();
      populateWithRawEvidence(runFolder, 'implementation', { request: { role: 'test-implementation' }, roleContext: { role: 'test-implementation' } });
      const result = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder, mode: 'feature' });
      expect(result.decision).toBe('refresh-required');
      expect(result.classification).toBe('role-mismatch');
    });
  });

  describe('deterministic ordering', () => {
    it('the same identity contradiction always produces the same classification and blocking issue codes', () => {
      const runFolder1 = makeRunFolder();
      const runFolder2 = makeRunFolder();
      const overrides = { index: { indexPath: '/idx', manifestPath: '/idx/manifest.json', projectRoot: '/repo/wrong' } };
      populateWithRawEvidence(runFolder1, 'implementation', overrides);
      populateWithRawEvidence(runFolder2, 'implementation', overrides);
      const r1 = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder: runFolder1, mode: 'feature', projectRoot: ACTIVE_REPO });
      const r2 = evaluateContextReadiness({ requirement: implRequirement, stageId: implRequirement.stageId, runFolder: runFolder2, mode: 'feature', projectRoot: ACTIVE_REPO });
      expect(r1.classification).toBe(r2.classification);
      expect(r1.blockingIssueCodes).toEqual(r2.blockingIssueCodes);
    });
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
