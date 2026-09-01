import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { makeReadyRunFolder } from './readyContextTestHelpers';
import { runCli } from './cliTestHelpers';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-check-ctx-'));
}

function advanceToImplementation(meta: ReturnType<typeof createRun>): void {
  for (const stage of meta.stages) {
    if (stage.name === 'implementation') break;
    fs.writeFileSync(path.join(meta.runFolder, stage.artifactFile), 'complete', 'utf8');
  }
}

describe('check command: repository context readiness', () => {
  it('does not block a fresh pre-owner run on future context', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const { output, exitCode } = runCli(['check', '--root', tmp]);
      expect(output).toContain('=== Repository context readiness ===');
      expect(output).toContain('not required for this mode');
      expect(output).not.toContain('implementation context: template');
      expect(exitCode).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('fails with classification "missing" when context files are deleted entirely', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      advanceToImplementation(meta);
      fs.rmSync(path.join(meta.runFolder, 'artifacts', 'implementation-context-packet.txt'));
      fs.rmSync(path.join(meta.runFolder, 'reports', 'implementation-context-retrieval-report.txt'));
      const { output, exitCode } = runCli(['check', '--root', tmp]);
      expect(output).toContain('[fail] implementation context: missing');
      expect(exitCode).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('passes the context section (but overall command may still fail on other checks) when context is ready', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      advanceToImplementation(meta);
      makeReadyRunFolder(meta.runFolder, 'feature');
      const { output } = runCli(['check', '--root', tmp]);
      expect(output).toContain('[pass] implementation context: ready');
      expect(output).not.toContain('[fail] implementation context:');
      expect(output).not.toContain('Primary blocker:');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('check --all does not invent a future context issue at a pre-owner stage', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const { output } = runCli(['check', '--all', '--root', tmp]);
      expect(output).toContain('not required for this mode');
      expect(output).not.toContain('implementation context: template');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('check --all fails when required context is missing', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const { exitCode } = runCli(['check', '--all', '--root', tmp]);
      expect(exitCode).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('greenfield check treats context as not required and does not fail on it', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'a new app', mode: 'greenfield', projectRoot: tmp });
      const { output } = runCli(['check', '--root', tmp]);
      expect(output).toContain('not required for this mode');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('is read-only: does not mark a stage blocked or write artifact-state.json', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const stateBefore = fs.existsSync(path.join(meta.runFolder, 'artifact-state.json'))
        ? fs.readFileSync(path.join(meta.runFolder, 'artifact-state.json'), 'utf8')
        : undefined;
      runCli(['check', '--root', tmp]);
      const stateAfter = fs.existsSync(path.join(meta.runFolder, 'artifact-state.json'))
        ? fs.readFileSync(path.join(meta.runFolder, 'artifact-state.json'), 'utf8')
        : undefined;
      expect(stateAfter).toBe(stateBefore);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('--artifact and --prompts narrow modes are unaffected by the context readiness check', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const { output } = runCli(['check', '--prompts', '--root', tmp]);
      expect(output).not.toContain('Repository context readiness');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
