import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createProgram } from '../program';
import { createRun } from '../run';
import { initWorkspace } from '../workspace';
import { readCheckResults } from '../promptChecker';
import { runCli } from '../../tests/cliTestHelpers';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-chk-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeArtifact(runFolder: string, artifactFile: string, content: string): void {
  const full = path.join(runFolder, artifactFile);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

// ─── CLI registration ─────────────────────────────────────────────────────────

describe('check command registration', () => {
  it('registers check command', () => {
    const program = createProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('check');
  });

  it('check command has --run option', () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === 'check')!;
    expect(cmd.options.map((o) => o.long)).toContain('--run');
  });

  it('check command has --root option', () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === 'check')!;
    expect(cmd.options.map((o) => o.long)).toContain('--root');
  });

  it('check command has --artifact option', () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === 'check')!;
    expect(cmd.options.map((o) => o.long)).toContain('--artifact');
  });

  it('check command has --prompts option', () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === 'check')!;
    expect(cmd.options.map((o) => o.long)).toContain('--prompts');
  });

  it('check command has --strict option', () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === 'check')!;
    expect(cmd.options.map((o) => o.long)).toContain('--strict');
  });
});

// ─── Check command behavior ───────────────────────────────────────────────────

describe('check command - artifact checking', () => {
  it('returns MISSING_FILE issues when artifacts do not exist', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test check command', mode: 'feature', projectRoot: tmp });

      const checkResults: string[] = [];
      const origLog = console.log;
      console.log = (msg: string) => checkResults.push(msg);
      const origExit = process.exit;
      process.exit = (() => { throw new Error('exit-0'); }) as never;

      try {
        createProgram().parse(['node', 'cli', 'check', '--root', tmp]);
      } catch (e) {
        if ((e as Error).message !== 'exit-0') throw e;
      } finally {
        console.log = origLog;
        process.exit = origExit;
      }

      const output = checkResults.join('\n');
      expect(output).toContain('Check results for run:');
      expect(output).toContain('[fail]');
    } finally {
      cleanup(tmp);
    }
  });

  it('passes when artifact has required sections', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test check pass', mode: 'feature', projectRoot: tmp });

      const wellFormedBrief =
        'Artifact: RequestBrief\n' +
        'Workflow mode: feature\n' +
        'Original request: test check pass\n' +
        'Requested change: add check command\n' +
        'Target area: CLI\n' +
        'User-visible or external behavior: visible\n' +
        'Constraints: none\n' +
        'Non-goals: nothing\n' +
        'Success criteria: passes\n' +
        'Ambiguity or missing information: none\n' +
        'Expected next stage: architecture-context\n' +
        'Status: complete\n';
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt', wellFormedBrief);

      const checkResults: string[] = [];
      const origLog = console.log;
      console.log = (msg: string) => checkResults.push(msg);
      const origExit = process.exit;
      process.exit = (() => { throw new Error('exit-0'); }) as never;

      try {
        createProgram().parse(['node', 'cli', 'check', '--artifact', 'request-brief', '--root', tmp]);
      } catch (e) {
        if ((e as Error).message !== 'exit-0') throw e;
      } finally {
        console.log = origLog;
        process.exit = origExit;
      }

      const output = checkResults.join('\n');
      expect(output).toContain('[pass]');
      expect(output).not.toContain('MISSING_SECTION');
    } finally {
      cleanup(tmp);
    }
  });

  it('fails when a required section is missing', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test missing section', mode: 'feature', projectRoot: tmp });

      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt',
        'Artifact: RequestBrief\nWorkflow mode: feature\nStatus: complete\n');

      const checkResults: string[] = [];
      const origLog = console.log;
      console.log = (msg: string) => checkResults.push(msg);
      let exitCode: number | undefined;
      const origExit = process.exit;
      process.exit = ((code?: number) => { exitCode = code; throw new Error('exit'); }) as never;

      try {
        createProgram().parse(['node', 'cli', 'check', '--artifact', 'request-brief', '--root', tmp]);
      } catch (e) {
        if ((e as Error).message !== 'exit') throw e;
      } finally {
        console.log = origLog;
        process.exit = origExit;
      }

      const output = checkResults.join('\n');
      expect(output).toContain('MISSING_SECTION');
      expect(exitCode).toBe(1);
    } finally {
      cleanup(tmp);
    }
  });

  it('resolves artifact by filename (basename)', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test artifact by filename', mode: 'feature', projectRoot: tmp });

      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt',
        'Artifact: RequestBrief\nWorkflow mode: feature\nOriginal request: test\n' +
        'Requested change: x\nTarget area: x\nUser-visible or external behavior: x\n' +
        'Constraints: x\nNon-goals: x\nSuccess criteria: x\n' +
        'Ambiguity or missing information: x\nExpected next stage: architecture-context\nStatus: complete\n');

      const checkResults: string[] = [];
      const origLog = console.log;
      console.log = (msg: string) => checkResults.push(msg);
      const origExit = process.exit;
      process.exit = (() => { throw new Error('exit-0'); }) as never;

      try {
        createProgram().parse(['node', 'cli', 'check', '--artifact', 'request-brief.txt', '--root', tmp]);
      } catch (e) {
        if ((e as Error).message !== 'exit-0') throw e;
      } finally {
        console.log = origLog;
        process.exit = origExit;
      }

      const output = checkResults.join('\n');
      expect(output).toContain('request-brief.txt');
    } finally {
      cleanup(tmp);
    }
  });
});

describe('check command - prompt checking', () => {
  it('check --prompts covers prompt files', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test prompt check', mode: 'feature', projectRoot: tmp });
      // createRun generates prompts, so they should exist and pass

      const checkResults: string[] = [];
      const origLog = console.log;
      console.log = (msg: string) => checkResults.push(msg);
      const origExit = process.exit;
      process.exit = (() => { throw new Error('exit-0'); }) as never;

      try {
        createProgram().parse(['node', 'cli', 'check', '--prompts', '--root', tmp]);
      } catch (e) {
        if ((e as Error).message !== 'exit-0') throw e;
      } finally {
        console.log = origLog;
        process.exit = origExit;
      }

      const output = checkResults.join('\n');
      expect(output).toContain('Prompts:');
    } finally {
      cleanup(tmp);
    }
  });
});

describe('check command - strict mode', () => {
  it('exits 1 with --strict when there are warnings', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test strict mode', mode: 'feature', projectRoot: tmp });

      // Write artifact with PLACEHOLDER content to trigger a warn
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt',
        'Artifact: RequestBrief\nWorkflow mode: feature\nOriginal request: test\n' +
        'Requested change: x\nTarget area: x\nUser-visible or external behavior: x\n' +
        'Constraints: x\nNon-goals: x\nSuccess criteria: x\n' +
        'Ambiguity or missing information: x\nExpected next stage: architecture-context\n' +
        'Status: complete [TODO confirm]\n');

      let exitCode: number | undefined;
      const origLog = console.log;
      console.log = () => {};
      const origExit = process.exit;
      process.exit = ((code?: number) => { exitCode = code; throw new Error('exit'); }) as never;

      try {
        createProgram().parse(['node', 'cli', 'check', '--artifact', 'request-brief', '--strict', '--root', tmp]);
      } catch {
        // expected
      } finally {
        console.log = origLog;
        process.exit = origExit;
      }

      expect(exitCode).toBe(1);
    } finally {
      cleanup(tmp);
    }
  });
});

describe('check command - persistence', () => {
  it('persists artifact-check-results.json when checking all', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test persistence', mode: 'feature', projectRoot: tmp });

      const origLog = console.log;
      console.log = () => {};
      const origExit = process.exit;
      process.exit = (() => { throw new Error('exit-0'); }) as never;

      try {
        createProgram().parse(['node', 'cli', 'check', '--root', tmp]);
      } catch (e) {
        if ((e as Error).message !== 'exit-0') throw e;
      } finally {
        console.log = origLog;
        process.exit = origExit;
      }

      const results = readCheckResults(meta.runFolder);
      expect(results).not.toBeNull();
      expect(results?.version).toBe('1');
      expect(results?.artifactResults.length).toBeGreaterThan(0);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Status command integration ───────────────────────────────────────────────

describe('status - content check integration', () => {
  it('shows "Content check: not run" when no check results exist', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test status no check', mode: 'feature', projectRoot: tmp });

      const statusLines: string[] = [];
      const origLog = console.log;
      console.log = (msg: string) => statusLines.push(msg);

      try {
        createProgram().parse(['node', 'cli', 'status', '--root', tmp]);
      } finally {
        console.log = origLog;
      }

      const output = statusLines.join('\n');
      expect(output).toContain('Content check: not run');
    } finally {
      cleanup(tmp);
    }
  });

  it('shows content check summary when artifact-check-results.json exists', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test status with check', mode: 'feature', projectRoot: tmp });

      // Run check first to create the results file
      const origLog = console.log;
      console.log = () => {};
      const origExit = process.exit;
      process.exit = (() => { throw new Error('exit-0'); }) as never;

      try {
        createProgram().parse(['node', 'cli', 'check', '--root', tmp]);
      } catch (e) {
        if ((e as Error).message !== 'exit-0') throw e;
      } finally {
        process.exit = origExit;
      }

      // Now check status
      const statusLines: string[] = [];
      console.log = (msg: string) => statusLines.push(msg);

      try {
        createProgram().parse(['node', 'cli', 'status', '--root', tmp]);
      } finally {
        console.log = origLog;
      }

      const output = statusLines.join('\n');
      expect(output).toContain('Content check:');
      expect(output).toContain('pass');
    } finally {
      cleanup(tmp);
    }
  });

  it('existing lifecycle status still works alongside check summary', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test lifecycle preserved', mode: 'feature', projectRoot: tmp });

      const statusLines: string[] = [];
      const origLog = console.log;
      console.log = (msg: string) => statusLines.push(msg);

      try {
        createProgram().parse(['node', 'cli', 'status', '--root', tmp]);
      } finally {
        console.log = origLog;
      }

      const output = statusLines.join('\n');
      expect(output).toContain('Artifacts:');
      expect(output).toContain('[missing');
      expect(output).toContain('Content check:');
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Backward compatibility ───────────────────────────────────────────────────

describe('backward compatibility', () => {
  it('existing runs without artifact-check-results.json still work with status', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test backward compat', mode: 'feature', projectRoot: tmp });

      // Ensure no check results file
      const statusLines: string[] = [];
      const origLog = console.log;
      console.log = (msg: string) => statusLines.push(msg);

      expect(() => {
        createProgram().parse(['node', 'cli', 'status', '--root', tmp]);
      }).not.toThrow();

      console.log = origLog;
    } finally {
      cleanup(tmp);
    }
  });
});


// ─── Run-aware trace resolution through the CLI surfaces (v1.6.2) ────────────

function runCheckCli(args: string[]): { output: string; exitCode: number | undefined } {
  let output = '';
  let exitCode: number | undefined;
  const origLog = console.log;
  console.log = (msg: string) => { output += msg + '\n'; };
  const origExit = process.exit;
  process.exit = ((code?: number) => {
    exitCode = code;
    throw new Error('exit-called');
  }) as never;
  try {
    createProgram().parse(['node', 'cli', ...args]);
  } catch (e) {
    if ((e as Error).message !== 'exit-called') throw e;
  } finally {
    console.log = origLog;
    process.exit = origExit;
  }
  return { output, exitCode };
}

function traceLines(output: string): string[] {
  return output
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes('TRACE_'));
}

describe('check --trace and --all - run-aware trace resolution', () => {
  it('accepts an upstream-declared target in both surfaces (T162-30)', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'run-aware trace ok', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt', 'REQ-001: original requirement\n');
      writeArtifact(meta.runFolder, 'artifacts/behavior-model.txt', 'BEH-001: behavior\nBEH-001 -> REQ-001\n');

      const trace = runCheckCli(['check', '--trace', '--root', tmp]);
      const all = runCheckCli(['check', '--all', '--root', tmp]);
      expect(trace.output).not.toContain('TRACE_MISSING_LINK_TARGET');
      expect(all.output).not.toContain('TRACE_MISSING_LINK_TARGET');
      expect(trace.exitCode).toBeUndefined();
      expect(traceLines(all.output)).toEqual(traceLines(trace.output));
    } finally {
      cleanup(tmp);
    }
  });

  it('reports genuinely missing and future-stage targets identically in both surfaces (T162-30)', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'run-aware trace missing', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt', 'REQ-001: requirement\n');
      writeArtifact(
        meta.runFolder,
        'artifacts/behavior-model.txt',
        'BEH-001: behavior\nBEH-001 -> REQ-001\nBEH-001 -> BEH-999\nBEH-001 -> IMP-001\n',
      );
      // IMP-001 is declared only in a later stage and must not satisfy the reference.
      writeArtifact(meta.runFolder, 'artifacts/implementation-report.txt', 'IMP-001: implementation\n');

      const trace = runCheckCli(['check', '--trace', '--root', tmp]);
      const all = runCheckCli(['check', '--all', '--root', tmp]);
      expect(trace.exitCode).toBe(1);
      expect(trace.output).toContain('BEH-999');
      expect(trace.output).toContain('IMP-001');
      expect(trace.output).not.toMatch(/Link target "REQ-001"/);
      expect(traceLines(trace.output).length).toBeGreaterThan(0);
      expect(traceLines(all.output)).toEqual(traceLines(trace.output));
    } finally {
      cleanup(tmp);
    }
  });

  it('keeps warning-only trace findings non-fatal unless --strict (T162-31)', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'run-aware trace warn', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/request-brief.txt', 'REQ-001: requirement\n');
      writeArtifact(
        meta.runFolder,
        'artifacts/behavior-model.txt',
        'BEH-001: behavior\nBEH-001: behavior again\nBEH-002: orphan\nBEH-001 -> REQ-001\n',
      );
      const normal = runCheckCli(['check', '--trace', '--root', tmp]);
      expect(normal.output).toContain('TRACE_DUPLICATE_ID');
      expect(normal.output).toContain('TRACE_ORPHAN_ID');
      expect(normal.output).not.toContain('TRACE_MISSING_LINK_TARGET');
      expect(normal.exitCode).toBeUndefined();
      const strict = runCheckCli(['check', '--trace', '--strict', '--root', tmp]);
      expect(strict.exitCode).toBe(1);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Mode-aware correction guidance through the CLI surfaces (v1.6.2) ────────

function suggestionLines(output: string): string[] {
  return output
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('Suggested correction'));
}

describe('check correction guidance - active-mode validation', () => {
  it('suggests the owning native stage and agrees across --trace and --all (T162-35, T162-52)', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'guidance malformed', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/behavior-model.txt', 'BEH-001: behavior\nREQ-01: bad id\n');
      const trace = runCheckCli(['check', '--trace', '--root', tmp]);
      const all = runCheckCli(['check', '--all', '--root', tmp]);
      expect(suggestionLines(trace.output)).toEqual([
        'Suggested correction stage: behavior-model  (TRACE_MALFORMED_ID)',
      ]);
      expect(suggestionLines(all.output)).toEqual(suggestionLines(trace.output));
      expect(trace.output).not.toContain('correction stage: design-map');
      expect(trace.exitCode).toBe(1);
    } finally {
      cleanup(tmp);
    }
  });

  it('gives artifact guidance for the optional design-map and keeps its checks (T162-45)', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'guidance design map', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/design-map.txt', 'REQ-001: requirement\nREQ-01: bad id\n');
      const dm = runCheckCli(['check', '--design-map', '--root', tmp]);
      expect(dm.output).toContain('TRACE_MALFORMED_ID');
      expect(suggestionLines(dm.output)).toEqual([
        'Suggested correction artifact: artifacts/design-map.txt  (TRACE_MALFORMED_ID)',
      ]);
      expect(dm.output).not.toMatch(/correction stage: design-map/);
      expect(dm.output).not.toMatch(/[A-Za-z]:\\/);
      expect(dm.exitCode).toBe(1);

      const all = runCheckCli(['check', '--all', '--root', tmp]);
      expect(suggestionLines(all.output)).toContain(
        'Suggested correction artifact: artifacts/design-map.txt  (TRACE_MALFORMED_ID)',
      );
      expect(all.output).not.toMatch(/correction stage: design-map/);
    } finally {
      cleanup(tmp);
    }
  });

  it('only suggests stages of a non-feature mode (T162-39)', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'guidance repair', mode: 'repair', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/behavior-trace.txt', 'BEH-001: step\nBEH-001 -> REQ-009\n');
      const { output } = runCheckCli(['check', '--trace', '--root', tmp]);
      expect(suggestionLines(output)).toEqual([
        'Suggested correction stage: behavior-trace  (TRACE_MISSING_LINK_TARGET)',
      ]);
      expect(output).not.toContain('request-brief');
    } finally {
      cleanup(tmp);
    }
  });

  it('is advisory only and mutates no run or artifact state (T162-54)', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'guidance noninterference', mode: 'feature', projectRoot: tmp });
      writeArtifact(meta.runFolder, 'artifacts/behavior-model.txt', 'BEH-001: behavior\nBEH-001 -> REQ-009\n');
      const snapshot = (): Record<string, string> => {
        const out: Record<string, string> = {};
        const walk = (d: string): void => {
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) walk(full);
            else out[path.relative(meta.runFolder, full)] = fs.readFileSync(full, 'utf8');
          }
        };
        walk(meta.runFolder);
        return out;
      };
      // Load-time lifecycle reconciliation (existing behavior) happens on any
      // command load; settle it first so only trace guidance is under test.
      runCheckCli(['status', '--root', tmp]);
      const before = snapshot();
      const { output } = runCheckCli(['check', '--trace', '--root', tmp]);
      expect(suggestionLines(output).length).toBeGreaterThan(0);
      const after = snapshot();
      const added = Object.keys(after).filter((k) => !(k in before));
      expect(added).toEqual(['trace-check-results.json']);
      for (const k of Object.keys(before)) expect(after[k]).toBe(before[k]);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Combined v1.7.0 failure-pattern regression (v1.6.2 T06/T21) ─────────────

describe('check --trace and --all - combined v1.7.0 failure pattern', () => {
  it('fails only on genuine structural trace problems and agrees across surfaces', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({
        request: 'Keep ECO-00 and UTF-8 verbatim; see CODE-REQ-01-suffix',
        mode: 'feature',
        projectRoot: tmp,
      });
      const files = ['artifacts/request-brief.txt', 'artifacts/behavior-model.txt'];
      writeArtifact(
        meta.runFolder,
        files[0],
        'REQ-001: requirement\nUses ECO-00, ECO-01, UTF-8 and SHA-256 verbatim.\n',
      );
      writeArtifact(
        meta.runFolder,
        files[1],
        [
          'BEH-001: behavior',
          'BEH-001 -> REQ-001',
          'BEH-001 -> REQ-999',
          'Technical id CODE-REQ-01-suffix and docs/REQ-002.md are not trace IDs.',
          'RSP-01: malformed responsibility',
        ].join('\n') + '\n',
      );
      runCheckCli(['status', '--root', tmp]);
      const read = (): string[] => files.map((f) => fs.readFileSync(path.join(meta.runFolder, f), 'utf8'));
      const sources = read();

      const trace = runCheckCli(['check', '--trace', '--root', tmp]);
      const all = runCheckCli(['check', '--all', '--root', tmp]);

      for (const out of [trace.output, all.output]) {
        expect(out).toContain('RSP-01');
        expect(out).toContain('REQ-999');
        expect(out).not.toContain('"ECO-00"');
        expect(out).not.toContain('"UTF-8"');
        expect(out).not.toContain('"REQ-01"');
        expect(out).not.toContain('"REQ-002"');
        expect(out).not.toMatch(/Link target "REQ-001"/);
        expect(out).not.toMatch(/correction stage: design-map/);
      }
      for (const line of suggestionLines(trace.output)) {
        expect(line).toMatch(/^Suggested correction (stage: (request-brief|behavior-model)|artifact: )/);
      }
      expect(trace.exitCode).toBe(1);
      expect(all.exitCode).toBe(1);
      expect(traceLines(all.output)).toEqual(traceLines(trace.output));
      expect(suggestionLines(all.output)).toEqual(suggestionLines(trace.output));
      expect(read()).toEqual(sources);
    } finally {
      cleanup(tmp);
    }
  });
});


describe('versioned JSON command branches', () => {
  let root: string;
  beforeEach(() => { root = makeTempDir(); initWorkspace(root); });
  afterEach(() => cleanup(root));
  function invoke(args: string[]) {
    const previous = process.exitCode;
    process.exitCode = 0;
    try {
      const result = runCli([...args, '--json', '--root', root]);
      const code = Number(process.exitCode);
      expect(result.output.endsWith('\n')).toBe(true);
      expect(result.output).not.toContain(String.fromCharCode(27) + '[');
      return { data: JSON.parse(result.output), code, output: result.output };
    } finally { process.exitCode = previous; }
  }
  it.each([
    [[], 'default', 'artifact-check-results.json'],
    [['--artifact', 'idea-brief'], 'single-artifact', null],
    [['--artifacts'], 'artifacts', null],
    [['--all'], 'all', 'trace-check-results.json'],
    [['--prompts'], 'prompts', null],
    [['--trace'], 'trace', 'trace-check-results.json'],
    [['--design-map'], 'design-map', null],
    [['--strict'], 'default', 'artifact-check-results.json'],
    [['--all', '--artifacts', '--trace'], 'artifacts', null],
    [['--prompts', '--artifact', 'idea-brief'], 'single-artifact', null],
  ] as Array<[string[], string, string | null]>)('executes %j as %s with original writes', (flags, selection, persisted) => {
    const meta = createRun({ mode: 'greenfield', projectRoot: root, request: 'SECRET-REQUEST' });
    fs.writeFileSync(path.join(meta.runFolder, 'ecosystem-evidence.json'), 'stray malformed');
    const before = fs.readdirSync(meta.runFolder).sort();
    const status = invoke(['status', '--run', meta.runId]);
    expect(Object.keys(status.data)).toEqual(['schemaVersion', 'run', 'ecosystem', 'integrity', 'judge']);
    expect(status.data.ecosystem).toEqual({ required: false, classification: 'not-required', requirements: [], blockers: [], warnings: [] });
    expect(fs.readdirSync(meta.runFolder).sort()).toEqual(before);
    const result = invoke(['check', '--run', meta.runId, ...flags]);
    expect(result.data.checks.selection).toBe(selection);
    expect(result.data.checks.exitCode).toBe(result.code);
    expect(Object.keys(result.data)).toEqual(['schemaVersion', 'run', 'ecosystem', 'integrity', 'judge', 'checks']);
    expect(result.data.ecosystem).toEqual(status.data.ecosystem);
    expect(result.data.integrity).toEqual(status.data.integrity);
    expect(result.data.judge).toEqual(status.data.judge);
    expect(result.output).not.toContain(root);
    expect(result.output).not.toContain('SECRET-REQUEST');
    const added = fs.readdirSync(meta.runFolder).filter(f => !before.includes(f));
    expect(added).toEqual(persisted ? [persisted] : []);
    if (persisted) expect(JSON.parse(fs.readFileSync(path.join(meta.runFolder, persisted), 'utf8')).version).toBe('1');
    if (selection === 'trace') expect(result.data.checks).toMatchObject({ outcome: 'passed', issueCounts: { fail: 0, warn: 0 }, exitCode: 0 });
    if (selection === 'single-artifact' || selection === 'design-map') expect(result.data.checks.issueCounts.fail).toBeGreaterThan(0);
  });
  it('uses current prompt diagnostics and distinguishes strict warnings from native failures', () => {
    const meta = createRun({ mode: 'greenfield', projectRoot: root, request: 'prompt diagnostics' });
    const prompt = path.join(meta.runFolder, meta.stages[0].promptFile);
    fs.writeFileSync(prompt, 'Stage: idea-brief\nTask: '+ 'a'.repeat(100));
    const normal = invoke(['check', '--run', meta.runId, '--prompts']);
    const strict = invoke(['check', '--run', meta.runId, '--prompts', '--strict']);
    expect(normal.data.checks).toMatchObject({ outcome: 'warning', exitCode: 0 });
    expect(strict.data.checks).toMatchObject({ outcome: 'warning', exitCode: 1 });
    expect(strict.data.checks.issueCounts).toEqual(normal.data.checks.issueCounts);
    fs.writeFileSync(prompt, '');
    const failed = invoke(['check', '--run', meta.runId, '--prompts']);
    expect(failed.data.checks.outcome).toBe('failed');
    expect(failed.data.checks.issueCounts.fail).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(meta.runFolder, 'artifact-check-results.json'))).toBe(false);
  });
  it.each(['status', 'check'])('emits sanitized %s selection/load errors', command => {
    const empty = invoke([command]);
    expect(empty.data).toEqual({ schemaVersion: '1.0.0', error: { code: 'INSPECTION_NO_RUNS_FOUND' } });
    expect(empty.code).toBe(command === 'status' ? 0 : 1);
    const missing = invoke([command, '--run', 'private-missing']);
    expect(missing.data).toEqual({ schemaVersion: '1.0.0', error: { code: 'INSPECTION_RUN_NOT_FOUND' } });
    expect(missing.code).toBe(1);
    const meta = createRun({ mode: 'greenfield', projectRoot: root, request: 'unreadable' });
    fs.writeFileSync(path.join(meta.runFolder, 'run.json'), '{SECRET-invalid');
    const unreadable = invoke([command, '--run', meta.runId]);
    expect(unreadable.data).toEqual({ schemaVersion: '1.0.0', error: { code: 'INSPECTION_RUN_UNREADABLE' } });
    expect(unreadable.code).toBe(1);
    expect(unreadable.output).not.toContain('SECRET');
  });
  it('rejects only the effective invalid artifact selector', () => {
    const meta = createRun({ mode: 'greenfield', projectRoot: root, request: 'invalid selector' });
    const invalid = invoke(['check', '--run', meta.runId, '--artifact', 'bad-secret']);
    expect(invalid.data).toEqual({ schemaVersion: '1.0.0', error: { code: 'INSPECTION_CHECK_INVALID_SELECTION' } });
    expect(invalid.code).toBe(1);
    expect(invoke(['check', '--run', meta.runId, '--trace', '--artifact', 'bad-secret']).data.checks.selection).toBe('trace');
  });
  it('retains known native failure counts when telemetry warnings have no comparable count', () => {
    const meta = createRun({ mode: 'greenfield', projectRoot: root, request: 'telemetry counts', runTelemetryVersion: 'unsupported' });
    const result = invoke(['check', '--run', meta.runId]);
    expect(result.data.checks.issueCounts.fail).toBeGreaterThan(0);
    expect(result.data.checks.issueCounts.warn).toBeNull();
    expect(result.data.checks.exitCode).toBe(result.code);
    expect(fs.existsSync(path.join(meta.runFolder, 'inspection.json'))).toBe(false);
  });
});
