import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateCorrectionPrompt } from '../src/promptGenerator';
import { parseAndRoute, CORRECTABLE_STAGES, CorrectionRouteResult } from '../src/correctionRouter';
import { RunMetadata } from '../src/run';
import { getWorkflow } from '../src/workflows';
import { makeReadyRunFolder } from './readyContextTestHelpers';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-correction-packet-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

const VERDICT_FOR_STAGE: Record<(typeof CORRECTABLE_STAGES)[number], string> = {
  'architecture-context': 'ARCHITECTURE_MISMATCH',
  'behavior-model': 'DESIGN_INCOMPLETE',
  'pseudocode-packet': 'PSEUDOCODE_INCOMPLETE',
  'test-strategy': 'TEST_COVERAGE_INCOMPLETE',
  'test-implementation': 'TEST_COVERAGE_INCOMPLETE',
  implementation: 'IMPLEMENTATION_MISMATCH',
  verification: 'NEED_VERIFICATION',
};

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

describe('correction prompt packet integration', () => {
  function routeStateFor(stage: (typeof CORRECTABLE_STAGES)[number]): CorrectionRouteResult {
    // Not every correctable stage has a verdict in the default routing table
    // (test-implementation has none -- see src/correctionRouter.ts's
    // VERDICT_ROUTE_TABLE), so construct the routed state directly for
    // stages the table doesn't reach, and via the real router otherwise.
    if (stage === 'test-implementation') {
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
    return parseAndRoute(`Verdict: ${VERDICT_FOR_STAGE[stage]}`);
  }

  it.each(CORRECTABLE_STAGES)('correction prompt for %s contains the exact target-stage packet', (stage) => {
    const tmp = makeTempDir();
    try {
      const runFolder = path.join(tmp, 'run');
      makeReadyRunFolder(runFolder, 'feature');
      const meta = makeFeatureMeta(runFolder);
      const state = routeStateFor(stage);
      const prompt = generateCorrectionPrompt(meta, state);
      expect(prompt).toContain('Workflow instruction packet:');
      expect(prompt).toContain('Workflow ID: workflow.feature');
      expect(prompt).toContain(`Stage ID: stage.feature.${stage}`);
    } finally {
      cleanup(tmp);
    }
  });

  it('correction prompt retains judge findings and correction attempt information', () => {
    const tmp = makeTempDir();
    try {
      const runFolder = path.join(tmp, 'run');
      makeReadyRunFolder(runFolder, 'feature');
      const meta = makeFeatureMeta(runFolder);
      const state = parseAndRoute('Verdict: IMPLEMENTATION_MISMATCH');
      const prompt = generateCorrectionPrompt(meta, state);
      expect(prompt).toContain('Correction context:');
      expect(prompt).toContain('Judge verdict: IMPLEMENTATION_MISMATCH');
      expect(prompt).toContain('Routed correction stage: implementation');
    } finally {
      cleanup(tmp);
    }
  });

  it('preserves recommended next stage when present', () => {
    const tmp = makeTempDir();
    try {
      const runFolder = path.join(tmp, 'run');
      makeReadyRunFolder(runFolder, 'feature');
      const meta = makeFeatureMeta(runFolder);
      const state = parseAndRoute('Verdict: ARCHITECTURE_MISMATCH\nRecommended next stage: pseudocode-packet');
      const prompt = generateCorrectionPrompt(meta, state);
      expect(prompt).toContain('Judge recommended: pseudocode-packet');
    } finally {
      cleanup(tmp);
    }
  });

  it('does not use another stage\'s packet', () => {
    const tmp = makeTempDir();
    try {
      const runFolder = path.join(tmp, 'run');
      makeReadyRunFolder(runFolder, 'feature');
      const meta = makeFeatureMeta(runFolder);
      const state = parseAndRoute('Verdict: IMPLEMENTATION_MISMATCH');
      const prompt = generateCorrectionPrompt(meta, state);
      expect(prompt).not.toContain('Stage ID: stage.feature.verification');
      expect(prompt).not.toContain('Stage ID: stage.feature.judge');
    } finally {
      cleanup(tmp);
    }
  });

  it('does not create a packet sidecar for a correction prompt', () => {
    const tmp = makeTempDir();
    try {
      const runFolder = path.join(tmp, 'run');
      makeReadyRunFolder(runFolder, 'feature');
      fs.mkdirSync(path.join(runFolder, 'prompts'), { recursive: true });
      const meta = makeFeatureMeta(runFolder);
      const state = parseAndRoute('Verdict: IMPLEMENTATION_MISMATCH');
      generateCorrectionPrompt(meta, state);
      const promptsDirEntries = fs.readdirSync(path.join(runFolder, 'prompts'));
      expect(promptsDirEntries).toEqual([]);
    } finally {
      cleanup(tmp);
    }
  });

  it('does not alter correction state merely by rendering the prompt', () => {
    const tmp = makeTempDir();
    try {
      const runFolder = path.join(tmp, 'run');
      makeReadyRunFolder(runFolder, 'feature');
      const meta = makeFeatureMeta(runFolder);
      const state = parseAndRoute('Verdict: IMPLEMENTATION_MISMATCH');
      const before = JSON.stringify(state);
      generateCorrectionPrompt(meta, state);
      expect(JSON.stringify(state)).toBe(before);
    } finally {
      cleanup(tmp);
    }
  });
});
