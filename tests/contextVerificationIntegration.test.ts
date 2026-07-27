import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateStagePrompt } from '../src/promptGenerator';
import { RunMetadata } from '../src/run';
import { getWorkflow } from '../src/workflows';
import { WorkflowMode } from '../src/types';
import { makeReadyRunFolder } from './readyContextTestHelpers';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-verify-readiness-'));
}

function makeMeta(mode: WorkflowMode, runFolder: string): RunMetadata {
  const workflow = getWorkflow(mode);
  return {
    runId: 'run-1',
    mode,
    request: 'test',
    projectRoot: '/proj',
    runFolder,
    createdAt: '2024-01-01T00:00:00.000Z',
    currentStage: workflow.stages[0].name,
    stages: workflow.stages,
    status: 'in_progress',
    ...(mode === 'extraction' ? { sourceRepoRoot: '/src', targetRepoRoot: '/tgt' } : {}),
  };
}

const NON_GREENFIELD_MODES: WorkflowMode[] = ['feature', 'repair', 'test', 'refactor', 'harden', 'extraction'];

describe('verification prompt context readiness review', () => {
  it.each(NON_GREENFIELD_MODES)('renders a Context readiness review for %s verification when context is missing', (mode) => {
    const tmp = makeTempDir();
    try {
      const meta = makeMeta(mode, tmp);
      const prompt = generateStagePrompt(meta, 'verification');
      expect(prompt).toContain('Context readiness review:');
      expect(prompt).toContain('Overall decision: refresh-required');
      expect(prompt).toContain('Canonical run blocker:');
      expect(prompt).toContain('Primary blocker: CONTEXT_PACKET_MISSING');
      expect(prompt).toContain('Primary reason:');
      expect(prompt).toContain('Corrective action:');
      expect(prompt).toContain('Evidence target:');
      expect(prompt).toContain('do not claim the work is verified');
      expect(prompt).toContain('Do not run normal behavioral verification commands');
      // The stage's own VerificationReport contract must still be present.
      expect(prompt).toContain('Required output artifact: VerificationReport');
      expect(prompt).toContain('Return format:');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('renders "All required repository context is ready" once context is ready', () => {
    const tmp = makeTempDir();
    try {
      makeReadyRunFolder(tmp, 'feature');
      const meta = makeMeta('feature', tmp);
      const prompt = generateStagePrompt(meta, 'verification');
      expect(prompt).toContain('Overall decision: ready');
      expect(prompt).toContain('All required repository context is ready');
      expect(prompt).not.toContain('Canonical run blocker:');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('test mode verification only reviews test context', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeMeta('test', tmp);
      const prompt = generateStagePrompt(meta, 'verification');
      expect(prompt).toContain('Test context:');
      expect(prompt).not.toContain('Implementation context:');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('greenfield verification does not render a Context readiness review', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeMeta('greenfield', tmp);
      const prompt = generateStagePrompt(meta, 'verification');
      expect(prompt).not.toContain('Context readiness review:');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('does not create any file as a side effect', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeMeta('feature', tmp);
      generateStagePrompt(meta, 'verification');
      expect(fs.existsSync(path.join(tmp, 'artifacts'))).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
