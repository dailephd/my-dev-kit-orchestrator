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
import {
  RunIntegrityGateResult,
  resolveArtifactStateWithRunIntegrity,
  blockingReasonForArtifactFile,
} from './runIntegrityGate';

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

// ─── Canonical-run-integrity-aware stage detection (v1.2.3 Batch 2) ────────
//
// Gate-aware siblings of the Batch-5-era *WithLifecycle functions above.
// They resolve every artifact's lifecycle state through
// resolveArtifactStateWithRunIntegrity() instead of resolveArtifactState()
// directly, so a context-blocked implementation/test-implementation stage
// is never treated as "complete" merely because its artifact file exists or
// carries a manual "complete" record (invariants 6.2/6.4). Because
// getNextStageWithRunIntegrity() walks stages in fixed workflow order and
// returns the first stage that is not effectively complete, forcing a
// blocked stage's own state to "blocked" is sufficient on its own to keep
// every stage after it (verification, judge, final-report, ...) from being
// reported as the current/next stage -- no separate downstream-propagation
// rule is needed.

function allArtifactsEffectivelyCompleteWithRunIntegrity(
  runFolder: string,
  stage: StageDefinition,
  allStages: StageDefinition[],
  stateFile: ArtifactStateFile,
  gate: RunIntegrityGateResult,
): boolean {
  const files = [stage.artifactFile, ...(stage.additionalArtifactFiles ?? [])];
  return files.every(
    (f) => resolveArtifactStateWithRunIntegrity(runFolder, f, allStages, stateFile, gate) === 'complete',
  );
}

export function getNextStageWithRunIntegrity(
  meta: RunMetadata,
  stateFile: ArtifactStateFile,
  gate: RunIntegrityGateResult,
): StageDefinition | null {
  for (const stage of meta.stages) {
    if (!allArtifactsEffectivelyCompleteWithRunIntegrity(meta.runFolder, stage, meta.stages, stateFile, gate)) {
      return stage;
    }
  }
  return null;
}

export function isRunCompleteWithRunIntegrity(
  meta: RunMetadata,
  stateFile: ArtifactStateFile,
  gate: RunIntegrityGateResult,
): boolean {
  return getNextStageWithRunIntegrity(meta, stateFile, gate) === null;
}

export function getArtifactLifecycleStatusesWithRunIntegrity(
  meta: RunMetadata,
  stateFile: ArtifactStateFile,
  gate: RunIntegrityGateResult,
): ArtifactLifecycleStatus[] {
  const statuses: ArtifactLifecycleStatus[] = [];
  for (const stage of meta.stages) {
    const files = [stage.artifactFile, ...(stage.additionalArtifactFiles ?? [])];
    for (const artifactFile of files) {
      const lifecycleState = resolveArtifactStateWithRunIntegrity(
        meta.runFolder,
        artifactFile,
        meta.stages,
        stateFile,
        gate,
      );
      const record = stateFile.artifacts[artifactFile];
      let reason: string | undefined;
      if (lifecycleState === 'stale') {
        reason = getStaleReason(meta.runFolder, artifactFile, meta.stages, stateFile);
      } else if (lifecycleState === 'blocked' || lifecycleState === 'incomplete') {
        reason = record?.reason ?? blockingReasonForArtifactFile(gate, meta.stages, artifactFile);
      }
      statuses.push({ stageName: stage.name, artifactFile, lifecycleState, reason });
    }
  }
  return statuses;
}

export function resolveCurrentArtifactStatesWithRunIntegrity(
  meta: RunMetadata,
  stateFile: ArtifactStateFile,
  stage: StageDefinition,
  gate: RunIntegrityGateResult,
): ArtifactLifecycleState[] {
  const files = [stage.artifactFile, ...(stage.additionalArtifactFiles ?? [])];
  return files.map((f) => resolveArtifactStateWithRunIntegrity(meta.runFolder, f, meta.stages, stateFile, gate));
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
