import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getArtifactStatePath,
  readArtifactStateFile,
  writeArtifactStateFile,
  setArtifactManualState,
  resolveArtifactState,
  getUpstreamArtifacts,
  isArtifactStale,
  isManualState,
  isForbiddenManualState,
  ArtifactStateFile,
} from '../artifactLifecycle';
import { getWorkflow } from '../workflows';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-lc-'));
}
function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}
function makeRunFolder(tmp: string): string {
  const rf = path.join(tmp, 'run-test');
  fs.mkdirSync(path.join(rf, 'artifacts'), { recursive: true });
  return rf;
}
function writeArtifact(runFolder: string, artifactFile: string, content = 'done') {
  const full = path.join(runFolder, artifactFile);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

const FEATURE_STAGES = getWorkflow('feature').stages;
const EXTRACTION_STAGES = getWorkflow('extraction').stages;

// ─── State file path ──────────────────────────────────────────────────────────

describe('getArtifactStatePath', () => {
  it('returns artifact-state.json inside run folder', () => {
    const p = getArtifactStatePath('/some/run');
    expect(p).toBe(path.join('/some/run', 'artifact-state.json'));
  });
});

// ─── Read/write ───────────────────────────────────────────────────────────────

describe('readArtifactStateFile', () => {
  it('returns empty default when file does not exist', () => {
    const tmp = makeTempDir();
    try {
      const result = readArtifactStateFile(tmp);
      expect(result).toEqual({ version: '1', artifacts: {} });
    } finally {
      cleanup(tmp);
    }
  });

  it('reads a valid state file', () => {
    const tmp = makeTempDir();
    try {
      const stateFile: ArtifactStateFile = {
        version: '1',
        artifacts: {
          'artifacts/request-brief.txt': {
            state: 'complete',
            updatedAt: '2026-01-01T00:00:00.000Z',
            source: 'manual',
          },
        },
      };
      writeArtifactStateFile(tmp, stateFile);
      const result = readArtifactStateFile(tmp);
      expect(result.version).toBe('1');
      expect(result.artifacts['artifacts/request-brief.txt']?.state).toBe('complete');
    } finally {
      cleanup(tmp);
    }
  });

  it('returns safe default for malformed JSON', () => {
    const tmp = makeTempDir();
    try {
      fs.writeFileSync(path.join(tmp, 'artifact-state.json'), '{ bad json !!!', 'utf8');
      const result = readArtifactStateFile(tmp);
      expect(result).toEqual({ version: '1', artifacts: {} });
    } finally {
      cleanup(tmp);
    }
  });

  it('returns safe default for structurally invalid JSON', () => {
    const tmp = makeTempDir();
    try {
      fs.writeFileSync(path.join(tmp, 'artifact-state.json'), '"just a string"', 'utf8');
      const result = readArtifactStateFile(tmp);
      expect(result).toEqual({ version: '1', artifacts: {} });
    } finally {
      cleanup(tmp);
    }
  });

  it('returns safe default when artifacts key is missing', () => {
    const tmp = makeTempDir();
    try {
      fs.writeFileSync(path.join(tmp, 'artifact-state.json'), '{"version":"1"}', 'utf8');
      const result = readArtifactStateFile(tmp);
      expect(result).toEqual({ version: '1', artifacts: {} });
    } finally {
      cleanup(tmp);
    }
  });
});

describe('writeArtifactStateFile', () => {
  it('writes and reads back correctly', () => {
    const tmp = makeTempDir();
    try {
      const stateFile: ArtifactStateFile = {
        version: '1',
        artifacts: {
          'artifacts/behavior-model.txt': {
            state: 'incomplete',
            updatedAt: '2026-06-01T12:00:00.000Z',
            reason: 'Not finished',
            source: 'manual',
          },
        },
      };
      writeArtifactStateFile(tmp, stateFile);
      expect(fs.existsSync(getArtifactStatePath(tmp))).toBe(true);
      const result = readArtifactStateFile(tmp);
      expect(result.artifacts['artifacts/behavior-model.txt']?.state).toBe('incomplete');
      expect(result.artifacts['artifacts/behavior-model.txt']?.reason).toBe('Not finished');
    } finally {
      cleanup(tmp);
    }
  });

  it('does not leave a .tmp file on success', () => {
    const tmp = makeTempDir();
    try {
      writeArtifactStateFile(tmp, { version: '1', artifacts: {} });
      expect(fs.existsSync(getArtifactStatePath(tmp) + '.tmp')).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── setArtifactManualState ───────────────────────────────────────────────────

describe('setArtifactManualState', () => {
  it('sets incomplete state with reason', () => {
    const tmp = makeTempDir();
    try {
      setArtifactManualState(tmp, 'artifacts/pseudocode-packet.txt', 'incomplete', {
        reason: 'Needs clarification',
      });
      const sf = readArtifactStateFile(tmp);
      expect(sf.artifacts['artifacts/pseudocode-packet.txt']?.state).toBe('incomplete');
      expect(sf.artifacts['artifacts/pseudocode-packet.txt']?.reason).toBe('Needs clarification');
      expect(sf.artifacts['artifacts/pseudocode-packet.txt']?.source).toBe('manual');
    } finally {
      cleanup(tmp);
    }
  });

  it('sets blocked state with reason', () => {
    const tmp = makeTempDir();
    try {
      setArtifactManualState(tmp, 'artifacts/target-architecture-proposal.txt', 'blocked', {
        reason: 'Target repo missing',
      });
      const sf = readArtifactStateFile(tmp);
      expect(sf.artifacts['artifacts/target-architecture-proposal.txt']?.state).toBe('blocked');
    } finally {
      cleanup(tmp);
    }
  });

  it('sets complete state without reason', () => {
    const tmp = makeTempDir();
    try {
      setArtifactManualState(tmp, 'artifacts/request-brief.txt', 'complete');
      const sf = readArtifactStateFile(tmp);
      expect(sf.artifacts['artifacts/request-brief.txt']?.state).toBe('complete');
      expect(sf.artifacts['artifacts/request-brief.txt']?.reason).toBeUndefined();
    } finally {
      cleanup(tmp);
    }
  });

  it('uses provided now timestamp', () => {
    const tmp = makeTempDir();
    try {
      const now = '2026-06-15T10:00:00.000Z';
      setArtifactManualState(tmp, 'artifacts/request-brief.txt', 'complete', { now });
      const sf = readArtifactStateFile(tmp);
      expect(sf.artifacts['artifacts/request-brief.txt']?.updatedAt).toBe(now);
    } finally {
      cleanup(tmp);
    }
  });

  it('merges multiple artifact states', () => {
    const tmp = makeTempDir();
    try {
      setArtifactManualState(tmp, 'artifacts/request-brief.txt', 'complete');
      setArtifactManualState(tmp, 'artifacts/behavior-model.txt', 'blocked', {
        reason: 'Waiting for design',
      });
      const sf = readArtifactStateFile(tmp);
      expect(sf.artifacts['artifacts/request-brief.txt']?.state).toBe('complete');
      expect(sf.artifacts['artifacts/behavior-model.txt']?.state).toBe('blocked');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── resolveArtifactState - backward compatibility ────────────────────────────

describe('resolveArtifactState - backward compatibility (no state file)', () => {
  it('file exists -> complete when no state file', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writeArtifact(rf, 'artifacts/request-brief.txt');
      const sf = readArtifactStateFile(rf);
      const state = resolveArtifactState(rf, 'artifacts/request-brief.txt', FEATURE_STAGES, sf);
      expect(state).toBe('complete');
    } finally {
      cleanup(tmp);
    }
  });

  it('file missing -> missing when no state file', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      const sf = readArtifactStateFile(rf);
      const state = resolveArtifactState(rf, 'artifacts/request-brief.txt', FEATURE_STAGES, sf);
      expect(state).toBe('missing');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── resolveArtifactState - manual states ────────────────────────────────────

describe('resolveArtifactState - manual states', () => {
  it('manual incomplete with file present -> incomplete', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writeArtifact(rf, 'artifacts/behavior-model.txt');
      setArtifactManualState(rf, 'artifacts/behavior-model.txt', 'incomplete', {
        reason: 'Not done',
      });
      const sf = readArtifactStateFile(rf);
      const state = resolveArtifactState(rf, 'artifacts/behavior-model.txt', FEATURE_STAGES, sf);
      expect(state).toBe('incomplete');
    } finally {
      cleanup(tmp);
    }
  });

  it('manual blocked -> blocked regardless of file existence', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      // No file written - blocked even without file
      setArtifactManualState(rf, 'artifacts/request-brief.txt', 'blocked', {
        reason: 'Blocker',
      });
      const sf = readArtifactStateFile(rf);
      const state = resolveArtifactState(rf, 'artifacts/request-brief.txt', FEATURE_STAGES, sf);
      expect(state).toBe('blocked');
    } finally {
      cleanup(tmp);
    }
  });

  it('manual complete with existing file -> complete (when no stale)', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writeArtifact(rf, 'artifacts/request-brief.txt');
      setArtifactManualState(rf, 'artifacts/request-brief.txt', 'complete', {
        now: '2026-06-01T10:00:00.000Z',
      });
      const sf = readArtifactStateFile(rf);
      const state = resolveArtifactState(rf, 'artifacts/request-brief.txt', FEATURE_STAGES, sf);
      expect(state).toBe('complete');
    } finally {
      cleanup(tmp);
    }
  });

  it('manual complete does not hide missing artifact file', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      // Mark complete but do NOT write the file
      setArtifactManualState(rf, 'artifacts/request-brief.txt', 'complete');
      const sf = readArtifactStateFile(rf);
      const state = resolveArtifactState(rf, 'artifacts/request-brief.txt', FEATURE_STAGES, sf);
      // File is missing; complete should not override missing
      expect(state).toBe('missing');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── getUpstreamArtifacts ─────────────────────────────────────────────────────

describe('getUpstreamArtifacts', () => {
  it('returns empty for the first stage', () => {
    const upstream = getUpstreamArtifacts(FEATURE_STAGES, 'artifacts/request-brief.txt');
    expect(upstream).toEqual([]);
  });

  it('returns first stage artifact for second stage', () => {
    const upstream = getUpstreamArtifacts(
      FEATURE_STAGES,
      'artifacts/architecture-context-packet.txt',
    );
    expect(upstream).toContain('artifacts/request-brief.txt');
    expect(upstream).toHaveLength(1);
  });

  it('returns all prior stages for a middle stage', () => {
    const upstream = getUpstreamArtifacts(FEATURE_STAGES, 'artifacts/behavior-model.txt');
    expect(upstream).toContain('artifacts/request-brief.txt');
    expect(upstream).toContain('artifacts/architecture-context-packet.txt');
    expect(upstream).toHaveLength(2);
  });

  it('returns empty for an artifact not in stages', () => {
    const upstream = getUpstreamArtifacts(FEATURE_STAGES, 'artifacts/unknown.txt');
    expect(upstream).toEqual([]);
  });

  it('extraction: includes both porting-map artifacts as upstream for downstream stages', () => {
    const upstream = getUpstreamArtifacts(
      EXTRACTION_STAGES,
      'artifacts/golden-behavior-contract.txt',
    );
    expect(upstream).toContain('artifacts/source-to-target-porting-map.txt');
    expect(upstream).toContain('artifacts/do-not-port-list.txt');
  });

  it('extraction: do-not-port-list has same upstream as porting-map primary', () => {
    // do-not-port-list.txt is an additionalArtifact of the porting-map stage
    const upstream = getUpstreamArtifacts(
      EXTRACTION_STAGES,
      'artifacts/do-not-port-list.txt',
    );
    // porting-map stage is index 3 in extraction, so upstream = stages 0,1,2
    expect(upstream).toContain('artifacts/request-brief.txt');
    expect(upstream).toContain('artifacts/source-architecture-context-packet.txt');
    expect(upstream).toContain('artifacts/source-workflow-map.txt');
    // should NOT contain porting-map's own artifacts (same stage)
    expect(upstream).not.toContain('artifacts/source-to-target-porting-map.txt');
    expect(upstream).not.toContain('artifacts/do-not-port-list.txt');
  });
});

// ─── Stale detection ─────────────────────────────────────────────────────────

describe('isArtifactStale', () => {
  it('not stale when no upstream exists', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writeArtifact(rf, 'artifacts/request-brief.txt');
      const sf = readArtifactStateFile(rf);
      const stale = isArtifactStale(rf, 'artifacts/request-brief.txt', [], sf);
      expect(stale).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });

  it('stale when upstream has a later updatedAt timestamp', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writeArtifact(rf, 'artifacts/request-brief.txt');
      writeArtifact(rf, 'artifacts/architecture-context-packet.txt');

      // Mark upstream as complete at a later time than downstream
      const upstreamTime = '2026-06-01T12:00:00.000Z';
      const downstreamTime = '2026-06-01T10:00:00.000Z';

      setArtifactManualState(rf, 'artifacts/request-brief.txt', 'complete', {
        now: upstreamTime,
      });
      setArtifactManualState(rf, 'artifacts/architecture-context-packet.txt', 'complete', {
        now: downstreamTime,
      });

      const sf = readArtifactStateFile(rf);
      const stale = isArtifactStale(
        rf,
        'artifacts/architecture-context-packet.txt',
        ['artifacts/request-brief.txt'],
        sf,
      );
      expect(stale).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });

  it('not stale when downstream is newer than upstream', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writeArtifact(rf, 'artifacts/request-brief.txt');
      writeArtifact(rf, 'artifacts/architecture-context-packet.txt');

      setArtifactManualState(rf, 'artifacts/request-brief.txt', 'complete', {
        now: '2026-06-01T09:00:00.000Z',
      });
      setArtifactManualState(rf, 'artifacts/architecture-context-packet.txt', 'complete', {
        now: '2026-06-01T12:00:00.000Z',
      });

      const sf = readArtifactStateFile(rf);
      const stale = isArtifactStale(
        rf,
        'artifacts/architecture-context-packet.txt',
        ['artifacts/request-brief.txt'],
        sf,
      );
      expect(stale).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });

  it('not stale when artifact has no completion time (missing file, no state)', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writeArtifact(rf, 'artifacts/request-brief.txt');
      // No architecture-context artifact written
      const sf = readArtifactStateFile(rf);
      const stale = isArtifactStale(
        rf,
        'artifacts/architecture-context-packet.txt',
        ['artifacts/request-brief.txt'],
        sf,
      );
      expect(stale).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── resolveArtifactState - stale detection ──────────────────────────────────

describe('resolveArtifactState - stale detection', () => {
  it('resolves to stale when upstream was updated after downstream', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writeArtifact(rf, 'artifacts/request-brief.txt');
      writeArtifact(rf, 'artifacts/architecture-context-packet.txt');

      setArtifactManualState(rf, 'artifacts/request-brief.txt', 'complete', {
        now: '2026-06-02T10:00:00.000Z',
      });
      setArtifactManualState(rf, 'artifacts/architecture-context-packet.txt', 'complete', {
        now: '2026-06-01T10:00:00.000Z',
      });

      const sf = readArtifactStateFile(rf);
      const state = resolveArtifactState(
        rf,
        'artifacts/architecture-context-packet.txt',
        FEATURE_STAGES,
        sf,
      );
      expect(state).toBe('stale');
    } finally {
      cleanup(tmp);
    }
  });

  it('resolves to complete when downstream is newer', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writeArtifact(rf, 'artifacts/request-brief.txt');
      writeArtifact(rf, 'artifacts/architecture-context-packet.txt');

      setArtifactManualState(rf, 'artifacts/request-brief.txt', 'complete', {
        now: '2026-06-01T09:00:00.000Z',
      });
      setArtifactManualState(rf, 'artifacts/architecture-context-packet.txt', 'complete', {
        now: '2026-06-01T12:00:00.000Z',
      });

      const sf = readArtifactStateFile(rf);
      const state = resolveArtifactState(
        rf,
        'artifacts/architecture-context-packet.txt',
        FEATURE_STAGES,
        sf,
      );
      expect(state).toBe('complete');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Extraction dual-artifact ─────────────────────────────────────────────────

describe('extraction: porting-map dual-artifact dependency', () => {
  it('golden-behavior-contract is stale when porting-map primary changes', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writeArtifact(rf, 'artifacts/request-brief.txt');
      writeArtifact(rf, 'artifacts/source-architecture-context-packet.txt');
      writeArtifact(rf, 'artifacts/source-workflow-map.txt');
      writeArtifact(rf, 'artifacts/source-to-target-porting-map.txt');
      writeArtifact(rf, 'artifacts/do-not-port-list.txt');
      writeArtifact(rf, 'artifacts/golden-behavior-contract.txt');

      // downstream completed first
      setArtifactManualState(rf, 'artifacts/golden-behavior-contract.txt', 'complete', {
        now: '2026-06-01T09:00:00.000Z',
      });
      // then porting-map updated
      setArtifactManualState(rf, 'artifacts/source-to-target-porting-map.txt', 'complete', {
        now: '2026-06-01T12:00:00.000Z',
      });

      const sf = readArtifactStateFile(rf);
      const state = resolveArtifactState(
        rf,
        'artifacts/golden-behavior-contract.txt',
        EXTRACTION_STAGES,
        sf,
      );
      expect(state).toBe('stale');
    } finally {
      cleanup(tmp);
    }
  });

  it('golden-behavior-contract is stale when do-not-port-list changes', () => {
    const tmp = makeTempDir();
    try {
      const rf = makeRunFolder(tmp);
      writeArtifact(rf, 'artifacts/request-brief.txt');
      writeArtifact(rf, 'artifacts/source-architecture-context-packet.txt');
      writeArtifact(rf, 'artifacts/source-workflow-map.txt');
      writeArtifact(rf, 'artifacts/source-to-target-porting-map.txt');
      writeArtifact(rf, 'artifacts/do-not-port-list.txt');
      writeArtifact(rf, 'artifacts/golden-behavior-contract.txt');

      setArtifactManualState(rf, 'artifacts/golden-behavior-contract.txt', 'complete', {
        now: '2026-06-01T09:00:00.000Z',
      });
      // do-not-port-list updated after downstream
      setArtifactManualState(rf, 'artifacts/do-not-port-list.txt', 'complete', {
        now: '2026-06-01T11:00:00.000Z',
      });

      const sf = readArtifactStateFile(rf);
      const state = resolveArtifactState(
        rf,
        'artifacts/golden-behavior-contract.txt',
        EXTRACTION_STAGES,
        sf,
      );
      expect(state).toBe('stale');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Supporting reports do not gate via stale ─────────────────────────────────

describe('supporting reports do not create stale gates', () => {
  it('architecture-context-retrieval-report does not appear in upstream artifacts', () => {
    // getUpstreamArtifacts only includes stage artifactFile/additionalArtifactFiles
    // Supporting reports are in reports/ not in stage definitions
    const upstream = getUpstreamArtifacts(
      FEATURE_STAGES,
      'artifacts/behavior-model.txt',
    );
    expect(upstream.some((u) => u.includes('retrieval-report'))).toBe(false);
    expect(upstream.some((u) => u.includes('reports/'))).toBe(false);
  });
});

// ─── isManualState / isForbiddenManualState ───────────────────────────────────

describe('state guard helpers', () => {
  it('isManualState accepts valid manual states', () => {
    expect(isManualState('incomplete')).toBe(true);
    expect(isManualState('blocked')).toBe(true);
    expect(isManualState('complete')).toBe(true);
  });

  it('isManualState rejects forbidden states', () => {
    expect(isManualState('missing')).toBe(false);
    expect(isManualState('stale')).toBe(false);
    expect(isManualState('unknown')).toBe(false);
  });

  it('isForbiddenManualState identifies missing and stale', () => {
    expect(isForbiddenManualState('missing')).toBe(true);
    expect(isForbiddenManualState('stale')).toBe(true);
    expect(isForbiddenManualState('complete')).toBe(false);
    expect(isForbiddenManualState('incomplete')).toBe(false);
  });
});

