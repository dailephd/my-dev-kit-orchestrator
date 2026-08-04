import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateCorrectionPrompt } from '../src/promptGenerator';
import { parseAndRoute, CorrectionRouteResult } from '../src/correctionRouter';
import { RunMetadata } from '../src/run';
import { getWorkflow } from '../src/workflows';
import { makeReadyRunFolder } from './readyContextTestHelpers';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-repo-evidence-correction-'));
}

function makeFeatureMeta(runFolder: string): RunMetadata {
  const workflow = getWorkflow('feature');
  return {
    runId: 'run-correction',
    mode: 'feature',
    request: 'test',
    projectRoot: '/proj',
    runFolder,
    createdAt: '2024-01-01T00:00:00.000Z',
    currentStage: 'judge',
    stages: workflow.stages,
    status: 'in_progress',
  };
}

function makeExtractionMeta(runFolder: string): RunMetadata {
  const workflow = getWorkflow('extraction');
  return {
    runId: 'run-extraction-correction',
    mode: 'extraction',
    request: 'port behavior',
    projectRoot: '/target',
    sourceRepoRoot: '/source',
    targetRepoRoot: '/target',
    runFolder,
    createdAt: '2024-01-01T00:00:00.000Z',
    currentStage: 'judge',
    stages: workflow.stages,
    status: 'in_progress',
  };
}

function testImplementationRouteState(): CorrectionRouteResult {
  return {
    verdict: 'TEST_COVERAGE_INCOMPLETE',
    recommendedStage: null,
    routedStage: 'test-implementation',
    routeStatus: 'correction_required',
    warnings: [],
    errors: [],
    isBlocked: false,
    strictFail: false,
  };
}

describe('repository evidence correction prompt integration', () => {
  it('routes a generic extraction architecture mismatch to the native target-architecture stage', () => {
    const tmp = makeTempDir();
    try {
      const runFolder = path.join(tmp, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      const meta = makeExtractionMeta(runFolder);
      const state = parseAndRoute('Verdict: ARCHITECTURE_MISMATCH', {
        workflowMode: 'extraction',
      });

      expect(meta.stages.some((stage) => stage.name === state.routedStage)).toBe(true);
      expect(() => generateCorrectionPrompt(meta, state)).not.toThrow();
      expect(generateCorrectionPrompt(meta, state)).toContain('Stage: target-architecture (correction)');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // Batch 5: missing context for a direct correction target (implementation
  // / test-implementation) now blocks the correction into a context-
  // refresh-only prompt (AGENTS.txt Batch 5 section 18.1) rather than
  // rendering the Batch 4 informational "Repository evidence:" section --
  // see contextCorrectionIntegration.test.ts for the full readiness-blocked
  // correction contract, and repositoryEvidencePromptIntegration.test.ts /
  // this file's ready-context cases for the still-informational rendering
  // once context is ready.
  it('blocks the correction into a context-refresh-only prompt when implementation context is missing', () => {
    const tmp = makeTempDir();
    try {
      const runFolder = path.join(tmp, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      const meta = makeFeatureMeta(runFolder);
      const state = parseAndRoute('Verdict: IMPLEMENTATION_MISMATCH');
      const prompt = generateCorrectionPrompt(meta, state);
      expect(prompt).toContain('BLOCKED on repository context');
      expect(prompt).toContain('Context kind: implementation');
      expect(prompt).toContain('Readiness decision: refresh-required');
      expect(prompt).toContain('Classification: missing');
      expect(prompt).toContain('Primary blocker: CONTEXT_PACKET_MISSING');
      expect(prompt).toContain('Primary reason:');
      expect(prompt).toContain('Corrective action:');
      expect(prompt).toContain('Evidence target:');
      // Correction-specific content must remain present alongside it.
      expect(prompt).toContain('Correction context:');
      expect(prompt).toContain('Judge verdict: IMPLEMENTATION_MISMATCH');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('blocks the correction into a context-refresh-only prompt when test context is missing', () => {
    const tmp = makeTempDir();
    try {
      const runFolder = path.join(tmp, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      const meta = makeFeatureMeta(runFolder);
      const prompt = generateCorrectionPrompt(meta, testImplementationRouteState());
      expect(prompt).toContain('BLOCKED on repository context');
      expect(prompt).toContain('Context kind: test');
      expect(prompt).toContain('Readiness decision: refresh-required');
      expect(prompt).toContain('Primary blocker: CONTEXT_PACKET_MISSING');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('renders the informational Repository evidence section once context is ready', () => {
    const tmp = makeTempDir();
    try {
      const runFolder = path.join(tmp, 'run');
      makeReadyRunFolder(runFolder, 'feature');
      const meta = makeFeatureMeta(runFolder);
      const state = parseAndRoute('Verdict: IMPLEMENTATION_MISMATCH');
      const prompt = generateCorrectionPrompt(meta, state);
      expect(prompt).toContain('Repository evidence:');
      expect(prompt).toContain('Expected role: implementation');
      expect(prompt).toContain('Aggregate status: populated');
      expect(prompt).toContain('Context readiness decision: ready');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('does not render repository evidence for a non-context-sensitive correction target', () => {
    const tmp = makeTempDir();
    try {
      const runFolder = path.join(tmp, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      const meta = makeFeatureMeta(runFolder);
      const state = parseAndRoute('Verdict: ARCHITECTURE_MISMATCH');
      const prompt = generateCorrectionPrompt(meta, state);
      expect(prompt).not.toContain('Repository evidence:');
      expect(prompt).toContain('Correction context:');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('does not create a context file as a side effect of correction prompt rendering', () => {
    const tmp = makeTempDir();
    try {
      const runFolder = path.join(tmp, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      const meta = makeFeatureMeta(runFolder);
      const state = parseAndRoute('Verdict: IMPLEMENTATION_MISMATCH');
      generateCorrectionPrompt(meta, state);
      expect(fs.existsSync(path.join(runFolder, 'artifacts', 'implementation-context-packet.txt'))).toBe(false);
      expect(fs.existsSync(path.join(runFolder, 'reports'))).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('does not change correction routing behavior', () => {
    const tmp = makeTempDir();
    try {
      const runFolder = path.join(tmp, 'run');
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
      const meta = makeFeatureMeta(runFolder);
      const state = parseAndRoute('Verdict: IMPLEMENTATION_MISMATCH');
      expect(state.routedStage).toBe('implementation');
      expect(state.routeStatus).toBe('correction_required');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
