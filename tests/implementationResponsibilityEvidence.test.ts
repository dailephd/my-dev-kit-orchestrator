import {
  validateImplementationResponsibilities,
  evaluateImplementationEvidenceBridge,
  normalizeProductionFilePath,
  workflowHasProductionImplementationStage,
  ImplementationResponsibilityIssueCode,
} from '../src/instructions/implementationResponsibilityEvidence';
import { SemanticResponsibility } from '../src/instructions/semanticResponsibility';
import { RawEvidenceItemRef, RawResponsibilityMappingEntry } from '../src/instructions/myDevKitEvidenceSummary';

function codes(text: string): ImplementationResponsibilityIssueCode[] {
  return validateImplementationResponsibilities(text).issues.map((i) => i.code);
}

describe('validateImplementationResponsibilities: valid forms', () => {
  it('accepts one file', () => {
    const r = validateImplementationResponsibilities(
      'implementation responsibility ID: RSP-001\nproduction file: src/config/schema.ts\n',
    );
    expect(r.issues).toEqual([]);
    expect(r.declarations).toEqual([
      { responsibilityId: 'RSP-001', productionFiles: ['src/config/schema.ts'], productionSymbols: [], blockIndex: 0 },
    ]);
  });

  it('accepts one symbol', () => {
    const r = validateImplementationResponsibilities(
      'implementation responsibility ID: RSP-001\nproduction symbol: symbol:src/config/validate.ts#validateConfig',
    );
    expect(r.issues).toEqual([]);
    expect(r.declarations[0].productionSymbols).toEqual(['symbol:src/config/validate.ts#validateConfig']);
  });

  it('accepts file + symbol, repeated entries as lists, RSP-0001, and multiple blocks in order', () => {
    const text = [
      'Prose before any block is ignored. production file: not/a/field',
      '',
      'implementation responsibility ID: RSP-0001',
      'production file: src/a.ts',
      'production file: src/b.ts',
      'production symbol: symbol:src/a.ts#run',
      'production symbol: symbol:src/b.ts#go',
      'Some trailing prose that is not a field.',
      'implementation responsibility ID: RSP-002',
      'production file: src/c.ts',
    ].join('\n');
    const r = validateImplementationResponsibilities(text);
    expect(r.issues).toEqual([]);
    expect(r.declarations).toEqual([
      {
        responsibilityId: 'RSP-0001',
        productionFiles: ['src/a.ts', 'src/b.ts'],
        productionSymbols: ['symbol:src/a.ts#run', 'symbol:src/b.ts#go'],
        blockIndex: 0,
      },
      { responsibilityId: 'RSP-002', productionFiles: ['src/c.ts'], productionSymbols: [], blockIndex: 1 },
    ]);
  });

  it('normalizes Windows separators to /', () => {
    const r = validateImplementationResponsibilities(
      'implementation responsibility ID: RSP-001\nproduction file: src\\config\\schema.ts\nproduction symbol: symbol:src\\a.ts#run',
    );
    expect(r.issues).toEqual([]);
    expect(r.declarations[0].productionFiles).toEqual(['src/config/schema.ts']);
    expect(r.declarations[0].productionSymbols).toEqual(['symbol:src/a.ts#run']);
  });

  it('preserves case', () => {
    expect(normalizeProductionFilePath('Src/Config.TS')).toBe('Src/Config.TS');
  });
});

describe('ID errors', () => {
  it('reports an empty ID', () => {
    expect(codes('implementation responsibility ID:\nproduction file: src/a.ts')).toEqual([
      'IMPLEMENTATION_RESPONSIBILITY_ID_MISSING',
    ]);
  });
  it.each(['RSP-01', 'RSP001', 'RESP-001', 'rsp-001', 'TST-SMOKE-001', 'feature/foo#case-1'])('rejects %s', (id) => {
    expect(codes(`implementation responsibility ID: ${id}\nproduction file: src/a.ts`)).toEqual([
      'IMPLEMENTATION_RESPONSIBILITY_ID_INVALID',
    ]);
  });
  it('reports duplicate blocks and keeps the first declaration', () => {
    const r = validateImplementationResponsibilities(
      [
        'implementation responsibility ID: RSP-001',
        'production file: src/a.ts',
        'implementation responsibility ID: RSP-001',
        'production file: src/b.ts',
      ].join('\n'),
    );
    expect(r.issues.map((i) => i.code)).toEqual(['IMPLEMENTATION_RESPONSIBILITY_DUPLICATE']);
    expect(r.duplicateResponsibilityIds).toEqual(['RSP-001']);
    expect(r.declarations).toHaveLength(1);
    expect(r.declarations[0].productionFiles).toEqual(['src/a.ts']);
  });
});

describe('evidence errors', () => {
  const head = 'implementation responsibility ID: RSP-001\n';
  it('reports a block with no evidence', () => {
    expect(codes(head)).toEqual(['IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_MISSING']);
  });
  it.each([
    ['empty', ''],
    ['dot', '.'],
    ['windows absolute', 'C:\\repo\\src\\a.ts'],
    ['windows drive relative', 'C:src/a.ts'],
    ['posix absolute', '/etc/passwd'],
    ['UNC', '\\\\server\\share\\a.ts'],
    ['url', 'https://example.com/a.ts'],
    ['traversal', '../a.ts'],
    ['embedded traversal', 'src/../../a.ts'],
    ['nul', 'src/a\0.ts'],
  ])('rejects file: %s', (_n, value) => {
    expect(codes(`${head}production file: ${value}`)).toEqual(['IMPLEMENTATION_RESPONSIBILITY_FILE_INVALID']);
  });
  it.each([
    ['no prefix', 'src/a.ts#run'],
    ['file prefix', 'file:src/a.ts#run'],
    ['missing name', 'symbol:src/a.ts#'],
    ['missing path', 'symbol:#run'],
    ['missing separator', 'symbol:src/a.ts'],
    ['two separators', 'symbol:src/a.ts#a#b'],
    ['absolute', 'symbol:/src/a.ts#run'],
    ['traversal', 'symbol:../a.ts#run'],
    ['url', 'symbol:https://x.com/a.ts#run'],
  ])('rejects symbol: %s', (_n, value) => {
    expect(codes(`${head}production symbol: ${value}`)).toEqual(['IMPLEMENTATION_RESPONSIBILITY_SYMBOL_INVALID']);
  });
  it('reports duplicate normalized files and symbols with one shared code', () => {
    const r = validateImplementationResponsibilities(
      `${head}production file: src/a.ts\nproduction file: src\\a.ts\nproduction symbol: symbol:src/a.ts#x\nproduction symbol: symbol:src/a.ts#x`,
    );
    expect(r.issues.map((i) => i.code)).toEqual([
      'IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_DUPLICATE',
      'IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_DUPLICATE',
    ]);
    expect(r.declarations[0].productionFiles).toEqual(['src/a.ts']);
    expect(r.declarations[0].productionSymbols).toEqual(['symbol:src/a.ts#x']);
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

function sym(file: string, name: string): RawEvidenceItemRef {
  return { id: `symbol:${file}#${name}`, itemKind: 'symbol', path: file };
}

function mapping(id: string, items: RawEvidenceItemRef[], mappingStatus = 'mapped'): RawResponsibilityMappingEntry {
  return { responsibilityId: id, mappingStatus, productionSymbols: items };
}

function decl(text: string) {
  const r = validateImplementationResponsibilities(text);
  expect(r.issues).toEqual([]);
  return r.declarations;
}

function evaluate(
  strategy: SemanticResponsibility[],
  declarationText: string,
  mappings: RawResponsibilityMappingEntry[],
  truncated = false,
) {
  return evaluateImplementationEvidenceBridge({
    semanticResponsibilities: strategy,
    declarations: declarationText ? decl(declarationText) : [],
    evidence: { responsibilityMappings: mappings, responsibilityMappingsTruncated: truncated },
  });
}

const BLOCK = 'implementation responsibility ID: RSP-001\nproduction file: src/a.ts\nproduction symbol: symbol:src/a.ts#run';

describe('bridge states', () => {
  it('corroborated: every declared reference matches exactly; producer partially-mapped is not a failure', () => {
    const r = evaluate([rsp('RSP-001')], BLOCK, [mapping('RSP-001', [sym('src/a.ts', 'run')], 'partially-mapped')]);
    expect(r.issues).toEqual([]);
    expect(r.responsibilities[0]).toEqual({
      responsibilityId: 'RSP-001',
      criticality: 'critical',
      declaredProductionFiles: ['src/a.ts'],
      declaredProductionSymbols: ['symbol:src/a.ts#run'],
      corroboratedProductionFiles: ['src/a.ts'],
      corroboratedProductionSymbols: ['symbol:src/a.ts#run'],
      uncorroboratedProductionFiles: [],
      uncorroboratedProductionSymbols: [],
      producerMappingStatus: 'partially-mapped',
      state: 'corroborated',
    });
  });

  it('partially-corroborated: file matches, symbol does not', () => {
    const r = evaluate([rsp('RSP-001')], BLOCK, [mapping('RSP-001', [sym('src/a.ts', 'other')])]);
    expect(r.responsibilities[0].state).toBe('partially-corroborated');
    expect(r.issues).toEqual([
      expect.objectContaining({
        code: 'IMPLEMENTATION_RESPONSIBILITY_EVIDENCE_UNCORROBORATED',
        context: 'symbol:src/a.ts#run',
      }),
    ]);
  });

  it('uncorroborated: nothing matches', () => {
    const r = evaluate([rsp('RSP-001')], BLOCK, [mapping('RSP-001', [sym('src/z.ts', 'zed')])]);
    expect(r.responsibilities[0].state).toBe('uncorroborated');
    expect(r.issues.map((i) => i.context)).toEqual(['src/a.ts', 'symbol:src/a.ts#run']);
  });

  it('uncorroborated when the same-ID mapping has no productionSymbols (legacy producer)', () => {
    const r = evaluate([rsp('RSP-001')], BLOCK, [{ responsibilityId: 'RSP-001', mappingStatus: 'mapped' }]);
    expect(r.responsibilities[0].state).toBe('uncorroborated');
  });

  it('missing-declaration', () => {
    const r = evaluate([rsp('RSP-001')], '', [mapping('RSP-001', [sym('src/a.ts', 'run')])]);
    expect(r.responsibilities[0].state).toBe('missing-declaration');
    expect(r.issues.map((i) => i.code)).toEqual(['IMPLEMENTATION_RESPONSIBILITY_DECLARATION_MISSING']);
  });

  it('orphan declaration is surfaced and never becomes a responsibility', () => {
    const r = evaluate(
      [rsp('RSP-001')],
      `${BLOCK}\nimplementation responsibility ID: RSP-999\nproduction file: src/x.ts`,
      [mapping('RSP-001', [sym('src/a.ts', 'run')])],
    );
    expect(r.responsibilities.map((x) => x.responsibilityId)).toEqual(['RSP-001']);
    expect(r.issues.map((i) => [i.code, i.responsibilityId])).toEqual([['IMPLEMENTATION_RESPONSIBILITY_ORPHAN', 'RSP-999']]);
  });

  it('producer-mapping-unavailable (not truncated)', () => {
    const r = evaluate([rsp('RSP-001')], BLOCK, [mapping('RSP-002', [sym('src/a.ts', 'run')])]);
    expect(r.responsibilities[0].state).toBe('producer-mapping-unavailable');
    expect(r.issues.map((i) => i.code)).toEqual(['IMPLEMENTATION_RESPONSIBILITY_PRODUCER_MAPPING_MISSING']);
  });

  it('distinguishes truncation from absence', () => {
    const r = evaluate([rsp('RSP-001')], BLOCK, [], true);
    expect(r.responsibilities[0].state).toBe('producer-mapping-unavailable');
    expect(r.issues.map((i) => i.code)).toEqual(['IMPLEMENTATION_RESPONSIBILITY_PRODUCER_MAPPING_TRUNCATED']);
  });

  it('carries criticality without enforcing it', () => {
    const r = evaluate([rsp('RSP-001', 'noncritical')], BLOCK, [mapping('RSP-001', [sym('src/a.ts', 'run')])]);
    expect(r.responsibilities[0].criticality).toBe('noncritical');
  });

  it('matches a symbol via explicit symbolId and a file via id', () => {
    const r = evaluate([rsp('RSP-001')], BLOCK, [
      mapping('RSP-001', [
        { id: 'node-1', symbolId: 'symbol:src/a.ts#run' },
        { id: 'src/a.ts', itemKind: 'file' },
      ]),
    ]);
    expect(r.responsibilities[0].state).toBe('corroborated');
  });
});

describe('bridge exactness', () => {
  const cases: Array<[string, string, RawEvidenceItemRef]> = [
    ['same basename, different directory', 'production file: src/a.ts', sym('lib/a.ts', 'x')],
    ['case-different path', 'production file: src/a.ts', sym('src/A.ts', 'x')],
    ['path substring', 'production file: src/a.ts', sym('src/a.ts.bak', 'x')],
    ['path suffix', 'production file: a.ts', sym('src/a.ts', 'x')],
    ['same symbol name, different file', 'production symbol: symbol:src/a.ts#run', sym('src/b.ts', 'run')],
    ['symbol suffix only', 'production symbol: symbol:src/a.ts#run', sym('src/a.ts', 'runAll')],
    ['symbol name prefix', 'production symbol: symbol:src/a.ts#runAll', sym('src/a.ts', 'run')],
  ];
  it.each(cases)('does not match: %s', (_n, line, item) => {
    const r = evaluate([rsp('RSP-001')], `implementation responsibility ID: RSP-001\n${line}`, [mapping('RSP-001', [item])]);
    expect(r.responsibilities[0].state).toBe('uncorroborated');
  });
});

describe('shared producer evidence', () => {
  it('corroborates two responsibilities from identical producer evidence without collapsing them or asserting causality', () => {
    const shared = [sym('src/a.ts', 'run'), sym('src/b.ts', 'go')];
    const text = [
      'implementation responsibility ID: RSP-001',
      'production symbol: symbol:src/a.ts#run',
      'implementation responsibility ID: RSP-002',
      'production symbol: symbol:src/b.ts#go',
    ].join('\n');
    const r = evaluate([rsp('RSP-001'), rsp('RSP-002')], text, [mapping('RSP-001', shared), mapping('RSP-002', shared)]);
    expect(r.responsibilities.map((x) => [x.responsibilityId, x.state])).toEqual([
      ['RSP-001', 'corroborated'],
      ['RSP-002', 'corroborated'],
    ]);
    expect(r.responsibilities[0].corroboratedProductionSymbols).toEqual(['symbol:src/a.ts#run']);
    expect(r.responsibilities[1].corroboratedProductionSymbols).toEqual(['symbol:src/b.ts#go']);
    expect(JSON.stringify(r)).not.toMatch(/caus/i);
  });

  it('uses the same-ID mapping, not another responsibility mapping', () => {
    const r = evaluate([rsp('RSP-001')], BLOCK, [
      mapping('RSP-002', [sym('src/a.ts', 'run')]),
      mapping('RSP-001', [sym('src/z.ts', 'zed')]),
    ]);
    expect(r.responsibilities[0].state).toBe('uncorroborated');
  });
});

describe('purity and applicability', () => {
  it('is deterministic and does not mutate inputs', () => {
    const strategy = [rsp('RSP-001')];
    const declarations = decl(BLOCK);
    const evidence = { responsibilityMappings: [mapping('RSP-001', [sym('src/a.ts', 'run')])], responsibilityMappingsTruncated: false };
    const snapshot = JSON.stringify([strategy, declarations, evidence]);
    const a = evaluateImplementationEvidenceBridge({ semanticResponsibilities: strategy, declarations, evidence });
    const b = evaluateImplementationEvidenceBridge({ semanticResponsibilities: strategy, declarations, evidence });
    expect(a).toEqual(b);
    expect(JSON.stringify([strategy, declarations, evidence])).toBe(snapshot);
  });

  it('derives production-implementation applicability from workflow definitions', () => {
    for (const mode of ['feature', 'repair', 'refactor', 'harden', 'extraction']) {
      expect(workflowHasProductionImplementationStage(mode)).toBe(true);
    }
    expect(workflowHasProductionImplementationStage('test')).toBe(false);
    expect(workflowHasProductionImplementationStage('greenfield')).toBe(false);
    expect(workflowHasProductionImplementationStage('unknown')).toBe(false);
  });
});
