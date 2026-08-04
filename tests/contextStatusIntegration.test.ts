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

describe('status command: repository context readiness', () => {
  it('reports missing context for a fresh feature run', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const { output } = runCli(['status', '--root', tmp]);
      expect(output).toContain('Repository context readiness: refresh-required');
      expect(output).toContain('Implementation context: refresh-required');
      expect(output).toContain('Test context: refresh-required');
      expect(output).toContain('Primary blocker: CONTEXT_PACKET_TEMPLATE');
      expect(output).toContain('Reason:');
      expect(output).toContain('Blocking: CONTEXT_PACKET_TEMPLATE, CONTEXT_REPORT_TEMPLATE');
      expect(output).toContain('Corrective action:');
      expect(output).toContain('Evidence target:');
      expect(output).toContain('Recommended next stage: implementation');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports ready once context is populated', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
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
