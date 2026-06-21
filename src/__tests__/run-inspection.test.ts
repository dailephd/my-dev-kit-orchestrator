import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initWorkspace } from '../workspace';
import { createRun, loadRun, listRunFolders, getMostRecentRun } from '../run';
import { getArtifactStatuses, getNextStage, isRunComplete } from '../stageDetector';
import { VALID_MODES } from '../types';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-inspect-'));
}
function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('status — artifact detection', () => {
  it('shows all artifacts missing on fresh run', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const statuses = getArtifactStatuses(meta);
      expect(statuses.every((s) => !s.present)).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });

  it('correctly detects present artifact after writing', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const artifactPath = path.join(meta.runFolder, 'artifacts/request-brief.txt');
      fs.writeFileSync(artifactPath, 'done', 'utf8');
      const statuses = getArtifactStatuses(meta);
      expect(statuses[0].present).toBe(true);
      expect(statuses[0].stageName).toBe('request-brief');
    } finally {
      cleanup(tmp);
    }
  });

  it('next stage is the first missing artifact', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/request-brief.txt'), 'done', 'utf8');
      const next = getNextStage(meta);
      expect(next!.name).toBe('architecture-context');
    } finally {
      cleanup(tmp);
    }
  });

  it('all artifacts present → run complete', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      for (const s of meta.stages) {
        fs.writeFileSync(path.join(meta.runFolder, s.artifactFile), 'done', 'utf8');
      }
      expect(isRunComplete(meta)).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });
});

describe('status — most recent run selection', () => {
  it('selects most recently modified run folder', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'first run', mode: 'feature', projectRoot: tmp });
      // small delay to differentiate timestamps in test — use mtime-based ordering
      const recent = getMostRecentRun(tmp);
      expect(recent).not.toBeNull();
      expect(recent!.request).toBe('first run');
    } finally {
      cleanup(tmp);
    }
  });
});

describe('status — --run selection', () => {
  it('can load a specific run by ID', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'specific run', mode: 'repair', projectRoot: tmp });
      const loaded = loadRun(meta.runFolder);
      expect(loaded.runId).toBe(meta.runId);
      expect(loaded.mode).toBe('repair');
    } finally {
      cleanup(tmp);
    }
  });
});

describe('list — run listing', () => {
  it('returns empty array when no runs exist', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      expect(listRunFolders(tmp)).toEqual([]);
    } finally {
      cleanup(tmp);
    }
  });

  it('lists all run folders', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'run1', mode: 'feature', projectRoot: tmp });
      createRun({ request: 'run2', mode: 'repair', projectRoot: tmp });
      const folders = listRunFolders(tmp);
      expect(folders.length).toBe(2);
    } finally {
      cleanup(tmp);
    }
  });

  it('getMostRecentRun returns null for empty workspace', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      expect(getMostRecentRun(tmp)).toBeNull();
    } finally {
      cleanup(tmp);
    }
  });
});

describe('list — mode filtering', () => {
  it('can filter runs by mode using listRunFolders + loadRun', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'feature-run', mode: 'feature', projectRoot: tmp });
      createRun({ request: 'repair-run', mode: 'repair', projectRoot: tmp });
      createRun({ request: 'test-run', mode: 'test', projectRoot: tmp });

      const all = listRunFolders(tmp).map((f) => loadRun(f));
      const featureRuns = all.filter((r) => r.mode === 'feature');
      const repairRuns = all.filter((r) => r.mode === 'repair');

      expect(featureRuns.length).toBe(1);
      expect(featureRuns[0].request).toBe('feature-run');
      expect(repairRuns.length).toBe(1);
      expect(repairRuns[0].request).toBe('repair-run');
    } finally {
      cleanup(tmp);
    }
  });

  for (const mode of VALID_MODES) {
    it(`filtering by mode ${mode} works`, () => {
      const tmp = makeTempDir();
      try {
        initWorkspace(tmp);
        createRun({ request: `${mode} request`, mode, projectRoot: tmp });
        const all = listRunFolders(tmp).map((f) => loadRun(f));
        const filtered = all.filter((r) => r.mode === mode);
        expect(filtered.length).toBe(1);
        expect(filtered[0].mode).toBe(mode);
      } finally {
        cleanup(tmp);
      }
    });
  }
});

describe('malformed run.json handling', () => {
  it('getMostRecentRun handles malformed run.json gracefully', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      fs.writeFileSync(path.join(meta.runFolder, 'run.json'), 'INVALID JSON', 'utf8');
      // getMostRecentRun should return null on parse failure
      const result = getMostRecentRun(tmp);
      expect(result).toBeNull();
    } finally {
      cleanup(tmp);
    }
  });

  it('loadRun throws for missing run.json', () => {
    const tmp = makeTempDir();
    try {
      const fakePath = path.join(tmp, 'nonexistent-run');
      expect(() => loadRun(fakePath)).toThrow();
    } finally {
      cleanup(tmp);
    }
  });
});

describe('status output contains required fields', () => {
  it('run metadata has all required status fields', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'add login feature', mode: 'feature', projectRoot: tmp });
      expect(meta.runId).toBeTruthy();
      expect(meta.mode).toBe('feature');
      expect(meta.request).toBe('add login feature');
      expect(meta.runFolder).toBeTruthy();
      expect(meta.createdAt).toBeTruthy();
      expect(meta.stages).toBeDefined();
      expect(meta.currentStage).toBe('request-brief');
    } finally {
      cleanup(tmp);
    }
  });
});
