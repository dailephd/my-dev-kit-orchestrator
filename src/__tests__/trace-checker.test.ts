import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseDeclaredTraceIds,
  checkArtifactTrace,
  checkDesignMapTrace,
  readTraceCheckResults,
  writeTraceCheckResults,
  TraceCheckResultsFile,
} from '../traceChecker';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-trace-checker-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeFile(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

// ─── parseDeclaredTraceIds ────────────────────────────────────────────────────

describe('parseDeclaredTraceIds', () => {
  it('returns empty array for content with no trace IDs', () => {
    expect(parseDeclaredTraceIds('')).toEqual([]);
    expect(parseDeclaredTraceIds('no ids here')).toEqual([]);
  });

  it('finds IDs on non-link lines', () => {
    const content = 'BEH-001: externally visible behavior\nINV-001: always true';
    const result = parseDeclaredTraceIds(content);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('BEH-001');
    expect(result[1].id).toBe('INV-001');
  });

  it('skips IDs on link lines (lines containing ->)', () => {
    const content = 'BEH-001: behavior\nREQ-001 -> BEH-001';
    const result = parseDeclaredTraceIds(content);
    // BEH-001 from line 1 is found; line 2 (link line) is skipped
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('BEH-001');
  });

  it('does not count link targets as declared IDs', () => {
    // The key fix: BEH-999 only appears as a link target, never declared
    const content = 'REQ-001: first requirement\nREQ-001 -> BEH-999';
    const result = parseDeclaredTraceIds(content);
    expect(result.map((r) => r.id)).toContain('REQ-001');
    expect(result.map((r) => r.id)).not.toContain('BEH-999');
  });

  it('finds IDs embedded in prose on non-link lines', () => {
    const content = 'This implements BEH-042 as specified by REQ-001.';
    const result = parseDeclaredTraceIds(content);
    expect(result).toHaveLength(2);
  });

  it('records correct line numbers', () => {
    const content = 'line one\nBEH-001: behavior\nline three\nREQ-002: requirement';
    const result = parseDeclaredTraceIds(content);
    expect(result.find((r) => r.id === 'BEH-001')?.line).toBe(2);
    expect(result.find((r) => r.id === 'REQ-002')?.line).toBe(4);
  });
});

// ─── checkArtifactTrace - missing file ───────────────────────────────────────

describe('checkArtifactTrace - missing file', () => {
  it('returns passed:true with no issues for missing files (MISSING_FILE handled by artifactChecker)', () => {
    const tmp = makeTempDir();
    try {
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(result.passed).toBe(true);
      expect(result.issues).toHaveLength(0);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── checkArtifactTrace - well-formed artifact ───────────────────────────────

describe('checkArtifactTrace - well-formed artifact', () => {
  it('passes for artifact with no trace IDs', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/behavior-model.txt', 'Status: complete\nNo trace IDs here.\n');
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(result.passed).toBe(true);
      expect(result.issues).toHaveLength(0);
    } finally {
      cleanup(tmp);
    }
  });

  it('passes for artifact with declared IDs linked correctly', () => {
    const tmp = makeTempDir();
    try {
      const content = [
        'BEH-001: externally visible behavior',
        'REQ-001: requirement one',
        'REQ-001 -> BEH-001',
      ].join('\n');
      writeFile(tmp, 'artifacts/behavior-model.txt', content);
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(result.passed).toBe(true);
      expect(result.issues.filter((i) => i.severity === 'fail')).toHaveLength(0);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── checkArtifactTrace - malformed IDs ──────────────────────────────────────

describe('checkArtifactTrace - malformed IDs', () => {
  it('fails for artifact containing malformed trace ID token', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/behavior-model.txt', 'See BEH001 for details.\n');
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.code === 'TRACE_MALFORMED_ID')).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });

  it('reports unknown prefix as malformed', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/behavior-model.txt', 'See FOO-001 for details.\n');
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.code === 'TRACE_MALFORMED_ID')).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });

  it('does not flag valid trace IDs as malformed', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/behavior-model.txt', 'BEH-001: valid behavior\n');
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(result.issues.some((i) => i.code === 'TRACE_MALFORMED_ID')).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── checkArtifactTrace - duplicate IDs ──────────────────────────────────────

describe('checkArtifactTrace - duplicate declared IDs', () => {
  it('warns for duplicate declared IDs', () => {
    const tmp = makeTempDir();
    try {
      const content = 'BEH-001: first declaration\nBEH-001: duplicate declaration\n';
      writeFile(tmp, 'artifacts/behavior-model.txt', content);
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(result.issues.some((i) => i.code === 'TRACE_DUPLICATE_ID')).toBe(true);
      expect(result.issues.find((i) => i.code === 'TRACE_DUPLICATE_ID')?.severity).toBe('warn');
    } finally {
      cleanup(tmp);
    }
  });

  it('does not warn for unique declared IDs', () => {
    const tmp = makeTempDir();
    try {
      const content = 'BEH-001: first\nBEH-002: second\n';
      writeFile(tmp, 'artifacts/behavior-model.txt', content);
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(result.issues.some((i) => i.code === 'TRACE_DUPLICATE_ID')).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── checkArtifactTrace - orphan IDs ─────────────────────────────────────────

describe('checkArtifactTrace - orphan declared IDs', () => {
  it('warns for declared ID not referenced in any link', () => {
    const tmp = makeTempDir();
    try {
      const content = [
        'BEH-001: behavior one',
        'BEH-002: behavior two (orphan)',
        'REQ-001 -> BEH-001',
      ].join('\n');
      writeFile(tmp, 'artifacts/behavior-model.txt', content);
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      const orphan = result.issues.find((i) => i.code === 'TRACE_ORPHAN_ID');
      expect(orphan).toBeDefined();
      expect(orphan?.context).toBe('BEH-002');
      expect(orphan?.severity).toBe('warn');
    } finally {
      cleanup(tmp);
    }
  });

  it('does not warn when all declared IDs appear in links', () => {
    const tmp = makeTempDir();
    try {
      const content = [
        'REQ-001: requirement',
        'BEH-001: behavior',
        'REQ-001 -> BEH-001',
      ].join('\n');
      writeFile(tmp, 'artifacts/behavior-model.txt', content);
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(result.issues.some((i) => i.code === 'TRACE_ORPHAN_ID')).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });

  it('does not report orphans when there are no links', () => {
    const tmp = makeTempDir();
    try {
      const content = 'BEH-001: behavior with no links\n';
      writeFile(tmp, 'artifacts/behavior-model.txt', content);
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(result.issues.some((i) => i.code === 'TRACE_ORPHAN_ID')).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── checkArtifactTrace - missing link targets (Prompt 1 risk) ───────────────

describe('checkArtifactTrace - missing link targets', () => {
  it('fails when a link target is a valid trace ID not declared in this artifact', () => {
    const tmp = makeTempDir();
    try {
      // BEH-999 appears only as link target, never as a declared ID
      const content = 'REQ-001: requirement one\nREQ-001 -> BEH-999';
      writeFile(tmp, 'artifacts/behavior-model.txt', content);
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(result.passed).toBe(false);
      const missing = result.issues.find((i) => i.code === 'TRACE_MISSING_LINK_TARGET');
      expect(missing).toBeDefined();
      expect(missing?.context).toBe('BEH-999');
      expect(missing?.severity).toBe('fail');
    } finally {
      cleanup(tmp);
    }
  });

  it('does not flag missing link targets for non-trace-ID link targets', () => {
    const tmp = makeTempDir();
    try {
      // Link target is not a valid trace ID - should not be flagged
      const content = 'REQ-001: requirement\nREQ-001 -> some-section';
      writeFile(tmp, 'artifacts/behavior-model.txt', content);
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(result.issues.some((i) => i.code === 'TRACE_MISSING_LINK_TARGET')).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });

  it('does not flag declared IDs used as link targets', () => {
    const tmp = makeTempDir();
    try {
      const content = [
        'REQ-001: requirement',
        'BEH-001: behavior',
        'REQ-001 -> BEH-001',
      ].join('\n');
      writeFile(tmp, 'artifacts/behavior-model.txt', content);
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(result.issues.some((i) => i.code === 'TRACE_MISSING_LINK_TARGET')).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── checkDesignMapTrace ──────────────────────────────────────────────────────

describe('checkDesignMapTrace', () => {
  it('returns passed:true with no issues when design-map does not exist', () => {
    const tmp = makeTempDir();
    try {
      const result = checkDesignMapTrace(tmp);
      expect(result.passed).toBe(true);
      expect(result.issues).toHaveLength(0);
    } finally {
      cleanup(tmp);
    }
  });

  it('fails for design-map with missing link target', () => {
    const tmp = makeTempDir();
    try {
      const content = 'REQ-001: requirement\nREQ-001 -> BEH-999';
      writeFile(tmp, 'artifacts/design-map.txt', content);
      const result = checkDesignMapTrace(tmp);
      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.code === 'TRACE_MISSING_LINK_TARGET')).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });

  it('passes for well-formed design-map trace section', () => {
    const tmp = makeTempDir();
    try {
      const content = [
        'REQ-001: trace requirement',
        'BEH-001: trace behavior',
        'REQ-001 -> BEH-001',
      ].join('\n');
      writeFile(tmp, 'artifacts/design-map.txt', content);
      const result = checkDesignMapTrace(tmp);
      expect(result.passed).toBe(true);
      expect(result.issues.filter((i) => i.severity === 'fail')).toHaveLength(0);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Persistence ─────────────────────────────────────────────────────────────

describe('trace check results persistence', () => {
  it('readTraceCheckResults returns null when file does not exist', () => {
    const tmp = makeTempDir();
    try {
      expect(readTraceCheckResults(tmp)).toBeNull();
    } finally {
      cleanup(tmp);
    }
  });

  it('writeTraceCheckResults creates the file, readTraceCheckResults reads it back', () => {
    const tmp = makeTempDir();
    try {
      const data: TraceCheckResultsFile = {
        version: '1',
        checkedAt: new Date().toISOString(),
        traceResults: [
          {
            artifactFile: 'artifacts/behavior-model.txt',
            issues: [],
            passed: true,
            checkedAt: new Date().toISOString(),
          },
        ],
      };
      writeTraceCheckResults(tmp, data);
      const read = readTraceCheckResults(tmp);
      expect(read).not.toBeNull();
      expect(read?.version).toBe('1');
      expect(read?.traceResults).toHaveLength(1);
      expect(read?.traceResults[0].passed).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });

  it('writeTraceCheckResults is atomic (uses .tmp rename)', () => {
    const tmp = makeTempDir();
    try {
      const data: TraceCheckResultsFile = {
        version: '1',
        checkedAt: new Date().toISOString(),
        traceResults: [],
      };
      writeTraceCheckResults(tmp, data);
      // .tmp file should not remain after successful write
      expect(fs.existsSync(path.join(tmp, 'trace-check-results.json.tmp'))).toBe(false);
      expect(fs.existsSync(path.join(tmp, 'trace-check-results.json'))).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });
});

