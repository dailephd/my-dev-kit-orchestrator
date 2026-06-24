/**
 * Integration tests covering the full v0.3.0 artifact lifecycle workflow.
 * Tests the complete flow: start -> status -> mark -> prompt -> artifact -> stale.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initWorkspace } from '../workspace';
import { createRun } from '../run';
import {
  getNextStageWithLifecycle,
  isRunCompleteWithLifecycle,
  getArtifactLifecycleStatuses,
} from '../stageDetector';
import {
  readArtifactStateFile,
  setArtifactManualState,
  resolveArtifactState,
  isManualState,
  isForbiddenManualState,
} from '../artifactLifecycle';
import { generateStagePrompt } from '../promptGenerator';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-int3-'));
}
function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}
function writeArtifact(runFolder: string, artifactFile: string, content = 'done') {
  const full = path.join(runFolder, artifactFile);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

// ─── Full lifecycle flow: feature run ────────────────────────────────────────

describe('integration: full feature lifecycle flow', () => {
  it('start -> status shows missing -> mark blocked -> status shows blocked -> write artifact -> mark complete -> prompt advances', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'lifecycle integration test', mode: 'feature', projectRoot: tmp });

      // 1. Status shows first artifact missing
      let sf = readArtifactStateFile(meta.runFolder);
      let next = getNextStageWithLifecycle(meta, sf);
      expect(next?.name).toBe('request-brief');

      let statuses = getArtifactLifecycleStatuses(meta, sf);
      const rb = statuses.find((s) => s.artifactFile === 'artifacts/request-brief.txt')!;
      expect(rb.lifecycleState).toBe('missing');

      // 2. Mark blocked with reason
      setArtifactManualState(meta.runFolder, 'artifacts/request-brief.txt', 'blocked', {
        reason: 'Waiting for PM spec',
      });

      sf = readArtifactStateFile(meta.runFolder);
      statuses = getArtifactLifecycleStatuses(meta, sf);
      const rbBlocked = statuses.find((s) => s.artifactFile === 'artifacts/request-brief.txt')!;
      expect(rbBlocked.lifecycleState).toBe('blocked');
      expect(rbBlocked.reason).toBe('Waiting for PM spec');

      // 3. Prompt still at request-brief stage (blocked keeps stage)
      next = getNextStageWithLifecycle(meta, sf);
      expect(next?.name).toBe('request-brief');

      // 4. Write the artifact and mark complete
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt');
      setArtifactManualState(meta.runFolder, 'artifacts/request-brief.txt', 'complete', {
        now: '2026-06-01T09:00:00.000Z',
      });

      sf = readArtifactStateFile(meta.runFolder);
      next = getNextStageWithLifecycle(meta, sf);
      expect(next?.name).toBe('architecture-context');

      // 5. Prompt for next stage is generated
      const promptText = generateStagePrompt(meta, 'architecture-context');
      expect(promptText).toContain('Stage: architecture-context');
    } finally {
      cleanup(tmp);
    }
  });

  it('downstream artifact becomes stale after upstream artifact is updated', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'stale integration test', mode: 'feature', projectRoot: tmp });

      // Write and complete first two stages
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt');
      writeArtifact(meta.runFolder, 'artifacts/architecture-context-packet.txt');

      setArtifactManualState(meta.runFolder, 'artifacts/request-brief.txt', 'complete', {
        now: '2026-06-01T09:00:00.000Z',
      });
      setArtifactManualState(meta.runFolder, 'artifacts/architecture-context-packet.txt', 'complete', {
        now: '2026-06-01T10:00:00.000Z',
      });

      let sf = readArtifactStateFile(meta.runFolder);
      let next = getNextStageWithLifecycle(meta, sf);
      expect(next?.name).toBe('behavior-model');

      // Update upstream artifact timestamp (simulating re-edit of request-brief)
      setArtifactManualState(meta.runFolder, 'artifacts/request-brief.txt', 'complete', {
        now: '2026-06-01T12:00:00.000Z',
      });

      sf = readArtifactStateFile(meta.runFolder);

      // architecture-context is now stale
      const acState = resolveArtifactState(
        meta.runFolder,
        'artifacts/architecture-context-packet.txt',
        meta.stages,
        sf,
      );
      expect(acState).toBe('stale');

      // Prompt returns to stale stage
      next = getNextStageWithLifecycle(meta, sf);
      expect(next?.name).toBe('architecture-context');
    } finally {
      cleanup(tmp);
    }
  });

  it('mark rejects stale state - isForbiddenManualState', () => {
    expect(isForbiddenManualState('stale')).toBe(true);
  });

  it('mark rejects missing state - isForbiddenManualState', () => {
    expect(isForbiddenManualState('missing')).toBe(true);
  });

  it('isManualState accepts the three valid states', () => {
    expect(isManualState('incomplete')).toBe(true);
    expect(isManualState('blocked')).toBe(true);
    expect(isManualState('complete')).toBe(true);
    expect(isManualState('stale')).toBe(false);
    expect(isManualState('missing')).toBe(false);
  });
});

// ─── Extraction porting-map dual artifact lifecycle (integration) ─────────────

describe('integration: extraction porting-map dual artifact with lifecycle', () => {
  it('full extraction porting-map flow: missing -> blocked -> complete both -> advances', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({
        request: 'extraction lifecycle integration',
        mode: 'extraction',
        projectRoot: tmp,
        sourceRepoRoot: tmp,
        targetRepoRoot: tmp,
      });

      // Complete prior stages with timestamps
      const priorFiles = [
        'artifacts/request-brief.txt',
        'artifacts/source-architecture-context-packet.txt',
        'artifacts/source-workflow-map.txt',
      ];
      let t = new Date('2026-06-01T09:00:00.000Z');
      for (const f of priorFiles) {
        writeArtifact(meta.runFolder, f);
        setArtifactManualState(meta.runFolder, f, 'complete', { now: t.toISOString() });
        t = new Date(t.getTime() + 60000);
      }

      let sf = readArtifactStateFile(meta.runFolder);
      let next = getNextStageWithLifecycle(meta, sf);
      expect(next?.name).toBe('porting-map');

      // Block the primary porting-map artifact
      setArtifactManualState(meta.runFolder, 'artifacts/source-to-target-porting-map.txt', 'blocked', {
        reason: 'Target repo not ready',
      });

      sf = readArtifactStateFile(meta.runFolder);
      next = getNextStageWithLifecycle(meta, sf);
      expect(next?.name).toBe('porting-map');

      const statuses = getArtifactLifecycleStatuses(meta, sf);
      const portingMapStatus = statuses.find((s) => s.artifactFile === 'artifacts/source-to-target-porting-map.txt')!;
      expect(portingMapStatus.lifecycleState).toBe('blocked');
      expect(portingMapStatus.reason).toBe('Target repo not ready');

      // Write both porting-map artifacts and complete them
      writeArtifact(meta.runFolder, 'artifacts/source-to-target-porting-map.txt');
      writeArtifact(meta.runFolder, 'artifacts/do-not-port-list.txt');
      setArtifactManualState(meta.runFolder, 'artifacts/source-to-target-porting-map.txt', 'complete', {
        now: t.toISOString(),
      });
      t = new Date(t.getTime() + 60000);
      setArtifactManualState(meta.runFolder, 'artifacts/do-not-port-list.txt', 'complete', {
        now: t.toISOString(),
      });

      sf = readArtifactStateFile(meta.runFolder);
      next = getNextStageWithLifecycle(meta, sf);
      expect(next?.name).toBe('golden-behavior-contract');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Existing modes baseline smoke ───────────────────────────────────────────

describe('integration: existing modes still pass baseline smoke with lifecycle layer', () => {
  const MODES = ['feature', 'repair', 'test', 'refactor', 'harden'] as const;

  for (const mode of MODES) {
    it(`${mode} mode: first stage is missing, lifecycle-aware and file-existence agree`, () => {
      const tmp = makeTempDir();
      try {
        initWorkspace(tmp);
        const meta = createRun({ request: `${mode} lifecycle smoke`, mode, projectRoot: tmp });
        const sf = readArtifactStateFile(meta.runFolder);
        const next = getNextStageWithLifecycle(meta, sf);
        expect(next).not.toBeNull();
        expect(next!.name).toBe(meta.stages[0].name);
      } finally {
        cleanup(tmp);
      }
    });

    it(`${mode} mode: all artifacts present -> run complete (lifecycle-aware)`, () => {
      const tmp = makeTempDir();
      try {
        initWorkspace(tmp);
        const meta = createRun({ request: `${mode} lifecycle complete smoke`, mode, projectRoot: tmp });
        let t = new Date('2026-06-01T09:00:00.000Z');
        for (const stage of meta.stages) {
          writeArtifact(meta.runFolder, stage.artifactFile);
          if (stage.additionalArtifactFiles) {
            for (const f of stage.additionalArtifactFiles) {
              writeArtifact(meta.runFolder, f);
              setArtifactManualState(meta.runFolder, f, 'complete', { now: t.toISOString() });
              t = new Date(t.getTime() + 60000);
            }
          }
          setArtifactManualState(meta.runFolder, stage.artifactFile, 'complete', {
            now: t.toISOString(),
          });
          t = new Date(t.getTime() + 60000);
        }
        const sf = readArtifactStateFile(meta.runFolder);
        expect(isRunCompleteWithLifecycle(meta, sf)).toBe(true);
      } finally {
        cleanup(tmp);
      }
    });
  }
});

// ─── Backward compat: v0.2.1 behavior unaffected ─────────────────────────────

describe('integration: v0.2.1 backward compatibility', () => {
  it('existing runs without artifact-state.json advance by file existence', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'legacy run', mode: 'feature', projectRoot: tmp });

      // Write first artifact directly (no state file)
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt');

      // No artifact-state.json - should read empty state
      const sf = readArtifactStateFile(meta.runFolder);
      expect(Object.keys(sf.artifacts)).toHaveLength(0);

      // Lifecycle-aware progression still works
      const next = getNextStageWithLifecycle(meta, sf);
      expect(next?.name).toBe('architecture-context');
    } finally {
      cleanup(tmp);
    }
  });

  it('complete workflow without state file advances correctly', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'full legacy', mode: 'feature', projectRoot: tmp });
      for (const stage of meta.stages) {
        writeArtifact(meta.runFolder, stage.artifactFile);
      }
      const sf = readArtifactStateFile(meta.runFolder);
      expect(isRunCompleteWithLifecycle(meta, sf)).toBe(true);
    } finally {
      cleanup(tmp);
    }
  });
});

