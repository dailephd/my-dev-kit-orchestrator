import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseDeclaredTraceIds,
  suggestCorrectionStageFromTraceIssue,
  checkArtifactTrace,
  checkAllTraces,
  checkDesignMapTrace,
  readTraceCheckResults,
  writeTraceCheckResults,
  TraceCheckResultsFile,
} from '../traceChecker';
import { RunMetadata } from '../run';
import { getWorkflow, StageDefinition } from '../workflows';
import { VALID_MODES } from '../types';

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

  it('does not treat IDs embedded in ordinary prose as declarations', () => {
    const content = 'This implements BEH-042 as specified by REQ-001.';
    const result = parseDeclaredTraceIds(content);
    expect(result).toEqual([]);
  });

  it('does not create duplicate or orphan issues from several prose references', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/behavior-model.txt', [
        'REQ-001: requirement',
        'BEH-001: behavior',
        'The implementation discusses REQ-001 and BEH-001 several times: REQ-001, BEH-001.',
        'REQ-001 -> BEH-001',
      ].join('\n'));
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(result.issues.some((issue) => issue.code === 'TRACE_DUPLICATE_ID')).toBe(false);
      expect(result.issues.some((issue) => issue.code === 'TRACE_ORPHAN_ID')).toBe(false);
    } finally {
      cleanup(tmp);
    }
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

  // v1.6.2: previously 'See FOO-001 for details.' in prose failed as malformed.
  it('does not report an unknown prefix in ordinary prose as malformed', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/behavior-model.txt', 'See FOO-001 for details.\n');
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(result.passed).toBe(true);
      expect(result.issues.some((i) => i.code === 'TRACE_MALFORMED_ID')).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });

  it('reports an unknown prefix in an explicit declaration as malformed', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/behavior-model.txt', 'FOO-001: new behavior\n');
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(result.passed).toBe(false);
      const issue = result.issues.find((i) => i.code === 'TRACE_MALFORMED_ID');
      expect(issue).toMatchObject({ severity: 'fail', context: 'FOO-001' });
    } finally {
      cleanup(tmp);
    }
  });

  it('reports an unknown prefix as an explicit link target as malformed', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/behavior-model.txt', 'REQ-001: requirement\nREQ-001 -> FOO-001\n');
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(result.issues.filter((i) => i.code === 'TRACE_MALFORMED_ID').map((i) => i.context)).toEqual(['FOO-001']);
    } finally {
      cleanup(tmp);
    }
  });

  it('does not report ECO-00, ECO-01 or UTF-8 technical identifiers', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/behavior-model.txt', [
        'The ECO-00 contract and ECO-01 certification are external.',
        'Output is encoded as UTF-8.',
        '"UTF-8"',
        'UTF-8:',
        '(ECO-00)',
      ].join('\n'));
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(result.issues.some((i) => i.code === 'TRACE_MALFORMED_ID')).toBe(false);
      expect(result.passed).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });

  it('reports recognized-prefix near misses but not technical identifiers in mixed content', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/behavior-model.txt', [
        'ECO-00 and UTF-8 are plain technical text.',
        'REQ-001: valid requirement',
        'RSP-01: malformed responsibility',
        'RSP-01 again, and REQ001.',
      ].join('\n'));
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(result.issues.filter((i) => i.code === 'TRACE_MALFORMED_ID').map((i) => i.context)).toEqual(['RSP-01', 'REQ001']);
    } finally {
      cleanup(tmp);
    }
  });

  it('keeps duplicate and missing-target diagnostics unchanged alongside technical identifiers', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/behavior-model.txt', [
        'Uses UTF-8 and ECO-00.',
        'REQ-001: first',
        'REQ-001: second',
        'REQ-001 -> BEH-999',
      ].join('\n'));
      const result = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      const codes = result.issues.map((i) => i.code);
      expect(codes).toContain('TRACE_DUPLICATE_ID');
      expect(codes).toContain('TRACE_MISSING_LINK_TARGET');
      expect(codes).not.toContain('TRACE_MALFORMED_ID');
    } finally {
      cleanup(tmp);
    }
  });

  it('does not modify the checked artifact', () => {
    const tmp = makeTempDir();
    try {
      const content = 'REQ-01\nFOO-001: x\nECO-00 UTF-8\n';
      writeFile(tmp, 'artifacts/behavior-model.txt', content);
      checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(fs.readFileSync(path.join(tmp, 'artifacts/behavior-model.txt'), 'utf8')).toBe(content);
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


describe('RSP trace family (v1.5 Batch 0)', () => {
  it('recognizes RSP-NNN declarations consistently', () => {
    const result = parseDeclaredTraceIds('RSP-001: reject malformed configuration\n- RSP-0002: another');
    expect(result.map((r) => r.id)).toEqual(['RSP-001', 'RSP-0002']);
  });

  it('does not treat malformed RSP-like labels as declarations', () => {
    expect(parseDeclaredTraceIds('RSP-01: bad\nRSP001: bad')).toEqual([]);
  });

  it('routes RSP link-target problems to the generic test-strategy owner', () => {
    expect(
      suggestCorrectionStageFromTraceIssue({
        code: 'TRACE_MISSING_LINK_TARGET',
        severity: 'error',
        message: 'x',
        context: 'RSP-001',
      } as never),
    ).toBe('test-strategy');
  });
});

// ─── checkAllTraces - run-aware cross-artifact resolution (v1.6.2) ───────────

function stageDef(name: string, artifactFile: string, additional?: string[]): StageDefinition {
  return {
    name,
    artifactFile,
    promptFile: `prompts/${name}.prompt.txt`,
    ...(additional ? { additionalArtifactFiles: additional } : {}),
  };
}

function makeRunMeta(dir: string, stages: StageDefinition[]): RunMetadata {
  return {
    runId: 'trace-run-aware',
    mode: 'feature',
    request: 'run-aware trace',
    projectRoot: dir,
    runFolder: dir,
    createdAt: '2026-01-01T00:00:00.000Z',
    currentStage: stages[0].name,
    stages,
    status: 'in_progress',
  };
}

const THREE_STAGES = [
  stageDef('request-brief', 'artifacts/request-brief.txt'),
  stageDef('behavior-model', 'artifacts/behavior-model.txt'),
  stageDef('implementation', 'artifacts/implementation-report.txt'),
];

function resultFor(results: ReturnType<typeof checkAllTraces>, file: string) {
  const r = results.find((x) => x.artifactFile === file);
  if (!r) throw new Error(`no result for ${file}`);
  return r;
}

function missingTargets(result: { issues: { code: string; context?: string }[] }): string[] {
  return result.issues.filter((i) => i.code === 'TRACE_MISSING_LINK_TARGET').map((i) => i.context ?? '');
}

describe('checkAllTraces - run-aware declaration scope', () => {
  it('resolves a target declared in an earlier native artifact (T162-19)', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/request-brief.txt', 'REQ-001: original requirement\n');
      writeFile(tmp, 'artifacts/behavior-model.txt', 'BEH-001: behavior\nBEH-001 -> REQ-001\n');
      const results = checkAllTraces(makeRunMeta(tmp, THREE_STAGES));
      expect(missingTargets(resultFor(results, 'artifacts/behavior-model.txt'))).toEqual([]);

      // Standalone checking keeps the file-local contract (T162-29).
      const local = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      expect(missingTargets(local)).toEqual(['REQ-001']);
      expect(local.passed).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });

  it('still fails for a target no applicable artifact declares (T162-20)', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/request-brief.txt', 'REQ-001: requirement\n');
      writeFile(tmp, 'artifacts/behavior-model.txt', 'BEH-001: behavior\nBEH-001 -> BEH-999\n');
      const bm = resultFor(checkAllTraces(makeRunMeta(tmp, THREE_STAGES)), 'artifacts/behavior-model.txt');
      expect(missingTargets(bm)).toEqual(['BEH-999']);
      expect(bm.passed).toBe(false);
      expect(bm.issues.find((i) => i.code === 'TRACE_MISSING_LINK_TARGET')?.severity).toBe('fail');
    } finally {
      cleanup(tmp);
    }
  });

  it('does not treat a prose mention upstream as a declaration (T162-21)', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/request-brief.txt', 'The request relates to REQ-001 and see REQ-001 again.\n');
      writeFile(tmp, 'artifacts/behavior-model.txt', 'BEH-001: behavior\nBEH-001 -> REQ-001\n');
      const bm = resultFor(checkAllTraces(makeRunMeta(tmp, THREE_STAGES)), 'artifacts/behavior-model.txt');
      expect(missingTargets(bm)).toEqual(['REQ-001']);
    } finally {
      cleanup(tmp);
    }
  });

  it('does not treat an upstream link endpoint as a declaration (T162-22)', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/request-brief.txt', 'REQ-001: requirement\nREQ-001 -> BEH-001\n');
      writeFile(tmp, 'artifacts/behavior-model.txt', 'BEH-002: behavior\nBEH-002 -> BEH-001\n');
      const results = checkAllTraces(makeRunMeta(tmp, THREE_STAGES));
      // The upstream link is itself missing its target, and that target does
      // not become known downstream.
      expect(missingTargets(resultFor(results, 'artifacts/request-brief.txt'))).toEqual(['BEH-001']);
      expect(missingTargets(resultFor(results, 'artifacts/behavior-model.txt'))).toEqual(['BEH-001']);
    } finally {
      cleanup(tmp);
    }
  });

  it('does not let a later-stage declaration satisfy an earlier reference (T162-23)', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/request-brief.txt', 'REQ-001: requirement\nREQ-001 -> IMP-001\n');
      writeFile(tmp, 'artifacts/implementation-report.txt', 'IMP-001: implementation\nIMP-001 -> REQ-001\n');
      const results = checkAllTraces(makeRunMeta(tmp, THREE_STAGES));
      expect(missingTargets(resultFor(results, 'artifacts/request-brief.txt'))).toEqual(['IMP-001']);
      // The reverse direction (upstream target) resolves.
      expect(missingTargets(resultFor(results, 'artifacts/implementation-report.txt'))).toEqual([]);
    } finally {
      cleanup(tmp);
    }
  });

  it('resolves a same-artifact declaration without any upstream artifact (T162-24)', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/behavior-model.txt', 'BEH-001: a\nBEH-002: b\nBEH-001 -> BEH-002\n');
      const bm = resultFor(checkAllTraces(makeRunMeta(tmp, THREE_STAGES)), 'artifacts/behavior-model.txt');
      expect(missingTargets(bm)).toEqual([]);
    } finally {
      cleanup(tmp);
    }
  });

  it('shares declarations across declared additional artifacts only (T162-25)', () => {
    const tmp = makeTempDir();
    try {
      const stages = [
        stageDef('request-brief', 'artifacts/request-brief.txt'),
        stageDef('porting-map', 'artifacts/porting-map.txt', ['artifacts/do-not-port.txt']),
      ];
      writeFile(tmp, 'artifacts/porting-map.txt', 'RSP-001: owner\nRSP-001 -> RSP-002\nRSP-001 -> RSP-003\n');
      writeFile(tmp, 'artifacts/do-not-port.txt', 'RSP-002: companion declaration\nRSP-002 -> RSP-001\n');
      // Unregistered file in artifacts/ must not contribute declarations.
      writeFile(tmp, 'artifacts/unrelated-notes.txt', 'RSP-003: not part of any native stage\n');
      const results = checkAllTraces(makeRunMeta(tmp, stages));
      expect(missingTargets(resultFor(results, 'artifacts/porting-map.txt'))).toEqual(['RSP-003']);
      expect(missingTargets(resultFor(results, 'artifacts/do-not-port.txt'))).toEqual([]);
    } finally {
      cleanup(tmp);
    }
  });

  it('fabricates nothing for a missing upstream artifact (T162-26)', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/behavior-model.txt', 'BEH-001: behavior\nBEH-001 -> REQ-001\n');
      const results = checkAllTraces(makeRunMeta(tmp, THREE_STAGES));
      const rb = resultFor(results, 'artifacts/request-brief.txt');
      expect(rb.issues).toEqual([]);
      expect(rb.passed).toBe(true);
      expect(missingTargets(resultFor(results, 'artifacts/behavior-model.txt'))).toEqual(['REQ-001']);
    } finally {
      cleanup(tmp);
    }
  });

  it('follows RunMetadata stage order, not filename or enumeration order (T162-27)', () => {
    const tmp = makeTempDir();
    try {
      // Lexically, a-late.txt sorts before z-early.txt; stage order is reverse.
      const stages = [
        stageDef('first', 'artifacts/z-early.txt'),
        stageDef('second', 'artifacts/a-late.txt'),
      ];
      writeFile(tmp, 'artifacts/z-early.txt', 'REQ-001: early\nREQ-001 -> BEH-001\n');
      writeFile(tmp, 'artifacts/a-late.txt', 'BEH-001: late\nBEH-001 -> REQ-001\n');
      const results = checkAllTraces(makeRunMeta(tmp, stages));
      expect(missingTargets(resultFor(results, 'artifacts/z-early.txt'))).toEqual(['BEH-001']);
      expect(missingTargets(resultFor(results, 'artifacts/a-late.txt'))).toEqual([]);
      expect(results.map((r) => r.artifactFile)).toEqual(['artifacts/z-early.txt', 'artifacts/a-late.txt']);
    } finally {
      cleanup(tmp);
    }
  });

  it('is deterministic on unchanged input (T162-28)', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/request-brief.txt', 'REQ-001: requirement\nREQ-001: again\n');
      writeFile(
        tmp,
        'artifacts/behavior-model.txt',
        'BEH-001: behavior\nBEH-002: orphan\nBEH-001 -> REQ-001\nBEH-001 -> BEH-999\nBEH-001 -> REQ-777\n',
      );
      const strip = (rs: ReturnType<typeof checkAllTraces>) =>
        rs.map(({ checkedAt: _c, ...rest }) => rest);
      const first = strip(checkAllTraces(makeRunMeta(tmp, THREE_STAGES)));
      const second = strip(checkAllTraces(makeRunMeta(tmp, THREE_STAGES)));
      expect(second).toEqual(first);
    } finally {
      cleanup(tmp);
    }
  });

  it('keeps duplicate and orphan diagnostics file-local warnings (T162-31)', () => {
    const tmp = makeTempDir();
    try {
      // REQ-001 is declared in both artifacts: no cross-artifact duplicate.
      writeFile(
        tmp,
        'artifacts/request-brief.txt',
        'REQ-001: requirement\nREQ-002: dup\nREQ-002: dup again\nREQ-001 -> REQ-002\n',
      );
      writeFile(
        tmp,
        'artifacts/behavior-model.txt',
        'REQ-001: restated\nBEH-001: behavior\nBEH-002: lonely\nBEH-001 -> REQ-001\n',
      );
      const results = checkAllTraces(makeRunMeta(tmp, THREE_STAGES));
      const rb = resultFor(results, 'artifacts/request-brief.txt');
      expect(rb.issues.filter((i) => i.code === 'TRACE_DUPLICATE_ID').map((i) => i.context)).toEqual(['REQ-002']);
      expect(rb.passed).toBe(true);
      const bm = resultFor(results, 'artifacts/behavior-model.txt');
      expect(bm.issues.some((i) => i.code === 'TRACE_DUPLICATE_ID')).toBe(false);
      const orphans = bm.issues.filter((i) => i.code === 'TRACE_ORPHAN_ID');
      expect(orphans.map((i) => i.context)).toEqual(['BEH-002']);
      expect(orphans[0].severity).toBe('warn');
      expect(bm.passed).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });

  it('preserves Prompt 1 malformed-ID behavior in run-aware mode (T162-32)', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/request-brief.txt', 'REQ-001: requirement\n');
      const content = [
        'BEH-001: behavior',
        'Evidence: see ECO-00 and ECO-01 contracts, UTF-8 encoded.',
        'Near miss: REQ-01 should be flagged.',
        'BEH-001 -> REQ-001',
      ].join('\n');
      writeFile(tmp, 'artifacts/behavior-model.txt', content);
      const runAware = resultFor(checkAllTraces(makeRunMeta(tmp, THREE_STAGES)), 'artifacts/behavior-model.txt');
      const fileLocal = checkArtifactTrace(tmp, 'artifacts/behavior-model.txt');
      const malformed = (r: { issues: { code: string; context?: string }[] }) =>
        r.issues.filter((i) => i.code === 'TRACE_MALFORMED_ID').map((i) => i.context);
      expect(malformed(runAware)).toEqual(malformed(fileLocal));
      expect(malformed(runAware)).toContain('REQ-01');
      expect(malformed(runAware)).not.toContain('ECO-00');
      expect(malformed(runAware)).not.toContain('UTF-8');
      expect(runAware.passed).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });

  it('writes nothing and mutates no run state while checking (T162-33)', () => {
    const tmp = makeTempDir();
    try {
      writeFile(tmp, 'artifacts/request-brief.txt', 'REQ-001: requirement\n');
      writeFile(tmp, 'artifacts/behavior-model.txt', 'BEH-001: b\nBEH-001 -> REQ-001\n');
      const snapshot = (): string[] => {
        const out: string[] = [];
        const walk = (d: string): void => {
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) walk(full);
            else out.push(`${path.relative(tmp, full)}:${fs.readFileSync(full, 'utf8')}`);
          }
        };
        walk(tmp);
        return out.sort();
      };
      const before = snapshot();
      const meta = makeRunMeta(tmp, THREE_STAGES);
      const metaBefore = JSON.stringify(meta);
      checkAllTraces(meta);
      expect(snapshot()).toEqual(before);
      expect(JSON.stringify(meta)).toBe(metaBefore);
    } finally {
      cleanup(tmp);
    }
  });

  it('respects each native mode stage registry without assuming feature names (T162-34)', () => {
    for (const mode of VALID_MODES) {
      const stages = getWorkflow(mode).stages;
      expect(stages.length).toBeGreaterThan(1);
      const firstFile = stages[0].artifactFile;
      const lastFile = stages[stages.length - 1].artifactFile;
      if (firstFile === lastFile) continue;
      const tmp = makeTempDir();
      try {
        writeFile(tmp, firstFile, 'REQ-001: first-stage declaration\nREQ-001 -> RSP-998\n');
        writeFile(tmp, lastFile, 'RSP-998: last-stage declaration\nRSP-998 -> REQ-001\n');
        const results = checkAllTraces({ ...makeRunMeta(tmp, stages), mode });
        expect(missingTargets(resultFor(results, firstFile))).toEqual(['RSP-998']);
        expect(missingTargets(resultFor(results, lastFile))).toEqual([]);
      } finally {
        cleanup(tmp);
      }
    }
  });
});
