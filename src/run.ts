import * as fs from 'fs';
import * as path from 'path';
import { WorkflowMode } from './types';
import { getWorkflow, StageDefinition } from './workflows';
import { getRunsDir } from './workspace';
import { writeStagePrompts } from './promptGenerator';
import { reconcileRunLifecycle } from './runLifecycle';
import type { RunEcosystemRequirementsDocumentV1 } from './ecosystemEvidenceContracts';
import { assertEcosystemPathSafety, assertEcosystemRunFolderIdentity, EcosystemEvidenceError, hasEcosystemActivation, initializeRunEcosystemEvidence, prepareRunEcosystemRequirements, verifyRunEcosystemInitialization } from './ecosystemEvidenceStore';

export interface RunMetadata {
  ecosystemEvidenceVersion?: '1.0.0';
  ecosystemRequirementsSha256?: string;
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
  proofOnly?: boolean;
  verificationResponsibility?: string;
  // Explicit, versioned Semantic Continuity activation (v1.5.0 Batch 4).
  // Absent means legacy behavior; never inferred from artifact contents.
  semanticContinuityVersion?: string;
  // Explicit, versioned run-telemetry activation (v1.6.0 ORC-TELEMETRY).
  // Absent means legacy (telemetry not required); never inferred from files.
  runTelemetryVersion?: string;
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
  ecosystemRequirementsDocument?: RunEcosystemRequirementsDocumentV1;
  request: string;
  mode: WorkflowMode;
  projectRoot: string;
  name?: string;
  outputDir?: string;
  sourceRepoRoot?: string;
  targetRepoRoot?: string;
  proofOnly?: boolean;
  verificationResponsibility?: string;
  // Persisted only when explicitly supplied. createRun() never activates
  // semantic continuity on its own: the `start` command supplies it for
  // semantic-capable staged runs, and programmatic callers that omit it create
  // legacy (absent-version) runs.
  semanticContinuityVersion?: string;
  // Persisted only when explicitly supplied, like semanticContinuityVersion:
  // createRun() never activates telemetry on its own, so bare/programmatic
  // callers keep the historical run.json key set.
  runTelemetryVersion?: string;
}): RunMetadata {
  // Runtime JS callers cannot forge the derived persisted activation fields.
  if (Object.prototype.hasOwnProperty.call(options, 'ecosystemEvidenceVersion') || Object.prototype.hasOwnProperty.call(options, 'ecosystemRequirementsSha256')) {
    throw new EcosystemEvidenceError('ECO_RECORD_INVALID');
  }
  const ecosystemRequirementsBytes = options.ecosystemRequirementsDocument !== undefined
    ? prepareRunEcosystemRequirements(options.ecosystemRequirementsDocument)
    : undefined;
  try {
    const { request, mode, projectRoot, name, outputDir, sourceRepoRoot, targetRepoRoot } = options;
    const runId = makeRunId(request, name);

    const baseDir = outputDir ?? getRunsDir(projectRoot);
    const runFolder = path.join(baseDir, runId);

    if (fs.existsSync(runFolder)) {
      throw new Error(`Run folder already exists: ${runFolder}`);
    }

    const workflow = getWorkflow(mode);
    const stages = workflow.stages;

    if (ecosystemRequirementsBytes !== undefined) {
      assertEcosystemPathSafety(runFolder, false);
      fs.mkdirSync(baseDir, { recursive: true });
      // Exclusive directory creation preserves the collision contract even if
      // another creator wins between existsSync and mkdirSync.
      fs.mkdirSync(runFolder);
    } else {
      fs.mkdirSync(runFolder, { recursive: true });
    }
    fs.mkdirSync(path.join(runFolder, 'prompts'), { recursive: true });
    fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });
    fs.mkdirSync(path.join(runFolder, 'reports'), { recursive: true });

    fs.writeFileSync(path.join(runFolder, '00-request.txt'), request, 'utf8');

    const meta: RunMetadata = {
      ...(ecosystemRequirementsBytes !== undefined ? { ecosystemEvidenceVersion: '1.0.0' as const } : {}),
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
      proofOnly: options.proofOnly === true,
      ...(options.verificationResponsibility !== undefined ? { verificationResponsibility: options.verificationResponsibility } : {}),
      ...(options.semanticContinuityVersion !== undefined ? { semanticContinuityVersion: options.semanticContinuityVersion } : {}),
      ...(options.runTelemetryVersion !== undefined ? { runTelemetryVersion: options.runTelemetryVersion } : {}),
    };

    fs.writeFileSync(
      path.join(runFolder, 'run.json'),
      JSON.stringify(meta, null, 2),
      'utf8'
    );

    // The initial metadata deliberately declares activation without a digest.
    // If initialization fails, readers/gate block the incomplete run; no repair,
    // legacy downgrade or broad rollback is performed.
    if (ecosystemRequirementsBytes !== undefined) {
      Object.assign(meta, initializeRunEcosystemEvidence(runFolder, ecosystemRequirementsBytes));
      fs.writeFileSync(path.join(runFolder, 'run.json'), JSON.stringify(meta, null, 2), 'utf8');
      writeStagePrompts(meta);
      verifyRunEcosystemInitialization(runFolder, meta);
    } else {
      writeStagePrompts(meta);
    }

    return meta;
  } catch (error) {
    if (ecosystemRequirementsBytes !== undefined && !(error instanceof EcosystemEvidenceError)) {
      throw new EcosystemEvidenceError('ECO_RECORD_INVALID');
    }
    throw error;
  }
}

export function loadRun(runFolder: string): RunMetadata {
  const metaPath = path.join(runFolder, 'run.json');
  if (!fs.existsSync(metaPath)) {
    throw new Error(`run.json not found in: ${runFolder}`);
  }
  const raw = fs.readFileSync(metaPath, 'utf8');
  const meta = JSON.parse(raw) as RunMetadata;
  if (hasEcosystemActivation(meta)) assertEcosystemRunFolderIdentity(runFolder, meta.runFolder);
  return reconcileRunLifecycle(meta);
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
