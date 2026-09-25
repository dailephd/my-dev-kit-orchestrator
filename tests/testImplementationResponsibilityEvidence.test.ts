import {
  validateTestImplementationResponsibilities,
  evaluateTestImplementationBridge,
  workflowHasTestImplementationStage,
  TestImplementationIssueCode,
} from '../src/instructions/testImplementationResponsibilityEvidence';
import { normalizeProductionFilePath } from '../src/instructions/implementationResponsibilityEvidence';
import { normalizeProjectRelativePath } from '../src/instructions/responsibilityEvidenceShared';
import { SemanticResponsibility } from '../src/instructions/semanticResponsibility';
import { RawEvidenceItemRef, RawResponsibilityMappingEntry } from '../src/instructions/myDevKitEvidenceSummary';

function codes(text: string): TestImplementationIssueCode[] {
  return validateTestImplementationResponsibilities(text).issues.map((i) => i.code);
}

const HEAD = 'test implementation responsibility ID: RSP-001\n';

describe('structural validation: valid forms', () => {
  it('accepts one file', () => {
    const r = validateTestImplementationResponsibilities(`${HEAD}test file: tests/config/validate.spec.ts`);
    expect(r.issues).toEqual([]);
    expect(r.declarations).toEqual([
      { responsibilityId: 'RSP-001', testFiles: ['tests/config/validate.spec.ts'], blockIndex: 0 },
    ]);
  });

  it('accepts repeated files as list entries, RSP-0001, and multiple blocks; ignores leading prose', () => {
    const text = [
      'Notes. test file: not/a/field',
      'test implementation responsibility ID: RSP-0001',
      'test file: tests/a.spec.ts',
      'test file: src/__tests__/parser.test.ts',
      'some trailing prose',
      'test implementation responsibility ID: RSP-002',
      'test file: app/src/test/java/ExampleUnitTest.kt',
    ].join('\n');
    const r = validateTestImplementationResponsibilities(text);
    expect(r.issues).toEqual([]);
    expect(r.declarations).toEqual([
      { responsibilityId: 'RSP-0001', testFiles: ['tests/a.spec.ts', 'src/__tests__/parser.test.ts'], blockIndex: 0 },
      { responsibilityId: 'RSP-002', testFiles: ['app/src/test/java/ExampleUnitTest.kt'], blockIndex: 1 },
    ]);
  });

  it('normalizes Windows separators', () => {
    const r = validateTestImplementationResponsibilities(`${HEAD}test file: tests\\config\\a.spec.ts`);
    expect(r.declarations[0].testFiles).toEqual(['tests/config/a.spec.ts']);
  });

  it('shares path semantics with the Batch 1 production-file normalizer', () => {
    for (const v of ['a/b.ts', 'a\\b.ts', './a.ts', '.', '', '/a', 'C:\\a', '\\\\s\\a', 'http://x/a', '../a', 'a\0b', 'A/B.ts']) {
      expect(normalizeProductionFilePath(v)).toEqual(normalizeProjectRelativePath(v));
    }
  });
});

describe('ID errors', () => {
  it('reports an empty ID', () => {
    expect(codes('test implementation responsibility ID:\ntest file: tests/a.ts')).toEqual([
      'TEST_IMPLEMENTATION_RESPONSIBILITY_ID_MISSING',
    ]);
  });
  it.each(['RSP-01', 'RSP001', 'RESP-001', 'rsp-001', 'TST-SMOKE-001'])('rejects %s', (id) => {
    expect(codes(`test implementation responsibility ID: ${id}\ntest file: tests/a.ts`)).toEqual([
      'TEST_IMPLEMENTATION_RESPONSIBILITY_ID_INVALID',
    ]);
  });
  it('reports duplicate blocks; the first stays authoritative and is not merged', () => {
    const r = validateTestImplementationResponsibilities(
      `${HEAD}test file: tests/a.ts\n${HEAD}test file: tests/b.ts`,
    );
    expect(r.issues.map((i) => i.code)).toEqual(['TEST_IMPLEMENTATION_RESPONSIBILITY_DUPLICATE']);
    expect(r.duplicateResponsibilityIds).toEqual(['RSP-001']);
    expect(r.declarations).toEqual([{ responsibilityId: 'RSP-001', testFiles: ['tests/a.ts'], blockIndex: 0 }]);
  });
});

describe('evidence errors', () => {
  it('reports a block with no test file', () => {
    expect(codes(HEAD)).toEqual(['TEST_IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_MISSING']);
  });
  it.each([
    ['blank', ''],
    ['windows absolute', 'C:\\repo\\tests\\a.test.ts'],
    ['posix absolute', '/tests/a.test.ts'],
    ['UNC', '\\\\server\\share\\a.test.ts'],
    ['url', 'https://example.com/a.test.ts'],
    ['traversal', '../tests/a.test.ts'],
    ['nul', 'tests/a\0.test.ts'],
  ])('rejects %s', (_n, value) => {
    expect(codes(`${HEAD}test file: ${value}`)).toEqual(['TEST_IMPLEMENTATION_RESPONSIBILITY_FILE_INVALID']);
  });
  it('reports duplicate normalized files', () => {
    const r = validateTestImplementationResponsibilities(`${HEAD}test file: tests/a.ts\ntest file: tests\\a.ts`);
    expect(r.issues.map((i) => i.code)).toEqual(['TEST_IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_DUPLICATE']);
    expect(r.declarations[0].testFiles).toEqual(['tests/a.ts']);
  });
});

// ─── Bridge ─────────────────────────────────────────────────────────────────

function rsp(id: string, criticality: 'critical' | 'noncritical' = 'critical'): SemanticResponsibility {
  return {
    responsibilityId: id,
    criticality,
    responsibility: 'r',
    upstreamTraceIds: ['REQ-001'],
    setup: 's',
    actionOrTrigger: 'a',
    expectedResult: 'e',
    testLevel: 'unit',
    blockIndex: 0,
  };
}

const tf = (p: string): RawEvidenceItemRef => ({ id: p, itemKind: 'test-file', path: p });

function mapping(id: string, tests: RawEvidenceItemRef[], mappingStatus = 'mapped'): RawResponsibilityMappingEntry {
  return { responsibilityId: id, mappingStatus, proposedOrExistingTestFiles: tests };
}

function evaluate(
  strategy: SemanticResponsibility[],
  declarationText: string,
  mappings: RawResponsibilityMappingEntry[],
  truncated = false,
) {
  const v = validateTestImplementationResponsibilities(declarationText);
  expect(v.issues).toEqual([]);
  return evaluateTestImplementationBridge({
    semanticResponsibilities: strategy,
    declarations: v.declarations,
    evidence: { responsibilityMappings: mappings, responsibilityMappingsTruncated: truncated },
  });
}

const ONE = `${HEAD}test file: tests/a.spec.ts`;
const TWO = `${HEAD}test file: tests/a.spec.ts\ntest file: tests/b.spec.ts`;

describe('test bridge states', () => {
  it('corroborated (producer partially-mapped does not matter)', () => {
    const r = evaluate([rsp('RSP-001')], ONE, [mapping('RSP-001', [tf('tests/a.spec.ts')], 'partially-mapped')]);
    expect(r.issues).toEqual([]);
    expect(r.responsibilities).toEqual([
      {
        responsibilityId: 'RSP-001',
        criticality: 'critical',
        declaredTestFiles: ['tests/a.spec.ts'],
        corroboratedTestFiles: ['tests/a.spec.ts'],
        uncorroboratedTestFiles: [],
        producerMappingStatus: 'partially-mapped',
        state: 'corroborated',
      },
    ]);
  });

  it('accepts an item without itemKind and a match by id', () => {
    const r = evaluate([rsp('RSP-001')], ONE, [mapping('RSP-001', [{ id: 'tests/a.spec.ts' }])]);
    expect(r.responsibilities[0].state).toBe('corroborated');
  });

  it('partially-corroborated', () => {
    const r = evaluate([rsp('RSP-001')], TWO, [mapping('RSP-001', [tf('tests/a.spec.ts')])]);
    expect(r.responsibilities[0].state).toBe('partially-corroborated');
    expect(r.issues.map((i) => [i.code, i.context])).toEqual([
      ['TEST_IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_UNCORROBORATED', 'tests/b.spec.ts'],
    ]);
  });

  it('uncorroborated', () => {
    const r = evaluate([rsp('RSP-001')], ONE, [mapping('RSP-001', [tf('tests/z.spec.ts')])]);
    expect(r.responsibilities[0].state).toBe('uncorroborated');
  });

  it('uncorroborated for a legacy mapping without test-file evidence', () => {
    const r = evaluate([rsp('RSP-001')], ONE, [{ responsibilityId: 'RSP-001', mappingStatus: 'mapped' }]);
    expect(r.responsibilities[0].state).toBe('uncorroborated');
  });

  it('missing-declaration', () => {
    const r = evaluate([rsp('RSP-001')], '', []);
    expect(r.responsibilities[0].state).toBe('missing-declaration');
    expect(r.issues.map((i) => i.code)).toEqual(['TEST_IMPLEMENTATION_RESPONSIBILITY_DECLARATION_MISSING']);
  });

  it('producer-mapping-unavailable', () => {
    const r = evaluate([rsp('RSP-001')], ONE, [mapping('RSP-002', [tf('tests/a.spec.ts')])]);
    expect(r.responsibilities[0].state).toBe('producer-mapping-unavailable');
    expect(r.issues.map((i) => i.code)).toEqual(['TEST_IMPLEMENTATION_RESPONSIBILITY_PRODUCER_MAPPING_MISSING']);
  });

  it('distinguishes truncation', () => {
    const r = evaluate([rsp('RSP-001')], ONE, [], true);
    expect(r.issues.map((i) => i.code)).toEqual(['TEST_IMPLEMENTATION_RESPONSIBILITY_PRODUCER_MAPPING_TRUNCATED']);
  });

  it('surfaces orphans without creating responsibilities', () => {
    const r = evaluate([rsp('RSP-001')], `${ONE}\ntest implementation responsibility ID: RSP-999\ntest file: tests/x.ts`, [
      mapping('RSP-001', [tf('tests/a.spec.ts')]),
    ]);
    expect(r.responsibilities.map((x) => x.responsibilityId)).toEqual(['RSP-001']);
    expect(r.issues.map((i) => [i.code, i.responsibilityId])).toEqual([['TEST_IMPLEMENTATION_RESPONSIBILITY_ORPHAN', 'RSP-999']]);
  });

  it('carries criticality without enforcing it', () => {
    const r = evaluate([rsp('RSP-001', 'noncritical')], ONE, [mapping('RSP-001', [tf('tests/a.spec.ts')])]);
    expect(r.responsibilities[0].criticality).toBe('noncritical');
  });
});

describe('exactness negative controls', () => {
  const cases: Array<[string, string, RawEvidenceItemRef]> = [
    ['same basename in another directory', 'tests/a.spec.ts', tf('other/a.spec.ts')],
    ['suffix only', 'a.spec.ts', tf('tests/a.spec.ts')],
    ['substring', 'tests/a.spec.ts', tf('tests/a.spec.ts.snap')],
    ['case difference', 'tests/a.spec.ts', tf('tests/A.spec.ts')],
  ];
  it.each(cases)('does not match: %s', (_n, declared, item) => {
    const r = evaluate([rsp('RSP-001')], `${HEAD}test file: ${declared}`, [mapping('RSP-001', [item])]);
    expect(r.responsibilities[0].state).toBe('uncorroborated');
  });

  it('does not match a production file that is not in proposedOrExistingTestFiles', () => {
    const r = evaluate([rsp('RSP-001')], `${HEAD}test file: src/a.ts`, [
      { responsibilityId: 'RSP-001', mappingStatus: 'mapped', productionSymbols: [{ id: 'symbol:src/a.ts#run', path: 'src/a.ts' }] },
    ]);
    expect(r.responsibilities[0].state).toBe('uncorroborated');
  });

  it('uses the same-ID mapping only', () => {
    const r = evaluate([rsp('RSP-001')], ONE, [
      mapping('RSP-002', [tf('tests/a.spec.ts')]),
      mapping('RSP-001', [tf('tests/z.spec.ts')]),
    ]);
    expect(r.responsibilities[0].state).toBe('uncorroborated');
  });
});

describe('purity and applicability', () => {
  it('is deterministic and does not mutate inputs', () => {
    const strategy = [rsp('RSP-001')];
    const declarations = validateTestImplementationResponsibilities(ONE).declarations;
    const evidence = { responsibilityMappings: [mapping('RSP-001', [tf('tests/a.spec.ts')])], responsibilityMappingsTruncated: false };
    const snapshot = JSON.stringify([strategy, declarations, evidence]);
    const a = evaluateTestImplementationBridge({ semanticResponsibilities: strategy, declarations, evidence });
    const b = evaluateTestImplementationBridge({ semanticResponsibilities: strategy, declarations, evidence });
    expect(a).toEqual(b);
    expect(JSON.stringify([strategy, declarations, evidence])).toBe(snapshot);
  });

  it('derives applicability from workflow definitions', () => {
    for (const mode of ['feature', 'repair', 'test', 'refactor', 'harden', 'extraction']) {
      expect(workflowHasTestImplementationStage(mode)).toBe(true);
    }
    expect(workflowHasTestImplementationStage('greenfield')).toBe(false);
    expect(workflowHasTestImplementationStage('unknown')).toBe(false);
  });
});
