import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { makeReadyRunFolder } from './readyContextTestHelpers';
import { runCli } from './cliTestHelpers';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-export-ctx-'));
}

function advanceToImplementation(meta: ReturnType<typeof createRun>): void {
  for (const stage of meta.stages) {
    if (stage.name === 'implementation') break;
    fs.writeFileSync(path.join(meta.runFolder, stage.artifactFile), 'complete', 'utf8');
  }
}

describe('export command: repository context readiness summary', () => {
  it('reports future context as not required at a pre-owner stage', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const { output } = runCli(['export', '--root', tmp]);
      expect(output).toContain('=== Repository context readiness ===');
      expect(output).toContain('Current stage: request-brief');
      expect(output).toContain('overallDecision: not-required');
      expect(output).not.toContain('implementationContext:');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('includes a ready summary once context is populated', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      advanceToImplementation(meta);
      makeReadyRunFolder(meta.runFolder, 'feature');
      const { output } = runCli(['export', '--root', tmp]);
      expect(output).toContain('overallDecision: ready');
      expect(output).not.toContain('primaryContextKind:');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('export still succeeds (exits 0) even when context is not ready', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const { exitCode } = runCli(['export', '--root', tmp]);
      expect(exitCode).toBeUndefined();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('does not embed raw supplemental packet/report text', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const { output } = runCli(['export', '--root', tmp]);
      expect(output).not.toContain('## Focus');
      expect(output).not.toContain('Not populated.');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('preserves all existing export sections', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const { output } = runCli(['export', '--root', tmp]);
      for (const section of [
        'Run identity',
        'Request',
        'Artifact checklist',
        'Missing artifacts',
        'Judge verdict',
        'Correction state',
        'Verification evidence',
        'Check summaries',
        'Next command',
      ]) {
        expect(output).toContain(`=== ${section} ===`);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('greenfield export reports not-required', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'a new app', mode: 'greenfield', projectRoot: tmp });
      const { output } = runCli(['export', '--root', tmp]);
      expect(output).toContain('overallDecision: not-required');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
