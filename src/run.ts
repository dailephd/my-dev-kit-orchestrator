import * as fs from 'fs';
import * as path from 'path';
import { WorkflowMode } from './types';
import { getWorkflow, StageDefinition } from './workflows';
import { getRunsDir } from './workspace';
import { writeStagePrompts } from './promptGenerator';

export interface RunMetadata {
  runId: string;
  mode: WorkflowMode;
  request: string;
  projectRoot: string;
  runFolder: string;
  createdAt: string;
  currentStage: string;
  stages: StageDefinition[];
  status: 'created' | 'in_progress' | 'completed';
  sourceRepoRoot?: string;
  targetRepoRoot?: string;
}

function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function makeTimestampSlug(): string {
  const now = new Date();
  return (
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    'T' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0')
  );
}

export function makeRunId(request: string, name?: string): string {
  const ts = makeTimestampSlug();
  const requestSlug = sanitizeSlug(request).slice(0, 30) || 'run';
  if (name) {
    const nameSlug = sanitizeSlug(name);
    return `${ts}-${nameSlug}`;
  }
  return `${ts}-${requestSlug}`;
}

export function createRun(options: {
  request: string;
  mode: WorkflowMode;
  projectRoot: string;
  name?: string;
  outputDir?: string;
  sourceRepoRoot?: string;
  targetRepoRoot?: string;
}): RunMetadata {
  const { request, mode, projectRoot, name, outputDir, sourceRepoRoot, targetRepoRoot } = options;
  const runId = makeRunId(request, name);

  const baseDir = outputDir ?? getRunsDir(projectRoot);
  const runFolder = path.join(baseDir, runId);

  if (fs.existsSync(runFolder)) {
    throw new Error(`Run folder already exists: ${runFolder}`);
  }

  const workflow = getWorkflow(mode);
  const stages = workflow.stages;

  fs.mkdirSync(runFolder, { recursive: true });
  fs.mkdirSync(path.join(runFolder, 'prompts'), { recursive: true });
  fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(runFolder, 'reports'), { recursive: true });

  fs.writeFileSync(path.join(runFolder, '00-request.txt'), request, 'utf8');

  const meta: RunMetadata = {
    runId,
    mode,
    request,
    projectRoot,
    runFolder,
    createdAt: new Date().toISOString(),
    currentStage: stages[0].name,
    stages,
    status: 'created',
    ...(sourceRepoRoot !== undefined ? { sourceRepoRoot } : {}),
    ...(targetRepoRoot !== undefined ? { targetRepoRoot } : {}),
  };

  fs.writeFileSync(
    path.join(runFolder, 'run.json'),
    JSON.stringify(meta, null, 2),
    'utf8'
  );

  writeStagePrompts(meta);

  return meta;
}

export function loadRun(runFolder: string): RunMetadata {
  const metaPath = path.join(runFolder, 'run.json');
  if (!fs.existsSync(metaPath)) {
    throw new Error(`run.json not found in: ${runFolder}`);
  }
  const raw = fs.readFileSync(metaPath, 'utf8');
  return JSON.parse(raw) as RunMetadata;
}

export function getRunFolder(projectRoot: string, runId: string, outputDir?: string): string {
  const baseDir = outputDir ?? getRunsDir(projectRoot);
  return path.join(baseDir, runId);
}

export function listRunFolders(projectRoot: string, outputDir?: string): string[] {
  const baseDir = outputDir ?? getRunsDir(projectRoot);
  if (!fs.existsSync(baseDir)) return [];
  return fs.readdirSync(baseDir)
    .map((name) => path.join(baseDir, name))
    .filter((p) => fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'run.json')))
    .sort((a, b) => {
      const statA = fs.statSync(a).mtime.getTime();
      const statB = fs.statSync(b).mtime.getTime();
      return statB - statA;
    });
}

export function getMostRecentRun(projectRoot: string, outputDir?: string): RunMetadata | null {
  const folders = listRunFolders(projectRoot, outputDir);
  if (folders.length === 0) return null;
  try {
    return loadRun(folders[0]);
  } catch {
    return null;
  }
}
