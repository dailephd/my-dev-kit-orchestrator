import {
  validateSemanticResponsibilities,
  validateSemanticResponsibilitiesFromParsed,
  SemanticResponsibilityIssueCode,
} from '../src/instructions/semanticResponsibility';
import {
  TEST_STRATEGY_SOURCE_REQUIREMENTS,
  parseTestResponsibilityBlocks,
} from '../src/instructions/testResponsibilityCriticality';

interface Overrides {
  id?: string | null;
  criticality?: string | null;
  responsibility?: string | null;
  traces?: string | null;
  extra?: string[];
}

function block(o: Overrides = {}): string {
  const line = (k: string, v: string | null | undefined, d: string): string[] =>
    v === null ? [] : [`${k}: ${v === undefined ? d : v}`];
  return [
    ...line('test responsibility ID', o.id, 'RSP-001'),
    ...line('criticality', o.criticality, 'critical'),
    ...line('responsibility', o.responsibility, 'Reject malformed configuration before execution'),
    ...line('traces to', o.traces, 'REQ-002, BEH-004, INV-003'),
    'setup: malformed configuration input',
    'action or trigger: invoke configuration validation',
    'expected result: validation fails before execution begins',
    'test level: unit',
    ...(o.extra ?? []),
  ].join('\n');
}

function codes(text: string): SemanticResponsibilityIssueCode[] {
  return validateSemanticResponsibilities(text).issues.map((i) => i.code);
}

describe('validateSemanticResponsibilities happy paths', () => {
  it('accepts a critical RSP', () => {
    const r = validateSemanticResponsibilities(block());
    expect(r.issues).toEqual([]);
    expect(r.responsibilities).toEqual([
      {
        responsibilityId: 'RSP-001',
        criticality: 'critical',
        responsibility: 'Reject malformed configuration before execution',
        upstreamTraceIds: ['REQ-002', 'BEH-004', 'INV-003'],
        setup: 'malformed configuration input',
        actionOrTrigger: 'invoke configuration validation',
        expectedResult: 'validation fails before execution begins',
        testLevel: 'unit',
        blockIndex: 0,
      },
    ]);
  });

  it('accepts noncritical, four-digit IDs, and multiple blocks in source order', () => {
    const text = [block({ id: 'RSP-0002', criticality: 'noncritical', traces: 'REQ-001' }), '', block({ id: 'RSP-1000' })].join('\n');
    const r = validateSemanticResponsibilities(text);
    expect(r.issues).toEqual([]);
    expect(r.responsibilities.map((x) => x.responsibilityId)).toEqual(['RSP-0002', 'RSP-1000']);
    expect(r.responsibilities[0].criticality).toBe('noncritical');
  });

  it.each(['REQ-001', 'CTX-001', 'BEH-001', 'INV-001', 'TRN-001', 'PSE-001'])('accepts upstream %s', (t) => {
    expect(codes(block({ traces: t }))).toEqual([]);
  });

  it('allows whitespace around commas', () => {
    const r = validateSemanticResponsibilities(block({ traces: 'REQ-001 ,  BEH-002' }));
    expect(r.issues).toEqual([]);
    expect(r.responsibilities[0].upstreamTraceIds).toEqual(['REQ-001', 'BEH-002']);
  });

  it('uses the same contract for all six strategy artifact kinds', () => {
    expect(TEST_STRATEGY_SOURCE_REQUIREMENTS.map((r) => r.mode).sort()).toEqual(
      ['extraction', 'feature', 'harden', 'refactor', 'repair', 'test'],
    );
    for (const req of TEST_STRATEGY_SOURCE_REQUIREMENTS) {
      const text = `${req.expectedArtifactKind}\n\n${block()}\n`;
      expect(validateSemanticResponsibilities(text).issues).toEqual([]);
    }
  });
});

describe('identity failures', () => {
  it('reports missing ID', () => {
    expect(codes(block({ id: null }))).toEqual(['SEMANTIC_RESPONSIBILITY_ID_MISSING']);
  });

  it.each(['RSP-01', 'RSP001', 'RESP-001', 'rsp-001'])('rejects malformed %s', (id) => {
    expect(codes(block({ id }))).toEqual(['SEMANTIC_RESPONSIBILITY_ID_INVALID']);
  });

  it('rejects legacy arbitrary IDs while the legacy parser still accepts them', () => {
    for (const id of ['TST-SMOKE-001', 'some-existing-responsibility', 'feature/foo#case-1']) {
      expect(codes(block({ id }))).toEqual(['SEMANTIC_RESPONSIBILITY_ID_INVALID']);
      const legacy = parseTestResponsibilityBlocks(block({ id }));
      expect(legacy.issues).toEqual([]);
      expect(legacy.responsibilities.map((r) => r.responsibilityId)).toEqual([id]);
    }
  });

  it('reports duplicate RSP', () => {
    const r = validateSemanticResponsibilities([block(), '', block()].join('\n'));
    expect(r.issues.map((i) => i.code)).toEqual(['SEMANTIC_RESPONSIBILITY_DUPLICATE']);
    expect(r.issues[0].blockIndex).toBe(1);
    expect(r.duplicateResponsibilityIds).toEqual(['RSP-001']);
  });
});

describe('criticality failures', () => {
  it('reports missing criticality', () => {
    expect(codes(block({ criticality: null }))).toEqual(['SEMANTIC_RESPONSIBILITY_CRITICALITY_MISSING']);
  });
  it.each(['high', 'optional', 'Critical'])('rejects %s', (c) => {
    expect(codes(block({ criticality: c }))).toEqual(['SEMANTIC_RESPONSIBILITY_CRITICALITY_INVALID']);
  });
});

describe('responsibility statement failures', () => {
  it('reports missing statement', () => {
    expect(codes(block({ responsibility: null }))).toEqual(['SEMANTIC_RESPONSIBILITY_STATEMENT_MISSING']);
  });
  it.each(['', '   ', 'TBD', '<statement>'])('reports blank/placeholder "%s"', (s) => {
    expect(codes(block({ responsibility: s }))).toEqual(['SEMANTIC_RESPONSIBILITY_STATEMENT_BLANK']);
  });
  it('reports duplicate fields without overriding the first value', () => {
    const r = validateSemanticResponsibilities(block({ extra: ['responsibility: A second statement'] }));
    expect(r.issues.map((i) => i.code)).toEqual(['SEMANTIC_RESPONSIBILITY_FIELD_DUPLICATE']);
    expect(r.responsibilities[0].responsibility).toBe('Reject malformed configuration before execution');
  });
  it('reports a missing required body field', () => {
    const text = block().replace('setup: malformed configuration input\n', '');
    expect(codes(text)).toEqual(['SEMANTIC_RESPONSIBILITY_FIELD_MISSING']);
  });
});

describe('trace failures', () => {
  it('reports missing traces-to', () => {
    expect(codes(block({ traces: null }))).toEqual(['SEMANTIC_RESPONSIBILITY_TRACES_MISSING']);
  });
  it('reports blank traces-to', () => {
    expect(codes(block({ traces: '  ' }))).toEqual(['SEMANTIC_RESPONSIBILITY_TRACES_MISSING']);
  });
  it.each(['REQ-01', 'REQ001', 'FOO-001', 'REQ-001,,BEH-001', 'BehaviorModel invariant #1'])(
    'reports malformed trace "%s"',
    (t) => {
      expect(codes(block({ traces: t }))).toContain('SEMANTIC_RESPONSIBILITY_TRACE_INVALID');
    },
  );
  it('reports duplicate trace', () => {
    expect(codes(block({ traces: 'REQ-001, REQ-001' }))).toEqual(['SEMANTIC_RESPONSIBILITY_TRACE_DUPLICATE']);
  });
  it.each(['RSP-001', 'RSP-002', 'TST-001', 'IMP-001', 'VER-001', 'RISK-001'])('rejects %s as upstream', (t) => {
    const r = validateSemanticResponsibilities(block({ traces: `REQ-001, ${t}` }));
    expect(r.issues.map((i) => i.code)).toEqual(['SEMANTIC_RESPONSIBILITY_TRACE_PREFIX_INVALID']);
    expect(r.responsibilities[0].upstreamTraceIds).toEqual(['REQ-001']);
  });
});

describe('purity and determinism', () => {
  it('returns identical output for identical input and does not mutate parsed input', () => {
    const text = [block(), '', block({ id: 'bad', traces: 'TST-001' })].join('\n');
    expect(validateSemanticResponsibilities(text)).toEqual(validateSemanticResponsibilities(text));

    const parsed = parseTestResponsibilityBlocks(text);
    const snapshot = JSON.stringify(parsed);
    validateSemanticResponsibilitiesFromParsed(parsed);
    expect(JSON.stringify(parsed)).toBe(snapshot);
  });

  it('preserves issue order by block', () => {
    const r = validateSemanticResponsibilities([block({ id: 'x' }), '', block({ criticality: 'high' })].join('\n'));
    expect(r.issues.map((i) => [i.blockIndex, i.code])).toEqual([
      [0, 'SEMANTIC_RESPONSIBILITY_ID_INVALID'],
      [1, 'SEMANTIC_RESPONSIBILITY_CRITICALITY_INVALID'],
    ]);
  });
});
