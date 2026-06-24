import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createProgram } from '../program';
import { createRun } from '../run';
import { initWorkspace } from '../workspace';
import { readTraceCheckResults } from '../traceChecker';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-v050-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeArtifact(runFolder: string, artifactFile: string, content: string): void {
  const full = path.join(runFolder, artifactFile);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function runCli(
  args: string[],
): { output: string; exitCode: number | undefined } {
  let output = '';
  let exitCode: number | undefined;
  const origLog = console.log;
  console.log = (msg: string) => { output += msg + '\n'; };
  const origExit = process.exit;
  process.exit = ((code?: number) => {
    exitCode = code;
    throw new Error('exit');
  }) as never;
  try {
    createProgram().parse(['node', 'cli', ...args]);
  } catch (e) {
    if ((e as Error).message !== 'exit') throw e;
  } finally {
    console.log = origLog;
    process.exit = origExit;
  }
  return { output, exitCode };
}

// ─── check --trace: no artifacts ─────────────────────────────────────────────

describe('v0.5.0 integration — check --trace with no artifacts', () => {
  it('shows trace check results with no issues when no artifacts exist', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'trace integration test', mode: 'feature', projectRoot: tmp });
      const { output } = runCli(['check', '--trace', '--root', tmp]);
      expect(output).toContain('Trace check results for run:');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── check --trace: detects missing link target ───────────────────────────────

describe('v0.5.0 integration — check --trace detects missing link target', () => {
  it('fails with TRACE_MISSING_LINK_TARGET when a link target is not declared', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'trace missing target test', mode: 'feature', projectRoot: tmp });
      writeArtifact(
        meta.runFolder,
        'artifacts/behavior-model.txt',
        'REQ-001: requirement one\nREQ-001 -> BEH-999',
      );
      const { output, exitCode } = runCli(['check', '--trace', '--root', tmp]);
      expect(output).toContain('TRACE_MISSING_LINK_TARGET');
      expect(output).toContain('BEH-999');
      expect(exitCode).toBe(1);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── check --trace: passes for well-formed artifact ──────────────────────────

describe('v0.5.0 integration — check --trace passes for well-formed artifact', () => {
  it('exits 0 for artifact with correctly declared and linked IDs', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'trace pass test', mode: 'feature', projectRoot: tmp });
      const content = [
        'REQ-001: system requirement',
        'BEH-001: observable behavior',
        'REQ-001 -> BEH-001',
      ].join('\n');
      writeArtifact(meta.runFolder, 'artifacts/behavior-model.txt', content);
      const { output, exitCode } = runCli(['check', '--trace', '--root', tmp]);
      expect(output).toContain('Trace check results for run:');
      expect(exitCode).toBeUndefined();
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── check --trace: detects malformed IDs ────────────────────────────────────

describe('v0.5.0 integration — check --trace detects malformed IDs', () => {
  it('fails with TRACE_MALFORMED_ID for near-miss tokens', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'trace malformed test', mode: 'feature', projectRoot: tmp });
      writeArtifact(
        meta.runFolder,
        'artifacts/behavior-model.txt',
        'BEH001 should have been BEH-001.\n',
      );
      const { output, exitCode } = runCli(['check', '--trace', '--root', tmp]);
      expect(output).toContain('TRACE_MALFORMED_ID');
      expect(exitCode).toBe(1);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── check --trace: warns for orphan IDs ─────────────────────────────────────

describe('v0.5.0 integration — check --trace warns for orphan IDs', () => {
  it('reports TRACE_ORPHAN_ID as warn', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'trace orphan test', mode: 'feature', projectRoot: tmp });
      const content = [
        'BEH-001: linked behavior',
        'BEH-002: orphan behavior',
        'REQ-001 -> BEH-001',
      ].join('\n');
      writeArtifact(meta.runFolder, 'artifacts/behavior-model.txt', content);
      const { output } = runCli(['check', '--trace', '--root', tmp]);
      expect(output).toContain('TRACE_ORPHAN_ID');
      expect(output).toContain('BEH-002');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── check --strict --trace: promotes warn to fail ───────────────────────────

describe('v0.5.0 integration — check --strict --trace', () => {
  it('exits 1 when any warn present with --strict', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'trace strict test', mode: 'feature', projectRoot: tmp });
      // Artifact with duplicate ID (warn) but no fail
      const content = 'BEH-001: declared once\nBEH-001: declared twice\n';
      writeArtifact(meta.runFolder, 'artifacts/behavior-model.txt', content);
      const { output, exitCode } = runCli(['check', '--strict', '--trace', '--root', tmp]);
      expect(output).toContain('TRACE_DUPLICATE_ID');
      expect(exitCode).toBe(1);
    } finally {
      cleanup(tmp);
    }
  });

  it('exits 0 when no issues present with --strict', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'trace strict clean test', mode: 'feature', projectRoot: tmp });
      const { exitCode } = runCli(['check', '--strict', '--trace', '--root', tmp]);
      expect(exitCode).toBeUndefined();
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── check --trace: persists results ─────────────────────────────────────────

describe('v0.5.0 integration — check --trace persists trace-check-results.json', () => {
  it('creates trace-check-results.json after running --trace', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'trace persist test', mode: 'feature', projectRoot: tmp });
      runCli(['check', '--trace', '--root', tmp]);
      const results = readTraceCheckResults(meta.runFolder);
      expect(results).not.toBeNull();
      expect(results?.version).toBe('1');
      expect(results?.traceResults.length).toBeGreaterThan(0);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── check --design-map: missing file ────────────────────────────────────────

describe('v0.5.0 integration — check --design-map missing file', () => {
  it('shows MISSING_FILE for design-map when it does not exist', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'design-map missing test', mode: 'feature', projectRoot: tmp });
      const { output, exitCode } = runCli(['check', '--design-map', '--root', tmp]);
      expect(output).toContain('Design map check for run:');
      expect(output).toContain('MISSING_FILE');
      expect(exitCode).toBe(1);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── check --design-map: section and trace checks ────────────────────────────

describe('v0.5.0 integration — check --design-map with well-formed design-map', () => {
  it('shows both artifact and trace sections in output', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'design-map check test', mode: 'feature', projectRoot: tmp });
      const content = [
        'Artifact: DesignMap',
        'DesignMap: 20260624T060848-implement-v0-5-0-trace-model-t',
        'Workflow mode: feature',
        'Inputs used: behavior-model.txt',
        'Trace ID registry: REQ-001, BEH-001',
        'Requirement links: REQ-001 -> BEH-001',
        'Context links: none',
        'Behavior links: BEH-001',
        'Invariant links: none',
        'Transition links: none',
        'Pseudocode links: none',
        'Test responsibility links: none',
        'Implementation links: none',
        'Verification links: none',
        'Risk links: none',
        'Orphan or missing links: none',
        'Trace gaps: none',
        'Status: complete',
        'REQ-001: first requirement',
        'BEH-001: first behavior',
        'REQ-001 -> BEH-001',
      ].join('\n');
      writeArtifact(meta.runFolder, 'artifacts/design-map.txt', content);
      const { output } = runCli(['check', '--design-map', '--root', tmp]);
      expect(output).toContain('Artifact check:');
      expect(output).toContain('Trace check:');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── status shows trace check summary ────────────────────────────────────────

describe('v0.5.0 integration — status shows trace check summary', () => {
  it('shows "Trace check: not run" before check --trace', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'status trace test', mode: 'feature', projectRoot: tmp });
      let output = '';
      const origLog = console.log;
      console.log = (msg: string) => { output += msg + '\n'; };
      try {
        createProgram().parse(['node', 'cli', 'status', '--root', tmp]);
      } finally {
        console.log = origLog;
      }
      expect(output).toContain('Trace check: not run');
    } finally {
      cleanup(tmp);
    }
  });

  it('shows trace check summary after check --trace', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'status trace summary test', mode: 'feature', projectRoot: tmp });
      runCli(['check', '--trace', '--root', tmp]);

      let statusOutput = '';
      const origLog = console.log;
      console.log = (msg: string) => { statusOutput += msg + '\n'; };
      try {
        createProgram().parse(['node', 'cli', 'status', '--root', tmp]);
      } finally {
        console.log = origLog;
      }
      expect(statusOutput).toContain('Trace check:');
      expect(statusOutput).toContain('my-dev-kit-orchestrator check --trace');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── v0.4.0 regression: check without --trace still works ────────────────────

describe('v0.5.0 regression — check without --trace unaffected', () => {
  it('check command without --trace still shows artifact/prompt results', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'regression test', mode: 'feature', projectRoot: tmp });
      const { output } = runCli(['check', '--root', tmp]);
      expect(output).toContain('Check results for run:');
      expect(output).toContain('MISSING_FILE');
    } finally {
      cleanup(tmp);
    }
  });
});
