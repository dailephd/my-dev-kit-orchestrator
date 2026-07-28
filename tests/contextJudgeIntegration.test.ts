import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateStagePrompt } from '../src/promptGenerator';
import { RunMetadata } from '../src/run';
import { getWorkflow } from '../src/workflows';
import { WorkflowMode } from '../src/types';
import { makeReadyRunFolder } from './readyContextTestHelpers';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-judge-readiness-'));
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

describe('judge prompt context readiness review', () => {
  it('requires NEED_CONTEXT and recommends implementation when implementation context is missing', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeMeta('feature', tmp);
      const prompt = generateStagePrompt(meta, 'judge');
      expect(prompt).toContain('Context readiness review:');
      expect(prompt).toContain('must return "Verdict: NEED_CONTEXT"');
      expect(prompt).toContain('Canonical run blocker:');
      expect(prompt).toContain('Primary blocker: CONTEXT_PACKET_MISSING');
      expect(prompt).toContain('Corrective action:');
      expect(prompt).toContain('Evidence target:');
      expect(prompt).toContain('Recommended next stage: implementation');
      expect(prompt).toContain('Do not return PASS');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('recommends test-implementation when only test context is missing', () => {
    const tmp = makeTempDir();
    try {
      makeReadyRunFolder(tmp, 'feature');
      // Break only the test context by deleting its packet.
      fs.rmSync(path.join(tmp, 'artifacts', 'test-context-packet.txt'));
      const meta = makeMeta('feature', tmp);
      const prompt = generateStagePrompt(meta, 'judge');
      expect(prompt).toContain('Recommended next stage: test-implementation');
      expect(prompt).toContain('Primary blocker: CONTEXT_PACKET_MISSING');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('recommends test-implementation for test mode (no implementation-context requirement)', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeMeta('test', tmp);
      const prompt = generateStagePrompt(meta, 'judge');
      expect(prompt).toContain('Recommended next stage: test-implementation');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('permits normal judge behavior once all required context is ready', () => {
    const tmp = makeTempDir();
    try {
      makeReadyRunFolder(tmp, 'feature');
      const meta = makeMeta('feature', tmp);
      const prompt = generateStagePrompt(meta, 'judge');
      expect(prompt).toContain('Overall decision: ready');
      expect(prompt).toContain('Judge freely on the complete evidence');
      expect(prompt).not.toContain('must return "Verdict: NEED_CONTEXT"');
      expect(prompt).not.toContain('Canonical run blocker:');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('does not add or remove a judge verdict -- the report contract stays JudgeReport', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeMeta('feature', tmp);
      const prompt = generateStagePrompt(meta, 'judge');
      expect(prompt).toContain('Required output artifact: JudgeReport');
      expect(prompt).toContain('Verdict: ...');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('greenfield judge does not render a Context readiness review', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeMeta('greenfield', tmp);
      const prompt = generateStagePrompt(meta, 'judge');
      expect(prompt).not.toContain('Context readiness review:');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('extraction judge reviews both contexts and recommends implementation first', () => {
    const tmp = makeTempDir();
    try {
      const meta = makeMeta('extraction', tmp);
      const prompt = generateStagePrompt(meta, 'judge');
      expect(prompt).toContain('Implementation context:');
      expect(prompt).toContain('Test context:');
      expect(prompt).toContain('Recommended next stage: implementation');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
