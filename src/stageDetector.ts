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

export function getArtifactStatuses(meta: RunMetadata): ArtifactStatus[] {
  return meta.stages.map((stage) => ({
    stageName: stage.name,
    artifactFile: stage.artifactFile,
    present: fs.existsSync(path.join(meta.runFolder, stage.artifactFile)),
  }));
}

export function getNextStage(meta: RunMetadata): StageDefinition | null {
  const statuses = getArtifactStatuses(meta);
  for (let i = 0; i < statuses.length; i++) {
    if (!statuses[i].present) {
      return meta.stages[i];
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
    const artifactPath = path.join(meta.runFolder, meta.stages[i].artifactFile);
    if (!fs.existsSync(artifactPath)) {
      missing.push(meta.stages[i].artifactFile);
    }
  }
  return missing;
}
