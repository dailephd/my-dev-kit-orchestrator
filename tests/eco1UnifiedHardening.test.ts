import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getMostRecentRun, loadRun } from '../src/run';
import { VALID_MODES } from '../src/types';
import { evaluateRunContextReadiness } from '../src/instructions/runContextReadiness';
import { getWorkflow } from '../src/workflows';
import { consumeBoundedObserverEvidence } from '../src';
import { runCli } from './cliTestHelpers';

function temporaryRoot(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-eco1-unified-')); }
function stageNames(mode: string): string[] { return getWorkflow(mode as never).stages.map((stage) => stage.name); }

describe('ECO-1 unified public-contract hardening', () => {
  it('keeps every ordinary workflow mode ordinary through the real start command and reload', () => {
    const root = temporaryRoot();
    try {
      for (const mode of VALID_MODES) {
        const args = ['start', '--root', root, '--mode', mode, '--name', `ordinary-${mode}`];
        if (mode === 'extraction') args.push('--source', root, '--target', root);
        args.push(`ordinary ${mode}`);
        expect(runCli(args).exitCode).toBeUndefined();
        const created = getMostRecentRun(root);
        expect(created).not.toBeNull();
        const reloaded = loadRun(created!.runFolder);
        expect(reloaded).toMatchObject({ mode, proofOnly: false });
        expect(reloaded.verificationResponsibility).toBeUndefined();
        expect(reloaded.currentStage).toBe(reloaded.stages[0].name);
      }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('projects one explicit proof-only run consistently through reload, status, prompt, check, and export', () => {
    const root = temporaryRoot();
    try {
      const created = runCli(['start', '--root', root, '--name', 'proof', '--proof-only', '--verification-responsibility', 'artifacts/proof.txt', 'verify an existing behavior']);
      expect(created.exitCode).toBeUndefined();
      const run = getMostRecentRun(root)!;
      expect(loadRun(run.runFolder)).toMatchObject({ proofOnly: true, verificationResponsibility: 'artifacts/proof.txt' });
      expect(runCli(['status', '--root', root]).output).toContain('Proof-only:');
      expect(runCli(['prompt', '--root', root]).output).toContain('Stage: request-brief');
      expect(runCli(['check', '--root', root]).output).toContain('Check results for run:');
      expect(runCli(['export', '--root', root]).output).toContain('Proof-only:  active');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('does not let explicit proof-only bypass phase-aware repository evidence', () => {
    const root = temporaryRoot();
    try {
      const run = loadRun(requireRun(root, ['start', '--root', root, '--name', 'phase-proof', '--proof-only', '--verification-responsibility', 'artifacts/proof.txt', 'verify']).runFolder);
      const early = evaluateRunContextReadiness({ mode: run.mode, runFolder: run.runFolder, workflowStageNames: stageNames(run.mode), currentStage: run.currentStage });
      expect(early.overallDecision).toBe('not-required');
      const owner = evaluateRunContextReadiness({ mode: run.mode, runFolder: run.runFolder, workflowStageNames: stageNames(run.mode), currentStage: 'implementation' });
      expect(owner.overallDecision).toBe('refresh-required');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('keeps the public Observer consumer isolated from run creation and deterministic on built-contract-shaped input', () => {
    const artifact = {
      artifactKind: 'my-frontend-observer/bounded-agent-context', schemaVersion: '1.0.0', contextId: 'context', contextRequestId: 'request',
      producer: { name: 'my-frontend-observer', version: '0.6.0' }, provenance: { generatedAt: '2026-09-01T00:00:00.000Z' }, projectionProfile: 'frontend-change-review',
      sources: { observationIds: ['observation'] }, targets: [], adequacy: { state: 'adequate', reasons: [] }, omissions: [], truncations: [],
    };
    const before = JSON.stringify(artifact);
    expect(consumeBoundedObserverEvidence({ artifact })).toEqual(consumeBoundedObserverEvidence({ artifact }));
    expect(JSON.stringify(artifact)).toBe(before);
  });
});

function requireRun(root: string, args: string[]) {
  expect(runCli(args).exitCode).toBeUndefined();
  const run = getMostRecentRun(root);
  if (!run) throw new Error('Expected start to create a run.');
  return run;
}
