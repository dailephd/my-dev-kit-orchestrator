// TaskState: an in-memory projection of current run and selected-stage
// information. TaskState is never persisted -- it exists only to feed
// StageContextBundle assembly during prompt generation.

import { RunMetadata } from '../run';
import { CorrectionRouteResult } from '../correctionRouter';

export const TASK_STATE_SCHEMA_VERSION = '1.0.0';

export interface TaskStateCorrectionSummary {
  active: boolean;
  targetStage: string;
  sourceStage: string;
  verdict: string | null;
  recommendedNextStage: string | null;
}

export interface TaskState {
  schemaVersion: string;
  runId: string;
  mode: string;
  request: string;
  runStatus: string;
  currentStage: string;
  selectedStage: string;
  selectedStageIndex: number;
  stageCount: number;
  projectRoot: string;
  runFolder: string;
  promptFile: string;
  artifactFile: string;
  additionalArtifactFiles: string[];
  sourceRepoRoot?: string;
  targetRepoRoot?: string;
  correction?: TaskStateCorrectionSummary;
}

export interface AssembleTaskStateInput {
  runMetadata: RunMetadata;
  selectedStage: string;
  correctionState?: CorrectionRouteResult;
}

export interface TaskStateAssemblyIssue {
  code: 'TASK_STATE_UNKNOWN_STAGE' | 'TASK_STATE_STAGE_LIST_INCONSISTENT';
  message: string;
}

export type AssembleTaskStateResult =
  | { ok: true; taskState: TaskState }
  | { ok: false; issues: TaskStateAssemblyIssue[] };

export function assembleTaskState(input: AssembleTaskStateInput): AssembleTaskStateResult {
  const { runMetadata, selectedStage, correctionState } = input;

  const selectedStageIndex = runMetadata.stages.findIndex((s) => s.name === selectedStage);
  if (selectedStageIndex === -1) {
    return {
      ok: false,
      issues: [
        {
          code: 'TASK_STATE_UNKNOWN_STAGE',
          message: `Selected stage "${selectedStage}" is not present in run metadata for mode "${runMetadata.mode}".`,
        },
      ],
    };
  }

  const stageDef = runMetadata.stages[selectedStageIndex];
  if (!stageDef.promptFile || !stageDef.artifactFile) {
    return {
      ok: false,
      issues: [
        {
          code: 'TASK_STATE_STAGE_LIST_INCONSISTENT',
          message: `Stage "${selectedStage}" is missing promptFile or artifactFile in run metadata.`,
        },
      ],
    };
  }

  const taskState: TaskState = {
    schemaVersion: TASK_STATE_SCHEMA_VERSION,
    runId: runMetadata.runId,
    mode: runMetadata.mode,
    request: runMetadata.request,
    runStatus: runMetadata.status,
    currentStage: runMetadata.currentStage,
    selectedStage,
    selectedStageIndex,
    stageCount: runMetadata.stages.length,
    projectRoot: runMetadata.projectRoot,
    runFolder: runMetadata.runFolder,
    promptFile: stageDef.promptFile,
    artifactFile: stageDef.artifactFile,
    additionalArtifactFiles: [...(stageDef.additionalArtifactFiles ?? [])],
    ...(runMetadata.sourceRepoRoot !== undefined ? { sourceRepoRoot: runMetadata.sourceRepoRoot } : {}),
    ...(runMetadata.targetRepoRoot !== undefined ? { targetRepoRoot: runMetadata.targetRepoRoot } : {}),
  };

  if (correctionState && correctionState.routedStage) {
    taskState.correction = {
      active: correctionState.routeStatus === 'correction_required',
      targetStage: correctionState.routedStage,
      sourceStage: 'judge',
      verdict: correctionState.verdict,
      recommendedNextStage: correctionState.recommendedStage,
    };
  }

  return { ok: true, taskState };
}
