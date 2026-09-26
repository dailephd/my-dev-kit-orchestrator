// Shared fixtures for the v1.6.0 completeness-audit tests. Not a test file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RUN_TELEMETRY_VERSION, RunTelemetryObservations } from '../src/runTelemetry';
import { completeInvocation, createPendingInvocation } from '../src/runTelemetryStore';
import { makeSemanticRun, writePriorArtifacts } from './semanticRunTestHelpers';

export function withTmp<T>(fn: (tmp: string) => T): T {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orc-audit-'));
  try {
    return fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** The READY Semantic Continuity fixture (gate ready), with run telemetry activated. */
export function readyTelemetryRun(tmp: string) {
  const meta = makeSemanticRun(tmp, {});
  writePriorArtifacts(meta, 'judge');
  setRunTelemetryVersion(meta.runFolder, RUN_TELEMETRY_VERSION);
  return meta;
}

/** Rewrites run.json's runTelemetryVersion (undefined removes it). Test setup only. */
export function setRunTelemetryVersion(runFolder: string, version: string | undefined): void {
  const runJson = path.join(runFolder, 'run.json');
  const data = JSON.parse(fs.readFileSync(runJson, 'utf8'));
  if (version === undefined) delete data.runTelemetryVersion;
  else data.runTelemetryVersion = version;
  fs.writeFileSync(runJson, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function seedPending(tmp: string, runId: string): void {
  const created = createPendingInvocation(tmp, { runId, command: 'prompt' });
  if (!created.ok) throw new Error(created.error.message);
}

export function seedCompleted(tmp: string, runId: string, observations: Partial<RunTelemetryObservations>): void {
  const created = createPendingInvocation(tmp, { runId, command: 'mark' });
  if (!created.ok) throw new Error(created.error.message);
  const done = completeInvocation(tmp, created.value.record, {
    durationMs: 1,
    observations: { outcome: 'succeeded', mode: 'feature', stageCount: 5, ...observations },
  });
  if (!done.ok) throw new Error(done.error.message);
}
