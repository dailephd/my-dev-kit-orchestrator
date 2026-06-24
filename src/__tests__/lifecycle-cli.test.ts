/**
 * Lifecycle CLI tests for v0.3.0: stage progression, status, prompt, mark command.
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
} from '../artifactLifecycle';
import { makeMarkCommand } from '../commands/mark';
import { Command } from 'commander';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-lccli-'));
}
function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}
function writeArtifact(runFolder: string, artifactFile: string, content = 'done') {
  const full = path.join(runFolder, artifactFile);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

// ─── Stage progression: lifecycle-aware ──────────────────────────────────────

describe('getNextStageWithLifecycle - stage progression', () => {
  it('missing artifact remains at current stage', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const sf = readArtifactStateFile(meta.runFolder);
      const next = getNextStageWithLifecycle(meta, sf);
      expect(next?.name).toBe('request-brief');
    } finally {
      cleanup(tmp);
    }
  });

  it('incomplete artifact remains at current stage', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt');
      setArtifactManualState(meta.runFolder, 'artifacts/request-brief.txt', 'incomplete', {
        reason: 'Not finished',
      });
      const sf = readArtifactStateFile(meta.runFolder);
      const next = getNextStageWithLifecycle(meta, sf);
      expect(next?.name).toBe('request-brief');
    } finally {
      cleanup(tmp);
    }
  });

  it('blocked artifact remains at current stage', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      setArtifactManualState(meta.runFolder, 'artifacts/request-brief.txt', 'blocked', {
        reason: 'Waiting for spec',
      });
      const sf = readArtifactStateFile(meta.runFolder);
      const next = getNextStageWithLifecycle(meta, sf);
      expect(next?.name).toBe('request-brief');
    } finally {
      cleanup(tmp);
    }
  });

  it('stale artifact returns to stale stage', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt');
      writeArtifact(meta.runFolder, 'artifacts/architecture-context-packet.txt');

      // downstream completed before upstream
      setArtifactManualState(meta.runFolder, 'artifacts/architecture-context-packet.txt', 'complete', {
        now: '2026-06-01T09:00:00.000Z',
      });
      setArtifactManualState(meta.runFolder, 'artifacts/request-brief.txt', 'complete', {
        now: '2026-06-01T12:00:00.000Z',
      });

      const sf = readArtifactStateFile(meta.runFolder);
      const next = getNextStageWithLifecycle(meta, sf);
      expect(next?.name).toBe('architecture-context');
    } finally {
      cleanup(tmp);
    }
  });

  it('complete artifacts advance normally', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt');
      setArtifactManualState(meta.runFolder, 'artifacts/request-brief.txt', 'complete', {
        now: '2026-06-01T09:00:00.000Z',
      });
      const sf = readArtifactStateFile(meta.runFolder);
      const next = getNextStageWithLifecycle(meta, sf);
      expect(next?.name).toBe('architecture-context');
    } finally {
      cleanup(tmp);
    }
  });

  it('all complete -> run complete', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      let t = new Date('2026-06-01T09:00:00.000Z');
      for (const stage of meta.stages) {
        writeArtifact(meta.runFolder, stage.artifactFile);
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
});

// ─── Stage progression: extraction porting-map dual artifact ─────────────────

describe('extraction: porting-map dual artifact lifecycle', () => {
  it('stays at porting-map when primary is missing', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({
        request: 'extract',
        mode: 'extraction',
        projectRoot: tmp,
        sourceRepoRoot: tmp,
        targetRepoRoot: tmp,
      });
      // Write all prior stages with timestamps
      const prior = ['artifacts/request-brief.txt', 'artifacts/source-architecture-context-packet.txt', 'artifacts/source-workflow-map.txt'];
      let t = new Date('2026-06-01T09:00:00.000Z');
      for (const f of prior) {
        writeArtifact(meta.runFolder, f);
        setArtifactManualState(meta.runFolder, f, 'complete', { now: t.toISOString() });
        t = new Date(t.getTime() + 60000);
      }
      // porting-map primary missing
      const sf = readArtifactStateFile(meta.runFolder);
      const next = getNextStageWithLifecycle(meta, sf);
      expect(next?.name).toBe('porting-map');
    } finally {
      cleanup(tmp);
    }
  });

  it('stays at porting-map when do-not-port-list is missing', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({
        request: 'extract',
        mode: 'extraction',
        projectRoot: tmp,
        sourceRepoRoot: tmp,
        targetRepoRoot: tmp,
      });
      const prior = ['artifacts/request-brief.txt', 'artifacts/source-architecture-context-packet.txt', 'artifacts/source-workflow-map.txt'];
      let t = new Date('2026-06-01T09:00:00.000Z');
      for (const f of prior) {
        writeArtifact(meta.runFolder, f);
        setArtifactManualState(meta.runFolder, f, 'complete', { now: t.toISOString() });
        t = new Date(t.getTime() + 60000);
      }
      // primary exists but additional is missing
      writeArtifact(meta.runFolder, 'artifacts/source-to-target-porting-map.txt');
      setArtifactManualState(meta.runFolder, 'artifacts/source-to-target-porting-map.txt', 'complete', {
        now: t.toISOString(),
      });
      const sf = readArtifactStateFile(meta.runFolder);
      const next = getNextStageWithLifecycle(meta, sf);
      expect(next?.name).toBe('porting-map');
    } finally {
      cleanup(tmp);
    }
  });

  it('advances past porting-map when both artifacts are complete', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({
        request: 'extract',
        mode: 'extraction',
        projectRoot: tmp,
        sourceRepoRoot: tmp,
        targetRepoRoot: tmp,
      });
      const prior = [
        'artifacts/request-brief.txt',
        'artifacts/source-architecture-context-packet.txt',
        'artifacts/source-workflow-map.txt',
        'artifacts/source-to-target-porting-map.txt',
        'artifacts/do-not-port-list.txt',
      ];
      let t = new Date('2026-06-01T09:00:00.000Z');
      for (const f of prior) {
        writeArtifact(meta.runFolder, f);
        setArtifactManualState(meta.runFolder, f, 'complete', { now: t.toISOString() });
        t = new Date(t.getTime() + 60000);
      }
      const sf = readArtifactStateFile(meta.runFolder);
      const next = getNextStageWithLifecycle(meta, sf);
      expect(next?.name).toBe('golden-behavior-contract');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Supporting reports do not gate stage progression ────────────────────────

describe('supporting reports do not gate stage progression', () => {
  it('architecture-context-retrieval-report absence does not block progression', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt');
      writeArtifact(meta.runFolder, 'artifacts/architecture-context-packet.txt');
      // No retrieval report written
      setArtifactManualState(meta.runFolder, 'artifacts/request-brief.txt', 'complete', {
        now: '2026-06-01T09:00:00.000Z',
      });
      setArtifactManualState(meta.runFolder, 'artifacts/architecture-context-packet.txt', 'complete', {
        now: '2026-06-01T10:00:00.000Z',
      });
      const sf = readArtifactStateFile(meta.runFolder);
      const next = getNextStageWithLifecycle(meta, sf);
      expect(next?.name).toBe('behavior-model');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Status: getArtifactLifecycleStatuses ────────────────────────────────────

describe('getArtifactLifecycleStatuses', () => {
  it('shows complete for present artifact with no state', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt');
      const sf = readArtifactStateFile(meta.runFolder);
      const statuses = getArtifactLifecycleStatuses(meta, sf);
      const rb = statuses.find((s) => s.artifactFile === 'artifacts/request-brief.txt')!;
      expect(rb.lifecycleState).toBe('complete');
    } finally {
      cleanup(tmp);
    }
  });

  it('shows missing for absent artifact with no state', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const sf = readArtifactStateFile(meta.runFolder);
      const statuses = getArtifactLifecycleStatuses(meta, sf);
      const rb = statuses.find((s) => s.artifactFile === 'artifacts/request-brief.txt')!;
      expect(rb.lifecycleState).toBe('missing');
    } finally {
      cleanup(tmp);
    }
  });

  it('shows blocked state with reason', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      setArtifactManualState(meta.runFolder, 'artifacts/request-brief.txt', 'blocked', {
        reason: 'Waiting for spec',
      });
      const sf = readArtifactStateFile(meta.runFolder);
      const statuses = getArtifactLifecycleStatuses(meta, sf);
      const rb = statuses.find((s) => s.artifactFile === 'artifacts/request-brief.txt')!;
      expect(rb.lifecycleState).toBe('blocked');
      expect(rb.reason).toBe('Waiting for spec');
    } finally {
      cleanup(tmp);
    }
  });

  it('shows incomplete state with reason', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt');
      setArtifactManualState(meta.runFolder, 'artifacts/request-brief.txt', 'incomplete', {
        reason: 'Missing section',
      });
      const sf = readArtifactStateFile(meta.runFolder);
      const statuses = getArtifactLifecycleStatuses(meta, sf);
      const rb = statuses.find((s) => s.artifactFile === 'artifacts/request-brief.txt')!;
      expect(rb.lifecycleState).toBe('incomplete');
      expect(rb.reason).toBe('Missing section');
    } finally {
      cleanup(tmp);
    }
  });

  it('shows stale state with reason', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt');
      writeArtifact(meta.runFolder, 'artifacts/architecture-context-packet.txt');
      setArtifactManualState(meta.runFolder, 'artifacts/architecture-context-packet.txt', 'complete', {
        now: '2026-06-01T09:00:00.000Z',
      });
      setArtifactManualState(meta.runFolder, 'artifacts/request-brief.txt', 'complete', {
        now: '2026-06-01T12:00:00.000Z',
      });
      const sf = readArtifactStateFile(meta.runFolder);
      const statuses = getArtifactLifecycleStatuses(meta, sf);
      const ac = statuses.find((s) => s.artifactFile === 'artifacts/architecture-context-packet.txt')!;
      expect(ac.lifecycleState).toBe('stale');
      expect(ac.reason).toContain('request-brief.txt');
    } finally {
      cleanup(tmp);
    }
  });

  it('extraction: shows both porting-map artifacts in status', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({
        request: 'extract',
        mode: 'extraction',
        projectRoot: tmp,
        sourceRepoRoot: tmp,
        targetRepoRoot: tmp,
      });
      const sf = readArtifactStateFile(meta.runFolder);
      const statuses = getArtifactLifecycleStatuses(meta, sf);
      const portingMap = statuses.find((s) => s.artifactFile === 'artifacts/source-to-target-porting-map.txt');
      const doNotPort = statuses.find((s) => s.artifactFile === 'artifacts/do-not-port-list.txt');
      expect(portingMap).toBeDefined();
      expect(doNotPort).toBeDefined();
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Mark command ─────────────────────────────────────────────────────────────

function runMarkCommand(args: string[], projectRoot: string): { exitCode: number; output: string } {
  let exitCode = 0;
  const outputs: string[] = [];
  const originalExit = process.exit;
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  process.exit = ((code: number) => { exitCode = code ?? 0; throw new Error(`process.exit(${code})`); }) as typeof process.exit;
  console.log = (...a: unknown[]) => outputs.push(a.join(' '));
  console.error = (...a: unknown[]) => outputs.push(a.join(' '));
  console.warn = (...a: unknown[]) => outputs.push(a.join(' '));

  try {
    const mark = makeMarkCommand();
    const prog = new Command();
    prog.addCommand(mark);
    prog.parse(['node', 'cli', 'mark', ...args, '--root', projectRoot]);
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith('process.exit')) throw e;
  } finally {
    process.exit = originalExit;
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }

  return { exitCode, output: outputs.join('\n') };
}

describe('mark command', () => {
  it('mark incomplete writes artifact-state.json with reason', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt');

      const result = runMarkCommand(
        ['request-brief.txt', '--state', 'incomplete', '--reason', 'Still writing'],
        tmp,
      );
      expect(result.exitCode).toBe(0);
      const sf = readArtifactStateFile(meta.runFolder);
      expect(sf.artifacts['artifacts/request-brief.txt']?.state).toBe('incomplete');
      expect(sf.artifacts['artifacts/request-brief.txt']?.reason).toBe('Still writing');
    } finally {
      cleanup(tmp);
    }
  });

  it('mark blocked writes artifact-state.json with reason', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });

      const result = runMarkCommand(
        ['request-brief.txt', '--state', 'blocked', '--reason', 'Waiting for PM'],
        tmp,
      );
      expect(result.exitCode).toBe(0);
      const sf = readArtifactStateFile(meta.runFolder);
      expect(sf.artifacts['artifacts/request-brief.txt']?.state).toBe('blocked');
      expect(sf.artifacts['artifacts/request-brief.txt']?.reason).toBe('Waiting for PM');
    } finally {
      cleanup(tmp);
    }
  });

  it('mark complete writes artifact-state.json', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt');

      const result = runMarkCommand(['request-brief.txt', '--state', 'complete'], tmp);
      expect(result.exitCode).toBe(0);
      const sf = readArtifactStateFile(meta.runFolder);
      expect(sf.artifacts['artifacts/request-brief.txt']?.state).toBe('complete');
    } finally {
      cleanup(tmp);
    }
  });

  it('mark rejects stale state with clear error', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const result = runMarkCommand(['request-brief.txt', '--state', 'stale'], tmp);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('stale');
    } finally {
      cleanup(tmp);
    }
  });

  it('mark rejects missing state with clear error', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const result = runMarkCommand(['request-brief.txt', '--state', 'missing'], tmp);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('missing');
    } finally {
      cleanup(tmp);
    }
  });

  it('mark incomplete without reason exits with error', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const result = runMarkCommand(['request-brief.txt', '--state', 'incomplete'], tmp);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('--reason');
    } finally {
      cleanup(tmp);
    }
  });

  it('mark blocked without reason exits with error', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const result = runMarkCommand(['request-brief.txt', '--state', 'blocked'], tmp);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('--reason');
    } finally {
      cleanup(tmp);
    }
  });

  it('mark complete does not require reason', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const result = runMarkCommand(['request-brief.txt', '--state', 'complete'], tmp);
      expect(result.exitCode).toBe(0);
    } finally {
      cleanup(tmp);
    }
  });

  it('mark unknown artifact fails with clear error listing known artifacts', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const result = runMarkCommand(['unknown-artifact.txt', '--state', 'complete'], tmp);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('unknown artifact');
    } finally {
      cleanup(tmp);
    }
  });

  it('mark complete does not hide missing artifact file', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      // Do NOT write the file
      runMarkCommand(['request-brief.txt', '--state', 'complete'], tmp);
      const sf = readArtifactStateFile(meta.runFolder);
      const effectiveState = resolveArtifactState(
        meta.runFolder,
        'artifacts/request-brief.txt',
        meta.stages,
        sf,
      );
      expect(effectiveState).toBe('missing');
    } finally {
      cleanup(tmp);
    }
  });

  it('mark works cross-platform with temp dirs', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test cross-platform', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt');
      const result = runMarkCommand(
        ['request-brief.txt', '--state', 'blocked', '--reason', 'Cross-platform test'],
        tmp,
      );
      expect(result.exitCode).toBe(0);
      const sf = readArtifactStateFile(meta.runFolder);
      expect(sf.artifacts['artifacts/request-brief.txt']?.state).toBe('blocked');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Backward compat: existing runs without artifact-state.json ──────────────

describe('backward compatibility: runs without artifact-state.json', () => {
  it('file exists -> complete without state file', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt');
      // No artifact-state.json
      const sf = readArtifactStateFile(meta.runFolder);
      expect(sf.artifacts).toEqual({});
      const state = resolveArtifactState(
        meta.runFolder,
        'artifacts/request-brief.txt',
        meta.stages,
        sf,
      );
      expect(state).toBe('complete');
    } finally {
      cleanup(tmp);
    }
  });

  it('getNextStageWithLifecycle works for legacy run (file-existence only)', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt');
      const sf = readArtifactStateFile(meta.runFolder);
      const next = getNextStageWithLifecycle(meta, sf);
      expect(next?.name).toBe('architecture-context');
    } finally {
      cleanup(tmp);
    }
  });
});

