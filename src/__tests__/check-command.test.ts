import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createProgram } from '../program';
import { createRun } from '../run';
import { initWorkspace } from '../workspace';
import { readCheckResults } from '../promptChecker';

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

describe('check command — artifact checking', () => {
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

describe('check command — prompt checking', () => {
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

describe('check command — strict mode', () => {
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

describe('check command — persistence', () => {
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

describe('status — content check integration', () => {
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
