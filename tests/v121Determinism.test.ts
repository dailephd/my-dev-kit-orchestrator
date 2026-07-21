import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { runCli } from './cliTestHelpers';
import { makeReadyRunFolder } from './readyContextTestHelpers';
import { evaluateRunContextReadiness } from '../src/instructions/runContextReadiness';
import { buildCompatibilityManifest } from './compatibilityManifestLib';

// Batch 6 section 25: repeated operations with unchanged input must produce
// byte-identical (or deeply equal, where the value is structural rather than
// text) output. Many individual operations already have dedicated
// determinism assertions elsewhere (catalog/packet/template/prompt-hash
// tests); this file focuses on the higher-level, cross-cutting outputs that
// compose them: status, check, export, and run-level readiness aggregation.

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-determinism-'));
}

describe('v1.2.1 determinism gate', () => {
  it('status output is byte-identical across repeated invocations for an unchanged run', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const first = runCli(['status', '--root', tmp]);
      const second = runCli(['status', '--root', tmp]);
      expect(second.output).toBe(first.output);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('check output is byte-identical across repeated invocations for an unchanged run', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const first = runCli(['check', '--root', tmp]);
      const second = runCli(['check', '--root', tmp]);
      expect(second.output).toBe(first.output);
      expect(second.exitCode).toBe(first.exitCode);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('check --all output is byte-identical across repeated invocations for an unchanged run', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const first = runCli(['check', '--all', '--root', tmp]);
      const second = runCli(['check', '--all', '--root', tmp]);
      expect(second.output).toBe(first.output);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('export output is byte-identical across repeated invocations for an unchanged run, aside from the Generated: timestamp line', () => {
    const tmp = makeTempDir();
    try {
      initWorkspace(tmp);
      createRun({ request: 'test', mode: 'feature', projectRoot: tmp });
      const strip = (s: string) => s.replace(/^Generated: .*$/m, 'Generated: <NORMALIZED>');
      const first = strip(runCli(['export', '--root', tmp]).output);
      const second = strip(runCli(['export', '--root', tmp]).output);
      expect(second).toBe(first);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('run-level readiness aggregation is deeply equal across repeated evaluations for an unchanged run', () => {
    const tmp = makeTempDir();
    try {
      makeReadyRunFolder(tmp, 'feature');
      const args = { mode: 'feature', runFolder: tmp, workflowStageNames: ['implementation', 'test-implementation', 'verification', 'judge'] };
      const first = evaluateRunContextReadiness(args);
      const second = evaluateRunContextReadiness(args);
      expect(second).toEqual(first);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('the compatibility manifest is deeply equal across repeated builds', () => {
    const a = buildCompatibilityManifest();
    const b = buildCompatibilityManifest();
    expect(b).toEqual(a);
  });

  it('two independently created runs of the same mode produce byte-identical starter context templates (aside from paths)', () => {
    const tmpA = makeTempDir();
    const tmpB = makeTempDir();
    try {
      const metaA = createRun({ request: 'same request', mode: 'feature', projectRoot: tmpA });
      const metaB = createRun({ request: 'same request', mode: 'feature', projectRoot: tmpB });
      const textA = fs.readFileSync(path.join(metaA.runFolder, 'artifacts', 'implementation-context-packet.txt'), 'utf8');
      const textB = fs.readFileSync(path.join(metaB.runFolder, 'artifacts', 'implementation-context-packet.txt'), 'utf8');
      expect(textB).toBe(textA);
    } finally {
      fs.rmSync(tmpA, { recursive: true, force: true });
      fs.rmSync(tmpB, { recursive: true, force: true });
    }
  });
});
