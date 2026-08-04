import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { createProgram } from '../src/program';
import { createRun } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { runCli } from './cliTestHelpers';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-cli-regression-'));
}

// Recursively hashes every file's relative path + content under a directory,
// producing one deterministic digest -- used to prove a command mutated
// nothing under the run folder (Batch 6 section 23.1/23.4).
function hashTree(dir: string): string {
  const hash = crypto.createHash('sha256');
  if (!fs.existsSync(dir)) return hash.digest('hex');
  const entries: string[] = [];
  const walk = (d: string, prefix: string) => {
    for (const name of fs.readdirSync(d).sort()) {
      const full = path.join(d, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full, rel);
      } else {
        entries.push(`${rel}:${fs.readFileSync(full).toString('base64')}`);
      }
    }
  };
  walk(dir, '');
  hash.update(entries.sort().join('\n'));
  return hash.digest('hex');
}

describe('v1.2.1 CLI command surface', () => {
  it('exposes exactly the approved command set', () => {
    const program = createProgram();
    const names = program.commands.map((c) => c.name()).sort();
    expect(names).toEqual(['check', 'export', 'init', 'list', 'mark', 'prompt', 'start', 'status'].sort());
  });

  it('--version reports 1.3.0', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../package.json');
    expect(pkg.version).toBe('1.3.0');
  });

  it('no context-specific command or automatic-retrieval option was added to any command', () => {
    const program = createProgram();
    for (const cmd of program.commands) {
      const longFlags = cmd.options.map((o) => o.long ?? '');
      expect(longFlags.some((f) => /context|retriev/i.test(f))).toBe(false);
    }
  });
});

describe('v1.2.1 CLI invalid-input regression', () => {
  it('unknown command fails deterministically', () => {
    const { exitCode } = runCli(['not-a-real-command']);
    expect(exitCode).not.toBe(0);
  });

  it('list rejects an unknown mode', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const { output, exitCode } = runCli(['list', '--mode', 'not-a-real-mode', '--root', tmp]);
      expect(output).toContain('invalid mode');
      expect(exitCode).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('status with an unknown run ID fails deterministically', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const { output, exitCode } = runCli(['status', '--run', 'does-not-exist', '--root', tmp]);
      expect(output).toContain('not found');
      expect(exitCode).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('prompt for an unknown stage fails deterministically', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const { exitCode } = runCli(['prompt', 'not-a-real-stage', '--root', tmp]);
      expect(exitCode).not.toBe(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('check --artifact with an unknown artifact name fails deterministically', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const { output, exitCode } = runCli(['check', '--artifact', 'not-a-real-artifact', '--root', tmp]);
      expect(output).toContain('not found');
      expect(exitCode).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('v1.2.1 CLI read-only immutability', () => {
  it.each(['status', 'prompt', 'list'])('%s does not mutate the run tree', (command) => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const before = hashTree(meta.runFolder);
      runCli([command, '--root', tmp]);
      const after = hashTree(meta.runFolder);
      expect(after).toBe(before);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('check (default mode) does not mutate the run tree beyond its own check-results persistence', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const beforeFiles = new Set(fs.readdirSync(path.join(meta.runFolder, 'artifacts')));
      runCli(['check', '--root', tmp]);
      const afterFiles = new Set(fs.readdirSync(path.join(meta.runFolder, 'artifacts')));
      // check may persist its own check-results.json, but must not create or
      // remove any artifact/context file.
      expect(afterFiles).toEqual(beforeFiles);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('export to stdout does not mutate the run tree', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const before = hashTree(meta.runFolder);
      runCli(['export', '--root', tmp]);
      const after = hashTree(meta.runFolder);
      expect(after).toBe(before);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
