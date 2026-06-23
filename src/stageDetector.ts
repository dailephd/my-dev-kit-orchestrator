import * as fs from 'fs';
import * as path from 'path';
import { RunMetadata } from './run';
import { StageDefinition } from './workflows';
import {
  ArtifactLifecycleState,
  ArtifactStateFile,
  resolveArtifactState,
  getStaleReason,
} from './artifactLifecycle';

export interface ArtifactStatus {
  stageName: string;
  artifactFile: string;
  present: boolean;
}

export interface SupportingReportStatus {
  stageName: string;
  reportFile: string;
  present: boolean;
}

const STAGE_SUPPORTING_REPORTS: Record<string, string> = {
  'architecture-context': 'reports/architecture-context-retrieval-report.txt',
  'source-architecture-context': 'reports/source-architecture-context-retrieval-report.txt',
};

export function getSupportingReportStatuses(meta: RunMetadata): SupportingReportStatus[] {
  const stageNames = new Set(meta.stages.map((s) => s.name));
  return Object.entries(STAGE_SUPPORTING_REPORTS)
    .filter(([stageName]) => stageNames.has(stageName))
    .map(([stageName, reportFile]) => ({
      stageName,
      reportFile,
      present: fs.existsSync(path.join(meta.runFolder, reportFile)),
    }));
}

function allArtifactsPresent(runFolder: string, stage: StageDefinition): boolean {
  const primaryPresent = fs.existsSync(path.join(runFolder, stage.artifactFile));
  if (!primaryPresent) return false;
  if (!stage.additionalArtifactFiles) return true;
  return stage.additionalArtifactFiles.every((f) => fs.existsSync(path.join(runFolder, f)));
}

export function getArtifactStatuses(meta: RunMetadata): ArtifactStatus[] {
  const statuses: ArtifactStatus[] = [];
  for (const stage of meta.stages) {
    statuses.push({
      stageName: stage.name,
      artifactFile: stage.artifactFile,
      present: fs.existsSync(path.join(meta.runFolder, stage.artifactFile)),
    });
    if (stage.additionalArtifactFiles) {
      for (const additionalFile of stage.additionalArtifactFiles) {
        statuses.push({
          stageName: stage.name,
          artifactFile: additionalFile,
          present: fs.existsSync(path.join(meta.runFolder, additionalFile)),
        });
      }
    }
  }
  return statuses;
}

export function getNextStage(meta: RunMetadata): StageDefinition | null {
  for (const stage of meta.stages) {
    if (!allArtifactsPresent(meta.runFolder, stage)) {
      return stage;
    }
  }
  return null;
}

export function isRunComplete(meta: RunMetadata): boolean {
  return getNextStage(meta) === null;
}

// ─── Lifecycle-aware stage detection (v0.3.0) ──────────────────────────────

export interface ArtifactLifecycleStatus {
  stageName: string;
  artifactFile: string;
  lifecycleState: ArtifactLifecycleState;
  reason?: string;
}

export function getArtifactLifecycleStatuses(
  meta: RunMetadata,
  stateFile: ArtifactStateFile,
): ArtifactLifecycleStatus[] {
  const statuses: ArtifactLifecycleStatus[] = [];
  for (const stage of meta.stages) {
    const files = [stage.artifactFile, ...(stage.additionalArtifactFiles ?? [])];
    for (const artifactFile of files) {
      const lifecycleState = resolveArtifactState(
        meta.runFolder,
        artifactFile,
        meta.stages,
        stateFile,
      );
      const record = stateFile.artifacts[artifactFile];
      let reason: string | undefined;
      if (lifecycleState === 'stale') {
        reason = getStaleReason(meta.runFolder, artifactFile, meta.stages, stateFile);
      } else if (lifecycleState === 'blocked' || lifecycleState === 'incomplete') {
        reason = record?.reason;
      }
      statuses.push({ stageName: stage.name, artifactFile, lifecycleState, reason });
    }
  }
  return statuses;
}

function allArtifactsEffectivelyComplete(
  runFolder: string,
  stage: StageDefinition,
  allStages: StageDefinition[],
  stateFile: ArtifactStateFile,
): boolean {
  const files = [stage.artifactFile, ...(stage.additionalArtifactFiles ?? [])];
  return files.every(
    (f) => resolveArtifactState(runFolder, f, allStages, stateFile) === 'complete',
  );
}

export function getNextStageWithLifecycle(
  meta: RunMetadata,
  stateFile: ArtifactStateFile,
): StageDefinition | null {
  for (const stage of meta.stages) {
    if (!allArtifactsEffectivelyComplete(meta.runFolder, stage, meta.stages, stateFile)) {
      return stage;
    }
  }
  return null;
}

export function isRunCompleteWithLifecycle(
  meta: RunMetadata,
  stateFile: ArtifactStateFile,
): boolean {
  return getNextStageWithLifecycle(meta, stateFile) === null;
}

export function resolveCurrentArtifactStates(
  meta: RunMetadata,
  stateFile: ArtifactStateFile,
  stage: StageDefinition,
): ArtifactLifecycleState[] {
  const files = [stage.artifactFile, ...(stage.additionalArtifactFiles ?? [])];
  return files.map((f) => resolveArtifactState(meta.runFolder, f, meta.stages, stateFile));
}

// ─── Original file-existence helpers (preserved for backward compat) ─────────

export function getMissingPriorArtifacts(meta: RunMetadata, stageName: string): string[] {
  const stageIndex = meta.stages.findIndex((s) => s.name === stageName);
  if (stageIndex === -1) return [];

  const missing: string[] = [];
  for (let i = 0; i < stageIndex; i++) {
    const stage = meta.stages[i];
    const artifactPath = path.join(meta.runFolder, stage.artifactFile);
    if (!fs.existsSync(artifactPath)) {
      missing.push(stage.artifactFile);
    }
    if (stage.additionalArtifactFiles) {
      for (const additionalFile of stage.additionalArtifactFiles) {
        if (!fs.existsSync(path.join(meta.runFolder, additionalFile))) {
          missing.push(additionalFile);
        }
      }
    }
  }
  return missing;
}
