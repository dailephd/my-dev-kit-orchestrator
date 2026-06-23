import * as fs from 'fs';
import * as path from 'path';
import { StageDefinition } from './workflows';

export type ArtifactLifecycleState = 'missing' | 'incomplete' | 'blocked' | 'complete' | 'stale';
export type ManualArtifactLifecycleState = 'incomplete' | 'blocked' | 'complete';

export const MANUAL_STATES: readonly ManualArtifactLifecycleState[] = [
  'incomplete',
  'blocked',
  'complete',
];

export const FORBIDDEN_MANUAL_STATES = ['missing', 'stale'] as const;
export type ForbiddenManualState = (typeof FORBIDDEN_MANUAL_STATES)[number];

export interface ArtifactStateRecord {
  state: ManualArtifactLifecycleState;
  updatedAt: string;
  reason?: string;
  source?: string;
}

export interface ArtifactStateFile {
  version: '1';
  artifacts: Record<string, ArtifactStateRecord>;
}

export function getArtifactStatePath(runFolder: string): string {
  return path.join(runFolder, 'artifact-state.json');
}

export function readArtifactStateFile(runFolder: string): ArtifactStateFile {
  const statePath = getArtifactStatePath(runFolder);
  if (!fs.existsSync(statePath)) {
    return { version: '1', artifacts: {} };
  }
  let raw: string;
  try {
    raw = fs.readFileSync(statePath, 'utf8');
  } catch {
    return { version: '1', artifacts: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { version: '1', artifacts: {} };
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    !('artifacts' in parsed) ||
    typeof (parsed as ArtifactStateFile).artifacts !== 'object' ||
    (parsed as ArtifactStateFile).artifacts === null
  ) {
    return { version: '1', artifacts: {} };
  }
  return parsed as ArtifactStateFile;
}

export function writeArtifactStateFile(runFolder: string, stateFile: ArtifactStateFile): void {
  const statePath = getArtifactStatePath(runFolder);
  const tmpPath = statePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(stateFile, null, 2), 'utf8');
  fs.renameSync(tmpPath, statePath);
}

export function setArtifactManualState(
  runFolder: string,
  artifactKey: string,
  state: ManualArtifactLifecycleState,
  options: { reason?: string; now?: string } = {},
): void {
  const stateFile = readArtifactStateFile(runFolder);
  const record: ArtifactStateRecord = {
    state,
    updatedAt: options.now ?? new Date().toISOString(),
    source: 'manual',
  };
  if (options.reason !== undefined) {
    record.reason = options.reason;
  }
  stateFile.artifacts[artifactKey] = record;
  writeArtifactStateFile(runFolder, stateFile);
}

function getArtifactCompletionTime(
  runFolder: string,
  artifactFile: string,
  stateFile: ArtifactStateFile,
): Date | null {
  const record = stateFile.artifacts[artifactFile];
  if (record?.state === 'complete') {
    return new Date(record.updatedAt);
  }
  const filePath = path.join(runFolder, artifactFile);
  if (fs.existsSync(filePath)) {
    return fs.statSync(filePath).mtime;
  }
  return null;
}

export function getUpstreamArtifacts(
  stages: StageDefinition[],
  artifactFile: string,
): string[] {
  const stageIndex = stages.findIndex(
    (s) =>
      s.artifactFile === artifactFile ||
      (s.additionalArtifactFiles ?? []).includes(artifactFile),
  );
  if (stageIndex <= 0) return [];

  const upstream: string[] = [];
  for (let i = 0; i < stageIndex; i++) {
    upstream.push(stages[i].artifactFile);
    if (stages[i].additionalArtifactFiles) {
      upstream.push(...stages[i].additionalArtifactFiles!);
    }
  }
  return upstream;
}

export function isArtifactStale(
  runFolder: string,
  artifactFile: string,
  upstreamArtifactFiles: string[],
  stateFile: ArtifactStateFile,
): boolean {
  const myTime = getArtifactCompletionTime(runFolder, artifactFile, stateFile);
  if (myTime === null) return false;

  for (const upstream of upstreamArtifactFiles) {
    const upstreamTime = getArtifactCompletionTime(runFolder, upstream, stateFile);
    if (upstreamTime !== null && upstreamTime.getTime() > myTime.getTime()) {
      return true;
    }
  }
  return false;
}

export function resolveArtifactState(
  runFolder: string,
  artifactFile: string,
  stages: StageDefinition[],
  stateFile: ArtifactStateFile,
): ArtifactLifecycleState {
  const record = stateFile.artifacts[artifactFile];
  const fileExists = fs.existsSync(path.join(runFolder, artifactFile));

  if (record?.state === 'blocked') return 'blocked';
  if (!fileExists) return 'missing';
  if (record?.state === 'incomplete') return 'incomplete';

  const upstreams = getUpstreamArtifacts(stages, artifactFile);
  if (isArtifactStale(runFolder, artifactFile, upstreams, stateFile)) return 'stale';

  return 'complete';
}

export function getStaleReason(
  runFolder: string,
  artifactFile: string,
  stages: StageDefinition[],
  stateFile: ArtifactStateFile,
): string | undefined {
  const upstreams = getUpstreamArtifacts(stages, artifactFile);
  const myTime = getArtifactCompletionTime(runFolder, artifactFile, stateFile);
  if (myTime === null) return undefined;

  for (const upstream of upstreams) {
    const upstreamTime = getArtifactCompletionTime(runFolder, upstream, stateFile);
    if (upstreamTime !== null && upstreamTime.getTime() > myTime.getTime()) {
      return `${path.basename(upstream)} changed after ${path.basename(artifactFile)} was completed`;
    }
  }
  return undefined;
}

export function isManualState(value: string): value is ManualArtifactLifecycleState {
  return (MANUAL_STATES as readonly string[]).includes(value);
}

export function isForbiddenManualState(value: string): value is ForbiddenManualState {
  return (FORBIDDEN_MANUAL_STATES as readonly string[]).includes(value);
}
