import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createProgram } from '../../src/program';
import { initWorkspace } from '../../src/workspace';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-greenfield-cli-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function runCliCaptured(args: string[]): { output: string; exitCode: number | undefined } {
  const lines: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  const origWrite = process.stdout.write.bind(process.stdout);
  const origExit = process.exit;
  let exitCode: number | undefined;
  console.log = (msg: string) => lines.push(msg);
  console.error = (msg: string) => lines.push(msg);
  process.stdout.write = ((chunk: string) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.exit = ((code?: number) => {
    exitCode = code;
    throw new Error('mdko-test-exit');
  }) as never;

  try {
    createProgram().parse(['node', 'cli', ...args]);
  } catch (e) {
    if ((e as Error).message !== 'mdko-test-exit') throw e;
  } finally {
    console.log = origLog;
    console.error = origErr;
    process.stdout.write = origWrite;
    process.exit = origExit;
  }

  return { output: lines.join('\n'), exitCode };
}

describe('greenfield CLI regression (full command surface)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTempDir();
    initWorkspace(tmp);
  });

  afterEach(() => {
    cleanup(tmp);
  });

  it('start --mode greenfield succeeds', () => {
    const { output, exitCode } = runCliCaptured([
      'start',
      '--mode',
      'greenfield',
      '--root',
      tmp,
      'Create a sample TypeScript CLI app',
    ]);
    expect(exitCode).toBeUndefined();
    expect(output).toContain('Created workflow run:');
    expect(output).toContain('greenfield');
  });

  it('prompt succeeds for the most recent greenfield run', () => {
    runCliCaptured(['start', '--mode', 'greenfield', '--root', tmp, 'Create a sample TypeScript CLI app']);
    const { output, exitCode } = runCliCaptured(['prompt', '--root', tmp]);
    expect(exitCode).toBeUndefined();
    expect(output).toContain('Stage: idea-brief');
    expect(output).toContain('Workflow mode: greenfield');
  });

  it('status succeeds for the most recent greenfield run', () => {
    runCliCaptured(['start', '--mode', 'greenfield', '--root', tmp, 'Create a sample TypeScript CLI app']);
    const { output, exitCode } = runCliCaptured(['status', '--root', tmp]);
    expect(exitCode).toBeUndefined();
    expect(output).toContain('greenfield');
    expect(output).toContain('idea-brief');
    expect(output).toContain('Present artifacts: 0/13');
  });

  it('list succeeds and includes the greenfield run', () => {
    runCliCaptured(['start', '--mode', 'greenfield', '--root', tmp, 'Create a sample TypeScript CLI app']);
    const { output, exitCode } = runCliCaptured(['list', '--root', tmp]);
    expect(exitCode).toBeUndefined();
    expect(output).toContain('Mode:         greenfield');
    expect(output).toContain('Total: 1 run(s)');
  });

  it('list --mode greenfield filters correctly alongside another mode', () => {
    runCliCaptured(['start', '--mode', 'greenfield', '--root', tmp, 'Create a sample TypeScript CLI app']);
    runCliCaptured(['start', '--mode', 'feature', '--root', tmp, 'Add a sample feature']);
    const { output } = runCliCaptured(['list', '--root', tmp, '--mode', 'greenfield']);
    expect(output).toContain('Mode:         greenfield');
    expect(output).not.toContain('Mode:         feature');
    expect(output).toContain('Total: 1 run(s)');
  });

  it('check --artifacts succeeds for the most recent greenfield run', () => {
    runCliCaptured(['start', '--mode', 'greenfield', '--root', tmp, 'Create a sample TypeScript CLI app']);
    const { output, exitCode } = runCliCaptured(['check', '--artifacts', '--root', tmp]);
    expect(output).toContain('Artifact contract check for run:');
    // All 13 artifacts missing -> fail exit code, matching current check semantics for a fresh run.
    expect(exitCode).toBe(1);
  });

  it('check --all succeeds (runs to completion) for the most recent greenfield run', () => {
    runCliCaptured(['start', '--mode', 'greenfield', '--root', tmp, 'Create a sample TypeScript CLI app']);
    const { output } = runCliCaptured(['check', '--all', '--root', tmp]);
    expect(output).toContain('Full check for run:');
    expect(output).toContain('=== Summary ===');
  });

  it('export succeeds for the most recent greenfield run', () => {
    runCliCaptured(['start', '--mode', 'greenfield', '--root', tmp, 'Create a sample TypeScript CLI app']);
    const { output, exitCode } = runCliCaptured(['export', '--root', tmp]);
    expect(exitCode).toBeUndefined();
    expect(output).toContain('Mode:         greenfield');
    expect(output).toContain('run handoff export');
  });

  it('full greenfield CLI sequence (start -> prompt -> status -> list -> check --artifacts -> check --all -> export) runs without crashing', () => {
    const startRes = runCliCaptured(['start', '--mode', 'greenfield', '--root', tmp, 'Create a sample TypeScript CLI app']);
    expect(startRes.output).toContain('Created workflow run:');

    const promptRes = runCliCaptured(['prompt', '--root', tmp]);
    expect(promptRes.output).toContain('Stage: idea-brief');

    const statusRes = runCliCaptured(['status', '--root', tmp]);
    expect(statusRes.output).toContain('greenfield');

    const listRes = runCliCaptured(['list', '--root', tmp]);
    expect(listRes.output).toContain('greenfield');

    const checkArtifactsRes = runCliCaptured(['check', '--artifacts', '--root', tmp]);
    expect(checkArtifactsRes.output).toContain('Artifact contract check for run:');

    const checkAllRes = runCliCaptured(['check', '--all', '--root', tmp]);
    expect(checkAllRes.output).toContain('Full check for run:');

    const exportRes = runCliCaptured(['export', '--root', tmp]);
    expect(exportRes.output).toContain('Mode:         greenfield');
  });
});

describe('greenfield CLI regression does not break other modes', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTempDir();
    initWorkspace(tmp);
  });

  afterEach(() => {
    cleanup(tmp);
  });

  it.each(['feature', 'repair', 'test', 'refactor', 'harden'] as const)(
    '%s mode still works end-to-end through start/prompt/status/list',
    (mode) => {
      const startRes = runCliCaptured(['start', '--mode', mode, '--root', tmp, `Test ${mode} regression`]);
      expect(startRes.output).toContain('Created workflow run:');

      const promptRes = runCliCaptured(['prompt', '--root', tmp]);
      expect(promptRes.exitCode).toBeUndefined();

      const statusRes = runCliCaptured(['status', '--root', tmp]);
      expect(statusRes.output).toContain(mode);

      const listRes = runCliCaptured(['list', '--root', tmp]);
      expect(listRes.output).toContain(`Mode:         ${mode}`);
    },
  );
});
