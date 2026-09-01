import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { makeReadyRunFolder } from './readyContextTestHelpers';
import { runCli } from './cliTestHelpers';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-status-ctx-'));
}

function advanceToImplementation(meta: ReturnType<typeof createRun>): void {
  for (const stage of meta.stages) {
    if (stage.name === 'implementation') break;
    fs.writeFileSync(path.join(meta.runFolder, stage.artifactFile), 'complete', 'utf8');
  }
}

describe('status command: repository context readiness', () => {
  it('reports future context as not required for a fresh feature run', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const { output } = runCli(['status', '--root', tmp]);
      expect(output).toContain('Current / next stage:\n  request-brief');
      expect(output).toContain('Repository context: not required');
      expect(output).not.toContain('Repository context readiness: refresh-required');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports ready once context is populated', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      advanceToImplementation(meta);
      makeReadyRunFolder(meta.runFolder, 'feature');
      const { output } = runCli(['status', '--root', tmp]);
      expect(output).toContain('Repository context readiness: ready');
      expect(output).not.toContain('Primary blocker:');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports "not required" for greenfield', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'a new app', mode: 'greenfield', projectRoot: tmp });
      const { output } = runCli(['status', '--root', tmp]);
      expect(output).toContain('Repository context: not required');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('is read-only: does not modify run.json or create context files', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const runJsonBefore = fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8');
      const packetBefore = fs.readFileSync(path.join(meta.runFolder, 'artifacts', 'implementation-context-packet.txt'), 'utf8');
      runCli(['status', '--root', tmp]);
      const runJsonAfter = fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8');
      const packetAfter = fs.readFileSync(path.join(meta.runFolder, 'artifacts', 'implementation-context-packet.txt'), 'utf8');
      expect(runJsonAfter).toBe(runJsonBefore);
      expect(packetAfter).toBe(packetBefore);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
