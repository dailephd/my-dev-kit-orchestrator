import {
  parseTraceIds,
  parseTraceLinks,
  findMalformedTraceIds,
  findDuplicateIds,
  findOrphanIds,
  findMissingLinkTargets,
  parseTrace,
  TraceId,
  TraceLink,
} from '../traceParser';

// ─── parseTraceIds ────────────────────────────────────────────────────────────

describe('parseTraceIds', () => {
  it('returns empty array for content with no trace IDs', () => {
    expect(parseTraceIds('no ids here')).toEqual([]);
    expect(parseTraceIds('')).toEqual([]);
  });

  it('finds a single trace ID', () => {
    const result = parseTraceIds('BEH-001: some behavior');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('BEH-001');
    expect(result[0].prefix).toBe('BEH');
    expect(result[0].num).toBe('001');
    expect(result[0].line).toBe(1);
  });

  it('finds multiple IDs on the same line', () => {
    const result = parseTraceIds('REQ-001 and REQ-002 are linked');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('REQ-001');
    expect(result[1].id).toBe('REQ-002');
  });

  it('finds IDs on different lines with correct line numbers', () => {
    const content = 'REQ-001: first\nBEH-002: second\nTST-003: third';
    const result = parseTraceIds(content);
    expect(result).toHaveLength(3);
    expect(result[0].line).toBe(1);
    expect(result[1].line).toBe(2);
    expect(result[2].line).toBe(3);
  });

  it('does not find malformed IDs', () => {
    const result = parseTraceIds('BEH001 and REQ-01 and FOO-001');
    expect(result).toHaveLength(0);
  });

  it('finds IDs from all valid prefixes', () => {
    const content = 'REQ-001 CTX-002 BEH-003 INV-004 TRN-005 PSE-006 TST-007 IMP-008 VER-009 RISK-010';
    const result = parseTraceIds(content);
    expect(result).toHaveLength(10);
    expect(result.map((r) => r.prefix)).toEqual([
      'REQ', 'CTX', 'BEH', 'INV', 'TRN', 'PSE', 'TST', 'IMP', 'VER', 'RISK',
    ]);
  });

  it('finds IDs embedded in prose', () => {
    const content = 'This implements BEH-042 as defined in REQ-001.';
    const result = parseTraceIds(content);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('BEH-042');
    expect(result[1].id).toBe('REQ-001');
  });

  it('finds IDs with more than 3 digits', () => {
    const result = parseTraceIds('REQ-0001 and BEH-9999');
    expect(result).toHaveLength(2);
    expect(result[0].num).toBe('0001');
    expect(result[1].num).toBe('9999');
  });
});

// ─── parseTraceLinks ─────────────────────────────────────────────────────────

describe('parseTraceLinks', () => {
  it('returns empty array for content with no links', () => {
    expect(parseTraceLinks('no links here')).toEqual([]);
    expect(parseTraceLinks('')).toEqual([]);
  });

  it('finds a single link expression', () => {
    const result = parseTraceLinks('REQ-001 -> BEH-001');
    expect(result).toHaveLength(1);
    expect(result[0].from).toBe('REQ-001');
    expect(result[0].to).toBe('BEH-001');
    expect(result[0].line).toBe(1);
  });

  it('finds multiple links on different lines', () => {
    const content = 'REQ-001 -> BEH-001\nBEH-001 -> PSE-001';
    const result = parseTraceLinks(content);
    expect(result).toHaveLength(2);
    expect(result[0].from).toBe('REQ-001');
    expect(result[1].from).toBe('BEH-001');
    expect(result[1].line).toBe(2);
  });

  it('handles links with varying whitespace around the arrow', () => {
    const content = 'REQ-001->BEH-001';
    const result = parseTraceLinks(content);
    expect(result).toHaveLength(1);
    expect(result[0].from).toBe('REQ-001');
    expect(result[0].to).toBe('BEH-001');
  });

  it('finds links between non-trace-ID tokens', () => {
    const result = parseTraceLinks('foo -> bar');
    expect(result).toHaveLength(1);
    expect(result[0].from).toBe('foo');
    expect(result[0].to).toBe('bar');
  });

  it('finds multiple links on the same line', () => {
    const result = parseTraceLinks('A -> B and C -> D');
    expect(result).toHaveLength(2);
  });
});

// ─── findMalformedTraceIds ────────────────────────────────────────────────────

describe('findMalformedTraceIds', () => {
  it('returns empty array for content with no malformed IDs', () => {
    expect(findMalformedTraceIds('hello world')).toEqual([]);
    expect(findMalformedTraceIds('')).toEqual([]);
  });

  it('finds IDs missing the dash', () => {
    const result = findMalformedTraceIds('BEH001 and REQ042');
    expect(result).toContain('BEH001');
    expect(result).toContain('REQ042');
  });

  it('finds IDs with unknown prefixes', () => {
    const result = findMalformedTraceIds('FOO-001 is malformed');
    expect(result).toContain('FOO-001');
  });

  it('does not flag valid trace IDs as malformed', () => {
    const result = findMalformedTraceIds('BEH-001 and REQ-042');
    expect(result).not.toContain('BEH-001');
    expect(result).not.toContain('REQ-042');
  });

  it('deduplicates malformed IDs', () => {
    const result = findMalformedTraceIds('BEH001 BEH001 BEH001');
    expect(result.filter((id) => id === 'BEH001')).toHaveLength(1);
  });

  it('does not flag lowercase tokens', () => {
    const result = findMalformedTraceIds('beh001 req-001');
    expect(result).toEqual([]);
  });
});

// ─── findDuplicateIds ─────────────────────────────────────────────────────────

describe('findDuplicateIds', () => {
  it('returns empty array when there are no duplicates', () => {
    const ids: TraceId[] = [
      { id: 'REQ-001', prefix: 'REQ', num: '001', line: 1 },
      { id: 'BEH-001', prefix: 'BEH', num: '001', line: 2 },
    ];
    expect(findDuplicateIds(ids)).toEqual([]);
  });

  it('returns duplicate IDs when they appear more than once', () => {
    const ids: TraceId[] = [
      { id: 'REQ-001', prefix: 'REQ', num: '001', line: 1 },
      { id: 'REQ-001', prefix: 'REQ', num: '001', line: 3 },
      { id: 'BEH-001', prefix: 'BEH', num: '001', line: 2 },
    ];
    const result = findDuplicateIds(ids);
    expect(result).toContain('REQ-001');
    expect(result).not.toContain('BEH-001');
  });

  it('returns multiple duplicate sets', () => {
    const ids: TraceId[] = [
      { id: 'REQ-001', prefix: 'REQ', num: '001', line: 1 },
      { id: 'REQ-001', prefix: 'REQ', num: '001', line: 2 },
      { id: 'BEH-002', prefix: 'BEH', num: '002', line: 3 },
      { id: 'BEH-002', prefix: 'BEH', num: '002', line: 4 },
    ];
    const result = findDuplicateIds(ids);
    expect(result).toContain('REQ-001');
    expect(result).toContain('BEH-002');
  });

  it('returns empty array for empty input', () => {
    expect(findDuplicateIds([])).toEqual([]);
  });
});

// ─── findOrphanIds ────────────────────────────────────────────────────────────

describe('findOrphanIds', () => {
  it('returns all IDs as orphans when there are no links', () => {
    const ids: TraceId[] = [
      { id: 'REQ-001', prefix: 'REQ', num: '001', line: 1 },
      { id: 'BEH-001', prefix: 'BEH', num: '001', line: 2 },
    ];
    const result = findOrphanIds(ids, []);
    expect(result).toContain('REQ-001');
    expect(result).toContain('BEH-001');
  });

  it('returns empty array when all IDs appear in links', () => {
    const ids: TraceId[] = [
      { id: 'REQ-001', prefix: 'REQ', num: '001', line: 1 },
      { id: 'BEH-001', prefix: 'BEH', num: '001', line: 2 },
    ];
    const links: TraceLink[] = [
      { from: 'REQ-001', to: 'BEH-001', line: 3 },
    ];
    expect(findOrphanIds(ids, links)).toEqual([]);
  });

  it('returns only unlinked IDs', () => {
    const ids: TraceId[] = [
      { id: 'REQ-001', prefix: 'REQ', num: '001', line: 1 },
      { id: 'BEH-001', prefix: 'BEH', num: '001', line: 2 },
      { id: 'TST-001', prefix: 'TST', num: '001', line: 3 },
    ];
    const links: TraceLink[] = [
      { from: 'REQ-001', to: 'BEH-001', line: 4 },
    ];
    const result = findOrphanIds(ids, links);
    expect(result).not.toContain('REQ-001');
    expect(result).not.toContain('BEH-001');
    expect(result).toContain('TST-001');
  });

  it('returns empty array for empty ID list', () => {
    expect(findOrphanIds([], [])).toEqual([]);
  });

  it('recognizes IDs appearing as link targets', () => {
    const ids: TraceId[] = [
      { id: 'BEH-001', prefix: 'BEH', num: '001', line: 1 },
    ];
    const links: TraceLink[] = [
      { from: 'REQ-001', to: 'BEH-001', line: 2 },
    ];
    expect(findOrphanIds(ids, links)).toEqual([]);
  });
});

// ─── findMissingLinkTargets ───────────────────────────────────────────────────

describe('findMissingLinkTargets', () => {
  it('returns empty array when all link targets are known', () => {
    const ids: TraceId[] = [
      { id: 'BEH-001', prefix: 'BEH', num: '001', line: 1 },
    ];
    const links: TraceLink[] = [
      { from: 'REQ-001', to: 'BEH-001', line: 2 },
    ];
    expect(findMissingLinkTargets(links, ids)).toEqual([]);
  });

  it('returns link targets that are not in the known ID set', () => {
    const ids: TraceId[] = [
      { id: 'REQ-001', prefix: 'REQ', num: '001', line: 1 },
    ];
    const links: TraceLink[] = [
      { from: 'REQ-001', to: 'BEH-999', line: 2 },
    ];
    const result = findMissingLinkTargets(links, ids);
    expect(result).toContain('BEH-999');
  });

  it('returns empty array when there are no links', () => {
    const ids: TraceId[] = [
      { id: 'REQ-001', prefix: 'REQ', num: '001', line: 1 },
    ];
    expect(findMissingLinkTargets([], ids)).toEqual([]);
  });

  it('does not report non-trace-ID link targets as missing', () => {
    const ids: TraceId[] = [];
    const links: TraceLink[] = [
      { from: 'foo', to: 'bar', line: 1 },
    ];
    expect(findMissingLinkTargets(links, ids)).toEqual([]);
  });

  it('deduplicates missing targets', () => {
    const ids: TraceId[] = [];
    const links: TraceLink[] = [
      { from: 'REQ-001', to: 'BEH-999', line: 1 },
      { from: 'REQ-002', to: 'BEH-999', line: 2 },
    ];
    const result = findMissingLinkTargets(links, ids);
    expect(result.filter((t) => t === 'BEH-999')).toHaveLength(1);
  });
});

// ─── parseTrace (composite) ───────────────────────────────────────────────────

describe('parseTrace', () => {
  it('returns empty result for empty content', () => {
    const result = parseTrace('');
    expect(result.ids).toEqual([]);
    expect(result.links).toEqual([]);
    expect(result.malformed).toEqual([]);
    expect(result.duplicateIds).toEqual([]);
    expect(result.orphanIds).toEqual([]);
    expect(result.missingLinkTargets).toEqual([]);
  });

  it('returns all IDs and links from a well-formed artifact', () => {
    const content = [
      'REQ-001: system must support trace IDs',
      'BEH-001: trace IDs are validated on parse',
      'REQ-001 -> BEH-001',
    ].join('\n');
    const result = parseTrace(content);
    // IDs found in declaration lines AND in the link line (REQ-001 and BEH-001 appear twice each)
    expect(result.ids).toHaveLength(4);
    expect(result.links).toHaveLength(1);
    expect(result.orphanIds).toEqual([]);
    expect(result.missingLinkTargets).toEqual([]);
  });

  it('detects duplicate IDs', () => {
    const content = 'REQ-001: first\nREQ-001: duplicate';
    const result = parseTrace(content);
    expect(result.duplicateIds).toContain('REQ-001');
  });

  it('detects orphan IDs when no links exist', () => {
    const content = 'BEH-001: orphan behavior\nTST-001: orphan test';
    const result = parseTrace(content);
    expect(result.orphanIds).toContain('BEH-001');
    expect(result.orphanIds).toContain('TST-001');
  });

  it('reports no missing link targets when both IDs appear in same content', () => {
    // parseTraceIds finds BEH-999 from the link line itself, so it is in known IDs
    const content = 'REQ-001 -> BEH-999';
    const result = parseTrace(content);
    expect(result.missingLinkTargets).toEqual([]);
  });

  it('detects missing link targets via findMissingLinkTargets directly', () => {
    const ids = [{ id: 'REQ-001', prefix: 'REQ', num: '001', line: 1 }];
    const links = [{ from: 'REQ-001', to: 'BEH-999', line: 2 }];
    const result = findMissingLinkTargets(links, ids);
    expect(result).toContain('BEH-999');
  });

  it('detects malformed IDs', () => {
    const content = 'BEH001 and FOO-001 are malformed';
    const result = parseTrace(content);
    expect(result.malformed).toContain('BEH001');
    expect(result.malformed).toContain('FOO-001');
  });

  it('handles content that mixes valid IDs and links correctly', () => {
    const content = [
      'REQ-001: requirement',
      'BEH-001: behavior',
      'PSE-001: pseudocode',
      'TST-001: test',
      'REQ-001 -> BEH-001',
      'BEH-001 -> PSE-001',
      'PSE-001 -> TST-001',
    ].join('\n');
    const result = parseTrace(content);
    // 4 declaration lines (1 ID each) + 3 link lines (2 IDs each) = 10 total ID occurrences
    expect(result.ids).toHaveLength(10);
    expect(result.links).toHaveLength(3);
    expect(result.orphanIds).toEqual([]);
    expect(result.missingLinkTargets).toEqual([]);
    expect(result.duplicateIds.sort()).toEqual(['BEH-001', 'PSE-001', 'REQ-001', 'TST-001']);
  });
});
