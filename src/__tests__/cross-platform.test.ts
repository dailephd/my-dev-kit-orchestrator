/**
 * Cross-platform assurance tests for extraction mode.
 *
 * Covers:
 * - OS-native absolute paths from os.tmpdir()
 * - Paths containing spaces
 * - Relative --source/--target normalization (CLI subprocess tests)
 * - Stable error messages across OSes
 * - Non-extraction modes without source/target
 * - Path-separator-safe assertions
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as cp from 'child_process';
import { initWorkspace } from '../workspace';
import { createRun, loadRun } from '../run';
import { getNextStage, getArtifactStatuses } from '../stageDetector';
import type { WorkflowMode } from '../types';

const CLI_PATH = path.join(__dirname, '..', '..', 'dist', 'cli.js');
const CLI_BUILT = fs.existsSync(CLI_PATH);

function makeTempDir(prefix = 'mdko-xplat-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeTempDirNamed(name: string): string {
  const dir = path.join(os.tmpdir(), name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(...dirs: string[]) {
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function runCLI(
  args: string[],
  cwd: string,
): { stdout: string; stderr: string; status: number } {
  const result = cp.spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
  };
}

// ─── OS-native absolute path tests (no CLI subprocess required) ───────────────

describe('cross-platform: OS-native absolute paths', () => {
  it('extraction run stores OS temp dir source and target paths in metadata', () => {
    const sourceDir = makeTempDir('mdko-xplat-src-');
    const targetDir = makeTempDir('mdko-xplat-tgt-');
    try {
      initWorkspace(targetDir);
      const meta = createRun({
        request: 'extract workflow',
        mode: 'extraction',
        projectRoot: targetDir,
        sourceRepoRoot: sourceDir,
        targetRepoRoot: targetDir,
      });
      expect(meta.sourceRepoRoot).toBe(sourceDir);
      expect(meta.targetRepoRoot).toBe(targetDir);
    } finally {
      cleanup(sourceDir, targetDir);
    }
  });

  it('sourceRepoRoot and targetRepoRoot survive round-trip through run.json', () => {
    const sourceDir = makeTempDir('mdko-xplat-src-');
    const targetDir = makeTempDir('mdko-xplat-tgt-');
    try {
      initWorkspace(targetDir);
      const meta = createRun({
        request: 'extract workflow',
        mode: 'extraction',
        projectRoot: targetDir,
        sourceRepoRoot: sourceDir,
        targetRepoRoot: targetDir,
      });
      const loaded = loadRun(meta.runFolder);
      expect(loaded.sourceRepoRoot).toBe(sourceDir);
      expect(loaded.targetRepoRoot).toBe(targetDir);
    } finally {
      cleanup(sourceDir, targetDir);
    }
  });

  it('source directory is not modified by run creation', () => {
    const sourceDir = makeTempDir('mdko-xplat-src-');
    const targetDir = makeTempDir('mdko-xplat-tgt-');
    try {
      const before = fs.readdirSync(sourceDir);
      initWorkspace(targetDir);
      createRun({
        request: 'extract workflow',
        mode: 'extraction',
        projectRoot: targetDir,
        sourceRepoRoot: sourceDir,
        targetRepoRoot: targetDir,
      });
      const after = fs.readdirSync(sourceDir);
      expect(after).toEqual(before);
    } finally {
      cleanup(sourceDir, targetDir);
    }
  });

  it('run artifacts are created under target directory, not source', () => {
    const sourceDir = makeTempDir('mdko-xplat-src-');
    const targetDir = makeTempDir('mdko-xplat-tgt-');
    try {
      initWorkspace(targetDir);
      const meta = createRun({
        request: 'extract workflow',
        mode: 'extraction',
        projectRoot: targetDir,
        sourceRepoRoot: sourceDir,
        targetRepoRoot: targetDir,
      });
      expect(meta.runFolder.startsWith(targetDir)).toBe(true);
      expect(fs.existsSync(path.join(meta.runFolder, 'run.json'))).toBe(true);
      expect(fs.existsSync(path.join(sourceDir, '.my-dev-kit-orchestrator'))).toBe(false);
    } finally {
      cleanup(sourceDir, targetDir);
    }
  });

  it('first stage of extraction run is request-brief', () => {
    const sourceDir = makeTempDir('mdko-xplat-src-');
    const targetDir = makeTempDir('mdko-xplat-tgt-');
    try {
      initWorkspace(targetDir);
      const meta = createRun({
        request: 'extract workflow',
        mode: 'extraction',
        projectRoot: targetDir,
        sourceRepoRoot: sourceDir,
        targetRepoRoot: targetDir,
      });
      const next = getNextStage(meta);
      expect(next?.name).toBe('request-brief');
    } finally {
      cleanup(sourceDir, targetDir);
    }
  });
});

// ─── Paths with spaces ────────────────────────────────────────────────────────

describe('cross-platform: paths containing spaces', () => {
  it('extraction run stores source path containing spaces', () => {
    const sourceDir = makeTempDirNamed(`mdko-xplat-source repo-${Date.now()}`);
    const targetDir = makeTempDirNamed(`mdko-xplat-target repo-${Date.now()}`);
    try {
      initWorkspace(targetDir);
      const meta = createRun({
        request: 'extract workflow with spaces in paths',
        mode: 'extraction',
        projectRoot: targetDir,
        sourceRepoRoot: sourceDir,
        targetRepoRoot: targetDir,
      });
      expect(meta.sourceRepoRoot).toBe(sourceDir);
      expect(meta.targetRepoRoot).toBe(targetDir);
      expect(meta.sourceRepoRoot).toContain(' ');
      expect(meta.targetRepoRoot).toContain(' ');
    } finally {
      cleanup(sourceDir, targetDir);
    }
  });

  it('run.json persists paths with spaces correctly', () => {
    const sourceDir = makeTempDirNamed(`mdko-xplat-source repo-${Date.now()}`);
    const targetDir = makeTempDirNamed(`mdko-xplat-target repo-${Date.now()}`);
    try {
      initWorkspace(targetDir);
      const meta = createRun({
        request: 'extract',
        mode: 'extraction',
        projectRoot: targetDir,
        sourceRepoRoot: sourceDir,
        targetRepoRoot: targetDir,
      });
      const loaded = loadRun(meta.runFolder);
      expect(loaded.sourceRepoRoot).toBe(sourceDir);
      expect(loaded.targetRepoRoot).toBe(targetDir);
    } finally {
      cleanup(sourceDir, targetDir);
    }
  });

  it('extraction workflow advances correctly when run folder path contains spaces', () => {
    const sourceDir = makeTempDirNamed(`mdko-xplat-source repo-${Date.now()}`);
    const targetDir = makeTempDirNamed(`mdko-xplat-target repo-${Date.now()}`);
    try {
      initWorkspace(targetDir);
      const meta = createRun({
        request: 'extract',
        mode: 'extraction',
        projectRoot: targetDir,
        sourceRepoRoot: sourceDir,
        targetRepoRoot: targetDir,
      });
      // Create first two artifacts
      fs.writeFileSync(path.join(meta.runFolder, 'artifacts/request-brief.txt'), 'done', 'utf8');
      fs.writeFileSync(
        path.join(meta.runFolder, 'artifacts/source-architecture-context-packet.txt'),
        'done',
        'utf8',
      );
      const next = getNextStage(meta);
      expect(next?.name).toBe('source-workflow-map');
    } finally {
      cleanup(sourceDir, targetDir);
    }
  });

  it('artifact statuses are correct when run folder path contains spaces', () => {
    const sourceDir = makeTempDirNamed(`mdko-xplat-source repo-${Date.now()}`);
    const targetDir = makeTempDirNamed(`mdko-xplat-target repo-${Date.now()}`);
    try {
      initWorkspace(targetDir);
      const meta = createRun({
        request: 'extract',
        mode: 'extraction',
        projectRoot: targetDir,
        sourceRepoRoot: sourceDir,
        targetRepoRoot: targetDir,
      });
      const statuses = getArtifactStatuses(meta);
      expect(statuses.length).toBe(15);
      expect(statuses.every((s) => !s.present)).toBe(true);
    } finally {
      cleanup(sourceDir, targetDir);
    }
  });
});

// ─── Non-extraction modes (no source/target needed) ──────────────────────────

describe('cross-platform: non-extraction modes need no source/target', () => {
  it.each<WorkflowMode>(['feature', 'repair', 'test', 'refactor', 'harden'])(
    '%s mode creates a run without sourceRepoRoot or targetRepoRoot',
    (mode) => {
      const tmp = makeTempDir();
      try {
        initWorkspace(tmp);
        const meta = createRun({ request: 'normal request', mode, projectRoot: tmp });
        expect(meta.sourceRepoRoot).toBeUndefined();
        expect(meta.targetRepoRoot).toBeUndefined();
        expect(meta.mode).toBe(mode);
      } finally {
        cleanup(tmp);
      }
    },
  );
});

// ─── CLI subprocess tests (require built dist/cli.js) ────────────────────────

const describeIfBuilt = CLI_BUILT ? describe : describe.skip;

describeIfBuilt('cross-platform: CLI relative path normalization', () => {
  it('--source and --target as relative paths are normalized to absolute in run metadata', () => {
    const parentDir = makeTempDir('mdko-xplat-rel-');
    const sourceDir = path.join(parentDir, 'source');
    const targetDir = path.join(parentDir, 'target');
    fs.mkdirSync(sourceDir);
    fs.mkdirSync(targetDir);
    try {
      // init from parentDir
      const initResult = runCLI(['init', '--root', targetDir], parentDir);
      expect(initResult.status).toBe(0);

      // start with relative paths from parentDir
      const startResult = runCLI(
        [
          'start',
          '--mode',
          'extraction',
          '--source',
          './source',
          '--target',
          './target',
          'Extract relative path test',
        ],
        parentDir,
      );
      expect(startResult.status).toBe(0);

      // find the run
      const runsDir = path.join(targetDir, '.my-dev-kit-orchestrator', 'runs');
      const runs = fs.readdirSync(runsDir);
      expect(runs.length).toBe(1);
      const runFolder = path.join(runsDir, runs[0]);
      const runMeta = JSON.parse(fs.readFileSync(path.join(runFolder, 'run.json'), 'utf8'));

      // paths must be absolute
      expect(path.isAbsolute(runMeta.sourceRepoRoot)).toBe(true);
      expect(path.isAbsolute(runMeta.targetRepoRoot)).toBe(true);

      // paths must point to the correct directories
      expect(path.normalize(runMeta.sourceRepoRoot)).toBe(path.normalize(sourceDir));
      expect(path.normalize(runMeta.targetRepoRoot)).toBe(path.normalize(targetDir));
    } finally {
      cleanup(parentDir);
    }
  });
});

describeIfBuilt('cross-platform: CLI error messages are stable', () => {
  it('missing --source produces a stable error message', () => {
    const tmp = makeTempDir();
    try {
      const result = runCLI(
        ['start', '--mode', 'extraction', '--target', tmp, 'Extract test'],
        tmp,
      );
      expect(result.status).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('--source');
      expect(output).toContain('required');
    } finally {
      cleanup(tmp);
    }
  });

  it('missing --target produces a stable error message', () => {
    const tmp = makeTempDir();
    try {
      const result = runCLI(
        ['start', '--mode', 'extraction', '--source', tmp, 'Extract test'],
        tmp,
      );
      expect(result.status).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('--target');
      expect(output).toContain('required');
    } finally {
      cleanup(tmp);
    }
  });

  it('non-extraction start without --source or --target succeeds', () => {
    const tmp = makeTempDir();
    try {
      runCLI(['init'], tmp);
      const result = runCLI(['start', '--mode', 'feature', 'Normal feature'], tmp);
      expect(result.status).toBe(0);
    } finally {
      cleanup(tmp);
    }
  });
});

describeIfBuilt('cross-platform: CLI with paths containing spaces', () => {
  it('start creates extraction run when source and target paths contain spaces', () => {
    const parentDir = makeTempDir('mdko-xplat-spaces-');
    const sourceDir = path.join(parentDir, 'source repo');
    const targetDir = path.join(parentDir, 'target repo');
    fs.mkdirSync(sourceDir);
    fs.mkdirSync(targetDir);
    try {
      runCLI(['init', '--root', targetDir], parentDir);
      const startResult = runCLI(
        [
          'start',
          '--mode',
          'extraction',
          '--source',
          sourceDir,
          '--target',
          targetDir,
          'Extract spaces test',
        ],
        targetDir,
      );
      expect(startResult.status).toBe(0);
      expect(startResult.stdout).toContain('extraction');

      // status should show source/target
      const statusResult = runCLI(['status', '--root', targetDir], targetDir);
      expect(statusResult.status).toBe(0);
      // check key substrings without assuming path separators
      expect(statusResult.stdout).toContain('extraction');
      expect(statusResult.stdout).toContain('source repo');
      expect(statusResult.stdout).toContain('target repo');
    } finally {
      cleanup(parentDir);
    }
  });
});
