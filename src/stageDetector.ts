import * as fs from 'fs';
import * as path from 'path';
import { RunMetadata } from './run';
import { StageDefinition } from './workflows';

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
