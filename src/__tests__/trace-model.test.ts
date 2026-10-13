import {
  TRACE_PREFIXES,
  TRACE_ID_RE,
  isValidTracePrefix,
  isValidTraceId,
  isMalformedTraceId,
  isUnsupportedPrefixTraceId,
  TRACE_TOKEN_BEFORE,
  TRACE_TOKEN_AFTER,
} from '../traceModel';

// ─── TRACE_PREFIXES ───────────────────────────────────────────────────────────

describe('TRACE_PREFIXES', () => {
  it('contains the eleven canonical prefixes', () => {
    expect(TRACE_PREFIXES).toEqual([
      'REQ', 'CTX', 'BEH', 'INV', 'TRN', 'PSE', 'TST', 'RSP', 'IMP', 'VER', 'RISK',
    ]);
  });

  it('has exactly 11 entries', () => {
    expect(TRACE_PREFIXES.length).toBe(11);
  });
});

// ─── TRACE_ID_RE ──────────────────────────────────────────────────────────────

describe('TRACE_ID_RE', () => {
  it('matches three-digit canonical IDs', () => {
    expect(TRACE_ID_RE.test('REQ-001')).toBe(true);
    expect(TRACE_ID_RE.test('BEH-042')).toBe(true);
    expect(TRACE_ID_RE.test('RISK-999')).toBe(true);
  });

  it('matches IDs with more than three digits', () => {
    expect(TRACE_ID_RE.test('REQ-0001')).toBe(true);
    expect(TRACE_ID_RE.test('TST-1234')).toBe(true);
  });

  it('rejects IDs with fewer than three digits', () => {
    expect(TRACE_ID_RE.test('BEH-01')).toBe(false);
    expect(TRACE_ID_RE.test('BEH-1')).toBe(false);
    expect(TRACE_ID_RE.test('REQ-0')).toBe(false);
  });

  it('rejects unknown prefixes', () => {
    expect(TRACE_ID_RE.test('FOO-001')).toBe(false);
    expect(TRACE_ID_RE.test('ABC-001')).toBe(false);
  });

  it('rejects lowercase IDs', () => {
    expect(TRACE_ID_RE.test('req-001')).toBe(false);
    expect(TRACE_ID_RE.test('beh-001')).toBe(false);
  });

  it('rejects IDs missing the dash', () => {
    expect(TRACE_ID_RE.test('BEH001')).toBe(false);
    expect(TRACE_ID_RE.test('REQ001')).toBe(false);
  });

  it('rejects IDs with trailing characters', () => {
    expect(TRACE_ID_RE.test('REQ-001x')).toBe(false);
    expect(TRACE_ID_RE.test('BEH-001 ')).toBe(false);
  });
});

// ─── isValidTracePrefix ───────────────────────────────────────────────────────

describe('isValidTracePrefix', () => {
  it('returns true for all canonical prefixes', () => {
    for (const prefix of TRACE_PREFIXES) {
      expect(isValidTracePrefix(prefix)).toBe(true);
    }
  });

  it('returns false for unknown prefixes', () => {
    expect(isValidTracePrefix('FOO')).toBe(false);
    expect(isValidTracePrefix('ABC')).toBe(false);
    expect(isValidTracePrefix('UNKNOWN')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidTracePrefix('')).toBe(false);
  });

  it('returns false for lowercase variants', () => {
    expect(isValidTracePrefix('req')).toBe(false);
    expect(isValidTracePrefix('beh')).toBe(false);
  });

  it('returns false for partial prefix matches', () => {
    expect(isValidTracePrefix('RE')).toBe(false);
    expect(isValidTracePrefix('RIS')).toBe(false);
  });
});

// ─── isValidTraceId ───────────────────────────────────────────────────────────

describe('isValidTraceId', () => {
  it('returns true for well-formed IDs', () => {
    expect(isValidTraceId('REQ-001')).toBe(true);
    expect(isValidTraceId('CTX-002')).toBe(true);
    expect(isValidTraceId('BEH-042')).toBe(true);
    expect(isValidTraceId('INV-100')).toBe(true);
    expect(isValidTraceId('TRN-001')).toBe(true);
    expect(isValidTraceId('PSE-001')).toBe(true);
    expect(isValidTraceId('TST-001')).toBe(true);
    expect(isValidTraceId('RSP-001')).toBe(true);
    expect(isValidTraceId('IMP-001')).toBe(true);
    expect(isValidTraceId('VER-001')).toBe(true);
    expect(isValidTraceId('RISK-001')).toBe(true);
  });

  it('returns true for IDs with more than 3 digits', () => {
    expect(isValidTraceId('REQ-0001')).toBe(true);
    expect(isValidTraceId('BEH-9999')).toBe(true);
  });

  it('returns false for lowercase IDs', () => {
    expect(isValidTraceId('req-001')).toBe(false);
    expect(isValidTraceId('Beh-001')).toBe(false);
  });

  it('returns false for IDs with only 2 digits', () => {
    expect(isValidTraceId('BEH-01')).toBe(false);
    expect(isValidTraceId('REQ-00')).toBe(false);
  });

  it('returns false for IDs with only 1 digit', () => {
    expect(isValidTraceId('BEH-1')).toBe(false);
  });

  it('returns false for IDs missing the dash', () => {
    expect(isValidTraceId('BEH001')).toBe(false);
    expect(isValidTraceId('REQ001')).toBe(false);
  });

  it('returns false for unknown prefixes', () => {
    expect(isValidTraceId('FOO-001')).toBe(false);
    expect(isValidTraceId('XYZ-123')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidTraceId('')).toBe(false);
  });

  it('returns false for IDs with letters in the number part', () => {
    expect(isValidTraceId('REQ-00A')).toBe(false);
    expect(isValidTraceId('BEH-abc')).toBe(false);
  });
});

// ─── isMalformedTraceId ───────────────────────────────────────────────────────

describe('isMalformedTraceId', () => {
  it('returns true for near-miss IDs missing the dash', () => {
    expect(isMalformedTraceId('BEH001')).toBe(true);
    expect(isMalformedTraceId('REQ001')).toBe(true);
    expect(isMalformedTraceId('TST042')).toBe(true);
  });

  it('returns true for near-miss IDs with too few digits', () => {
    expect(isMalformedTraceId('BEH-1')).toBe(true);
    expect(isMalformedTraceId('BEH-01')).toBe(true);
  });

  // v1.6.2: token-level malformed detection is limited to recognized prefixes.
  // An unknown prefix is only a trace-ID attempt in declaration/link context,
  // which is classified by findMalformedTraceIds (see trace-parser.test.ts).
  it('returns false for unknown prefix with digit suffix (context-free)', () => {
    expect(isMalformedTraceId('FOO-001')).toBe(false);
    expect(isMalformedTraceId('XYZ-123')).toBe(false);
    expect(isMalformedTraceId('ABC-999')).toBe(false);
  });

  it('returns false for ordinary technical identifiers', () => {
    expect(isMalformedTraceId('ECO-00')).toBe(false);
    expect(isMalformedTraceId('ECO-01')).toBe(false);
    expect(isMalformedTraceId('UTF-8')).toBe(false);
  });

  it('keeps canonical IDs valid and recognized-prefix near misses malformed', () => {
    for (const id of ['REQ-001', 'BEH-042', 'RSP-0002', 'RISK-1234']) {
      expect(isValidTraceId(id)).toBe(true);
      expect(isMalformedTraceId(id)).toBe(false);
    }
    for (const id of ['REQ-01', 'BEH-1', 'RSP-01', 'REQ001', 'BEH001', 'RSP001']) {
      expect(isMalformedTraceId(id)).toBe(true);
    }
  });

  it('returns false for valid trace IDs', () => {
    expect(isMalformedTraceId('REQ-001')).toBe(false);
    expect(isMalformedTraceId('BEH-042')).toBe(false);
    expect(isMalformedTraceId('RISK-001')).toBe(false);
  });

  it('returns false for ordinary words', () => {
    expect(isMalformedTraceId('hello')).toBe(false);
    expect(isMalformedTraceId('the')).toBe(false);
    expect(isMalformedTraceId('')).toBe(false);
  });

  it('returns false for lowercase tokens', () => {
    expect(isMalformedTraceId('beh-001')).toBe(false);
    expect(isMalformedTraceId('req-001')).toBe(false);
  });

  it('returns false for single-letter prefixes', () => {
    expect(isMalformedTraceId('A-001')).toBe(false);
  });
});

describe('isUnsupportedPrefixTraceId', () => {
  it('matches canonical-shaped IDs with an unsupported prefix', () => {
    expect(isUnsupportedPrefixTraceId('FOO-001')).toBe(true);
    expect(isUnsupportedPrefixTraceId('XYZ-1234')).toBe(true);
  });

  it('does not match valid IDs, recognized-prefix near misses or non-trace shapes', () => {
    expect(isUnsupportedPrefixTraceId('REQ-001')).toBe(false);
    expect(isUnsupportedPrefixTraceId('REQ-01')).toBe(false);
    expect(isUnsupportedPrefixTraceId('ECO-00')).toBe(false);
    expect(isUnsupportedPrefixTraceId('UTF-8')).toBe(false);
    expect(isUnsupportedPrefixTraceId('foo-001')).toBe(false);
    expect(isUnsupportedPrefixTraceId('A-001')).toBe(false);
    expect(isUnsupportedPrefixTraceId('')).toBe(false);
  });
});

describe('RSP trace family (v1.5 Batch 0)', () => {
  it('accepts RSP-NNN with three or more digits', () => {
    expect(isValidTraceId('RSP-001')).toBe(true);
    expect(isValidTraceId('RSP-0001')).toBe(true);
    expect(isValidTraceId('RSP-1000')).toBe(true);
  });

  it.each(['RSP-01', 'RSP001', 'RESP-001', 'rsp-001'])('rejects %s', (id) => {
    expect(isValidTraceId(id)).toBe(false);
  });

  it('treats malformed RSP-like tokens as malformed trace IDs', () => {
    expect(isMalformedTraceId('RSP-01')).toBe(true);
    expect(isMalformedTraceId('RSP001')).toBe(true);
    expect(isMalformedTraceId('RSP-001')).toBe(false);
  });
});

describe("RSP trace family (v1.5 Batch 0)", () => {
  it.each(["RSP-01", "RSP001", "RESP-001", "rsp-001"])("rejects %s", (id) => {
    expect(isValidTraceId(id)).toBe(false);
  });

  it("accepts four-digit RSP and flags malformed RSP-like tokens", () => {
    expect(isValidTraceId("RSP-1000")).toBe(true);
    expect(isMalformedTraceId("RSP-01")).toBe(true);
    expect(isMalformedTraceId("RSP001")).toBe(true);
    expect(isMalformedTraceId("RSP-001")).toBe(false);
  });
});

// ─── Token boundary policy (v1.6.2 T06) ──────────────────────────────────────

describe('trace token boundaries', () => {
  const find = (text: string): string[] => {
    const re = new RegExp(`${TRACE_TOKEN_BEFORE}((?:${TRACE_PREFIXES.join('|')})-[0-9]{3,})${TRACE_TOKEN_AFTER}`, 'g');
    return [...text.matchAll(re)].map((m) => m[1]);
  };

  it.each([
    'CODE-REQ-001-suffix',
    'REQ-001X',
    'PREFIX-REQ-001-suffix',
    'REQ-001_foo',
    'docs/REQ-001.md',
    'path/REQ-001/file',
  ])('does not extract a partial ID from %s', (text) => {
    expect(find(text)).toEqual([]);
  });

  it.each([
    ['REQ-001: requirement', 'REQ-001'],
    ['See REQ-001 for details.', 'REQ-001'],
    ['(REQ-001)', 'REQ-001'],
    ['`REQ-001`', 'REQ-001'],
    ['REQ-001,', 'REQ-001'],
    ['REQ-0001 ok', 'REQ-0001'],
    ['REQ-001.', 'REQ-001'],
  ])('extracts a standalone ID from %s', (text, id) => {
    expect(find(text)).toEqual([id]);
  });
});
