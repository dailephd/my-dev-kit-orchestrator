import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initWorkspace } from '../workspace';
import { createRun } from '../run';
import { getNextStage, isRunComplete, getMissingPriorArtifacts, getArtifactStatuses } from '../stageDetector';
import { VALID_MODES } from '../types';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-pcmd-'));
}
function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('getNextStage', () => {
  it('returns first stage when no artifacts exist', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const next = getNextStage(meta);
      expect(next).not.toBeNull();
      expect(next!.name).toBe('request-brief');
    } finally {
      cleanup(tmp);
    }
  });

  it('advances to the second stage when first artifact exists', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/request-brief.txt'), 'content', 'utf8');
      const next = getNextStage(meta);
      expect(next!.name).toBe('architecture-context');
    } finally {
      cleanup(tmp);
    }
  });

  it('returns null when all artifacts exist (run complete)', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      for (const stage of meta.stages) {
        fs.writeFileSync(path.join(meta.runFolder, stage.artifactFile), 'done', 'utf8');
      }
      expect(getNextStage(meta)).toBeNull();
    } finally {
      cleanup(tmp);
    }
  });

  it('first missing artifact determines next stage (not sequential)', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      // Write first two but skip third
      fs.writeFileSync(path.join(meta.runFolder, meta.stages[0].artifactFile), 'done', 'utf8');
      fs.writeFileSync(path.join(meta.runFolder, meta.stages[1].artifactFile), 'done', 'utf8');
      const next = getNextStage(meta);
      expect(next!.name).toBe(meta.stages[2].name);
    } finally {
      cleanup(tmp);
    }
  });
});

describe('isRunComplete', () => {
  it('returns false when no artifacts exist', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      expect(isRunComplete(meta)).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });

  it('returns true when all artifacts exist', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      for (const stage of meta.stages) {
        fs.writeFileSync(path.join(meta.runFolder, stage.artifactFile), 'done', 'utf8');
      }
      expect(isRunComplete(meta)).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });
});

describe('getMissingPriorArtifacts', () => {
  it('returns empty array for first stage', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const missing = getMissingPriorArtifacts(meta, 'request-brief');
      expect(missing).toEqual([]);
    } finally {
      cleanup(tmp);
    }
  });

  it('returns missing prior artifacts for a later stage', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      // No artifacts written
      const missing = getMissingPriorArtifacts(meta, 'behavior-model');
      // behavior-model is stage index 2, so stages 0 (request-brief) and 1 (architecture-context) are prior
      expect(missing).toContain('artifacts/request-brief.txt');
      expect(missing).toContain('artifacts/architecture-context-packet.txt');
    } finally {
      cleanup(tmp);
    }
  });

  it('returns empty when all prior artifacts exist', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      // Write first two artifacts
      fs.writeFileSync(path.join(meta.runFolder, meta.stages[0].artifactFile), 'done', 'utf8');
      fs.writeFileSync(path.join(meta.runFolder, meta.stages[1].artifactFile), 'done', 'utf8');
      const missing = getMissingPriorArtifacts(meta, 'behavior-model');
      expect(missing).toEqual([]);
    } finally {
      cleanup(tmp);
    }
  });

  it('returns empty array for unknown stage name', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const missing = getMissingPriorArtifacts(meta, 'nonexistent-stage');
      expect(missing).toEqual([]);
    } finally {
      cleanup(tmp);
    }
  });
});

describe('getArtifactStatuses', () => {
  it('all statuses are missing initially', () => {
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

  it('shows present for written artifact', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/request-brief.txt'), 'done', 'utf8');
      const statuses = getArtifactStatuses(meta);
      expect(statuses[0].present).toBe(true);
      expect(statuses[1].present).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });
});

describe('stage detection across all modes', () => {
  for (const mode of VALID_MODES) {
    it(`${mode} mode: first stage is detected as next when no artifacts exist`, () => {
      const tmp = makeTempDir();
      try {
        initWorkspace(tmp);
        const meta = createRun({ request: 'test', mode, projectRoot: tmp });
        const next = getNextStage(meta);
        expect(next).not.toBeNull();
        expect(next!.name).toBe(meta.stages[0].name);
      } finally {
        cleanup(tmp);
      }
    });
  }
});

describe('prompt command behavior — content validation', () => {
  it('prompt for a specific stage returns stage-specific content', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const promptPath = path.join(meta.runFolder, meta.stages[0].promptFile);
      expect(fs.existsSync(promptPath)).toBe(true);
      const content = fs.readFileSync(promptPath, 'utf8');
      expect(content).toContain('Stage: request-brief');
      expect(content).not.toContain('Stage: architecture-context');
    } finally {
      cleanup(tmp);
    }
  });

  it('each stage prompt file is stage-specific', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      for (const stage of meta.stages) {
        const promptPath = path.join(meta.runFolder, stage.promptFile);
        const content = fs.readFileSync(promptPath, 'utf8');
        expect(content).toContain(`Stage: ${stage.name}`);
      }
    } finally {
      cleanup(tmp);
    }
  });
});
