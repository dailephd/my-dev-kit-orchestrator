import { assembleTaskState, TASK_STATE_SCHEMA_VERSION } from '../src/instructions/taskState';
import { RunMetadata } from '../src/run';
import { getWorkflow } from '../src/workflows';
import { CorrectionRouteResult } from '../src/correctionRouter';

function makeMeta(mode: 'feature' | 'extraction' = 'feature'): RunMetadata {
  const workflow = getWorkflow(mode);
  return {
    runId: 'run-1',
    mode,
    request: 'do the thing',
    projectRoot: '/proj',
    runFolder: '/proj/.my-dev-kit-orchestrator/runs/run-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    currentStage: workflow.stages[0].name,
    stages: workflow.stages,
    status: 'in_progress',
    ...(mode === 'extraction' ? { sourceRepoRoot: '/src', targetRepoRoot: '/tgt' } : {}),
  };
}

describe('assembleTaskState', () => {
  it('produces TaskState for a valid selected stage', () => {
    const result = assembleTaskState({ runMetadata: makeMeta(), selectedStage: 'implementation' });
    expect(result.ok).toBe(true);
  });

  it('schema version is 1.0.0', () => {
    const result = assembleTaskState({ runMetadata: makeMeta(), selectedStage: 'implementation' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.taskState.schemaVersion).toBe('1.0.0');
    expect(TASK_STATE_SCHEMA_VERSION).toBe('1.0.0');
  });

  it('preserves runId, mode, request, and currentStage', () => {
    const meta = makeMeta();
    const result = assembleTaskState({ runMetadata: meta, selectedStage: 'implementation' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.taskState.runId).toBe(meta.runId);
      expect(result.taskState.mode).toBe(meta.mode);
      expect(result.taskState.request).toBe(meta.request);
      expect(result.taskState.currentStage).toBe(meta.currentStage);
    }
  });

  it('selectedStage and selectedStageIndex are exact', () => {
    const meta = makeMeta();
    const result = assembleTaskState({ runMetadata: meta, selectedStage: 'test-strategy' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.taskState.selectedStage).toBe('test-strategy');
      expect(result.taskState.selectedStageIndex).toBe(meta.stages.findIndex((s) => s.name === 'test-strategy'));
    }
  });

  it('stageCount matches run metadata', () => {
    const meta = makeMeta();
    const result = assembleTaskState({ runMetadata: meta, selectedStage: 'implementation' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.taskState.stageCount).toBe(meta.stages.length);
  });

  it('promptFile and artifactFile come from StageDefinition', () => {
    const meta = makeMeta();
    const stage = meta.stages.find((s) => s.name === 'implementation')!;
    const result = assembleTaskState({ runMetadata: meta, selectedStage: 'implementation' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.taskState.promptFile).toBe(stage.promptFile);
      expect(result.taskState.artifactFile).toBe(stage.artifactFile);
    }
  });

  it('additionalArtifactFiles preserve order', () => {
    const meta = makeMeta('extraction');
    const result = assembleTaskState({ runMetadata: meta, selectedStage: 'porting-map' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.taskState.additionalArtifactFiles).toEqual(['artifacts/do-not-port-list.txt']);
  });

  it('preserves sourceRepoRoot/targetRepoRoot when present', () => {
    const meta = makeMeta('extraction');
    const result = assembleTaskState({ runMetadata: meta, selectedStage: 'porting-map' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.taskState.sourceRepoRoot).toBe('/src');
      expect(result.taskState.targetRepoRoot).toBe('/tgt');
    }
  });

  it('omits sourceRepoRoot/targetRepoRoot when absent', () => {
    const result = assembleTaskState({ runMetadata: makeMeta(), selectedStage: 'implementation' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.taskState.sourceRepoRoot).toBeUndefined();
      expect(result.taskState.targetRepoRoot).toBeUndefined();
    }
  });

  it('fails for an unknown stage', () => {
    const result = assembleTaskState({ runMetadata: makeMeta(), selectedStage: 'not-a-stage' });
    expect(result.ok).toBe(false);
  });

  it('fails for a stage belonging to a different mode', () => {
    const result = assembleTaskState({ runMetadata: makeMeta('feature'), selectedStage: 'idea-brief' });
    expect(result.ok).toBe(false);
  });

  it('produces no timestamp field', () => {
    const result = assembleTaskState({ runMetadata: makeMeta(), selectedStage: 'implementation' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.stringify(result.taskState)).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
  });

  it('includes a correction summary only when correction state routes to a stage', () => {
    const correctionState: CorrectionRouteResult = {
      verdict: 'IMPLEMENTATION_MISMATCH',
      recommendedStage: null,
      routedStage: 'implementation',
      routeStatus: 'correction_required',
      warnings: [],
      errors: [],
      isBlocked: false,
      strictFail: false,
    };
    const result = assembleTaskState({ runMetadata: makeMeta(), selectedStage: 'implementation', correctionState });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.taskState.correction).toBeDefined();
      expect(result.taskState.correction!.active).toBe(true);
      expect(result.taskState.correction!.targetStage).toBe('implementation');
      expect(result.taskState.correction!.verdict).toBe('IMPLEMENTATION_MISMATCH');
    }
  });

  it('omits the correction summary when no correction state is provided', () => {
    const result = assembleTaskState({ runMetadata: makeMeta(), selectedStage: 'implementation' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.taskState.correction).toBeUndefined();
  });
});
