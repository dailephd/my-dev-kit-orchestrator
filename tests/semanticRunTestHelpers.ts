// Shared fixtures for the v1.5.0 Batch 4 run-level Semantic Continuity tests.
// Builds real run folders (createRun with explicit semantic activation),
// ready repository context whose raw capsules carry RSP responsibility
// mappings, and canonical strategy / implementation / test-implementation /
// verification blocks. Not a test file itself.

import * as fs from 'fs';
import * as path from 'path';
import { createRun, RunMetadata } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { WorkflowMode } from '../src/types';
import { getWorkflow } from '../src/workflows';
import { findTestStrategySourceRequirement } from '../src/instructions/testResponsibilityCriticality';
import { evaluateRunIntegrityGate, RunIntegrityGateResult } from '../src/runIntegrityGate';
import { makeReadyRunFolder } from './readyContextTestHelpers';

export const UPSTREAM_TRACES = 'REQ-001: requirement one\nBEH-002: behavior two\n';

export function strategyBlock(id: string, opts: { criticality?: string; traces?: string } = {}): string {
  return [
    `test responsibility ID: ${id}`,
    ...(opts.criticality === '' ? [] : [`criticality: ${opts.criticality ?? 'critical'}`]),
    'responsibility: Reject malformed configuration',
    `traces to: ${opts.traces ?? 'REQ-001, BEH-002'}`,
    'setup: s',
    'action or trigger: a',
    'expected result: e',
    'test level: unit',
    '',
  ].join('\n');
}

export const implBlock = (id: string, file = 'src/a.ts'): string =>
  `implementation responsibility ID: ${id}\nproduction file: ${file}\n`;
export const testBlock = (id: string, file = 'tests/a.spec.ts'): string =>
  `test implementation responsibility ID: ${id}\ntest file: ${file}\n`;
export const verBlock = (id: string, status = 'pass', exit = '0'): string =>
  status === 'skipped' || status === 'blocked'
    ? `verification responsibility ID: ${id}\nverification status: ${status}\nreason: because\n`
    : `verification responsibility ID: ${id}\nverification status: ${status}\nverification evidence:\ncommand: npm test\nworking directory: .\nexit code: ${exit}\n`;

export function goodMapping(id: string): Record<string, unknown> {
  return {
    responsibilityId: id,
    mappingStatus: 'mapped',
    productionSymbols: [{ id: 'symbol:src/a.ts#run', itemKind: 'symbol', path: 'src/a.ts' }],
    proposedOrExistingTestFiles: [{ id: 'tests/a.spec.ts', itemKind: 'test-file', path: 'tests/a.spec.ts' }],
  };
}

function rawEvidenceJson(role: string, mappings: unknown[]): string {
  return JSON.stringify({
    schemaVersion: '1.0.0',
    tool: { name: 'my-dev-kit', version: '1.12.4' },
    index: { indexPath: '/idx', manifestPath: '/idx/manifest.json' },
    request: { role },
    roleContext: { role },
    roleAdequacy: { status: 'context sufficient for implementation' },
    freshness: { role, state: 'fresh', comparedIdentities: [{ label: 'afterIndexPath', value: '/idx' }] },
    responsibilityMappings: { mappings, truncated: false },
    truncation: { truncated: false, records: [] },
    fullFileFallback: { used: 0 },
    provenance: [{ id: 'p1' }],
    warnings: [],
  });
}

export interface SemanticRunOptions {
  mode?: WorkflowMode;
  // undefined -> default good content; null -> do not write the artifact
  strategy?: string | null;
  impl?: string | null;
  test?: string | null;
  ver?: string | null;
  upstream?: string | null;
  mappings?: unknown[];
  // undefined -> "1.0.0"; null -> no activation (legacy run)
  version?: string | null;
  proofOnly?: boolean;
}

function write(meta: RunMetadata, relative: string, content: string): void {
  const full = path.join(meta.runFolder, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function artifactOf(meta: RunMetadata, stageName: string): string | undefined {
  return meta.stages.find((s) => s.name === stageName)?.artifactFile;
}

export function makeSemanticRun(tmp: string, opts: SemanticRunOptions = {}): RunMetadata {
  const mode = opts.mode ?? 'feature';
  initWorkspace(tmp);
  const version = opts.version === null ? undefined : (opts.version ?? '1.0.0');
  const meta = createRun({
    request: 'semantic continuity run',
    mode,
    projectRoot: tmp,
    proofOnly: opts.proofOnly === true,
    ...(version !== undefined ? { semanticContinuityVersion: version } : {}),
  });
  makeReadyRunFolder(meta.runFolder, mode);

  // Ready-context raw evidence (capsule + audit kept identical) carrying the RSP mappings.
  const mappings = opts.mappings ?? [goodMapping('RSP-001')];
  for (const [kind, role] of [
    ['implementation', 'implementation'],
    ['test', 'test-implementation'],
  ] as const) {
    for (const suffix of ['capsule', 'audit']) {
      const file = path.join(meta.runFolder, `${kind}-${suffix}.json`);
      if (fs.existsSync(file)) fs.writeFileSync(file, rawEvidenceJson(role, mappings), 'utf8');
    }
  }

  const requirement = findTestStrategySourceRequirement(mode);
  // null removes the ready-context fixture's legacy strategy file.
  if (!requirement) {
    // greenfield has no strategy owner
  } else if (opts.strategy === null) fs.rmSync(path.join(meta.runFolder, requirement.strategyArtifactRelativePath), { force: true });
  else write(meta, requirement.strategyArtifactRelativePath, opts.strategy ?? strategyBlock('RSP-001'));
  if (opts.upstream !== null) write(meta, meta.stages[0].artifactFile, opts.upstream ?? UPSTREAM_TRACES);

  const implFile = artifactOf(meta, 'implementation');
  const testFile = artifactOf(meta, 'test-implementation');
  const verFile = artifactOf(meta, 'verification');
  if (implFile && opts.impl !== null) write(meta, implFile, opts.impl ?? implBlock('RSP-001'));
  if (testFile && opts.test !== null) write(meta, testFile, opts.test ?? testBlock('RSP-001'));
  if (verFile && opts.ver !== null) write(meta, verFile, opts.ver ?? verBlock('RSP-001'));
  return meta;
}

// Every native artifact before `stageName` that does not exist yet is written
// as "done", so lifecycle/eligibility logic sees a run that reached that stage.
export function writePriorArtifacts(meta: RunMetadata, stageName: string): void {
  const idx = meta.stages.findIndex((s) => s.name === stageName);
  for (const s of meta.stages.slice(0, idx)) {
    for (const f of [s.artifactFile, ...(s.additionalArtifactFiles ?? [])]) {
      if (!fs.existsSync(path.join(meta.runFolder, f))) write(meta, f, 'done');
    }
  }
  settleArtifactTimes(meta);
}

// Gives every existing stage artifact a strictly increasing mtime in workflow
// order so lifecycle staleness (older than an upstream artifact) never fires
// merely because fixtures were written in an arbitrary order.
export function settleArtifactTimes(meta: RunMetadata): void {
  const base = Date.now() / 1000 - 3600;
  let tick = 0;
  for (const s of meta.stages) {
    for (const f of [s.artifactFile, ...(s.additionalArtifactFiles ?? [])]) {
      const full = path.join(meta.runFolder, f);
      if (fs.existsSync(full)) {
        tick += 1;
        fs.utimesSync(full, base + tick, base + tick);
      }
    }
  }
}

export function gateAt(meta: RunMetadata, currentStage?: string): RunIntegrityGateResult {
  return evaluateRunIntegrityGate({
    mode: meta.mode,
    runFolder: meta.runFolder,
    workflowStageNames: meta.stages.map((s) => s.name),
    ...(currentStage !== undefined ? { currentStage } : {}),
    projectRoot: meta.projectRoot,
    semanticContinuityVersion: meta.semanticContinuityVersion,
    proofOnly: meta.proofOnly === true,
  });
}

export function stageNamesOf(mode: WorkflowMode): string[] {
  return getWorkflow(mode).stages.map((s) => s.name);
}
