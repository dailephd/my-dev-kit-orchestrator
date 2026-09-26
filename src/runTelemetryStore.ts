import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import {
  MAX_TELEMETRY_RECORD_BYTES,
  RUN_TELEMETRY_RECORD_KIND,
  RUN_TELEMETRY_VERSION,
  RunTelemetryActivation,
  RunTelemetryCommand,
  RunTelemetryObservations,
  RunTelemetryRecord,
  TelemetryDiagnostic,
  compareTelemetryRecords,
  generateInvocationId,
  getCompletedDir,
  getCompletedRecordPath,
  getPendingDir,
  getPendingRecordPath,
  getRunTelemetryDir,
  getTelemetryProducer,
  getTelemetryRoot,
  isPathInside,
  isValidDurationMs,
  isValidUtcIsoTimestamp,
  nowUtcIso,
  parseTelemetryRecord,
  resolveRunTelemetryActivation,
  serializeTelemetryRecord,
  TelemetryPathError,
} from './runTelemetry';

// Persistence and reading for native run telemetry (Batch 1).
//
// One file per invocation: telemetry/<run-id>/pending/<invocation-id>.json
// while incomplete, telemetry/<run-id>/invocations/<invocation-id>.json once
// completed. Files are created atomically without ever replacing an existing
// file, using a unique temporary name per operation. There is no shared
// append target, no shared fixed temp name, and no read-modify-write.
//
// Expected failures are returned as values so a later command wrapper can
// treat telemetry as non-blocking. Nothing here imports or influences
// RunIntegrityGate, judge integrity, artifact lifecycle, correction routing,
// or Semantic Continuity.

export type TelemetryErrorCode =
  | 'INVALID_INPUT'
  | 'UNSAFE_PATH'
  | 'INVOCATION_COLLISION'
  | 'PENDING_NOT_FOUND'
  | 'IO_ERROR';

export interface TelemetryError {
  code: TelemetryErrorCode;
  message: string;
}

export type TelemetryResult<T> = { ok: true; value: T } | { ok: false; error: TelemetryError };

function failure(code: TelemetryErrorCode, message: string): { ok: false; error: TelemetryError } {
  return { ok: false, error: { code, message } };
}

function toFailure(err: unknown): { ok: false; error: TelemetryError } {
  if (err instanceof TelemetryPathError) return failure('UNSAFE_PATH', err.message);
  if (err instanceof UnsafeDirectoryError) return failure('UNSAFE_PATH', err.message);
  if (err instanceof CollisionError) return failure('INVOCATION_COLLISION', err.message);
  return failure('IO_ERROR', err instanceof Error ? err.message : String(err));
}

class UnsafeDirectoryError extends Error {}
class CollisionError extends Error {}

// ─── Safe directory creation ──────────────────────────────────────────────────

// Creates `dir` (which must be inside the telemetry root) one component at a
// time, inspecting each component with lstat BEFORE descending or creating
// anything beneath it, so a symbolic link or junction planted at any level is
// refused without creating directories through it. A final realpath check
// confirms the result is still inside the real telemetry root.
function ensureSafeDirectory(projectRoot: string, dir: string): void {
  const root = path.resolve(getTelemetryRoot(projectRoot));
  const target = path.resolve(dir);
  if (target !== root && !isPathInside(root, target)) {
    throw new UnsafeDirectoryError('Telemetry directory is outside the telemetry root');
  }
  const steps = target === root ? [] : path.relative(root, target).split(path.sep);
  let current = root;
  for (let index = -1; index < steps.length; index += 1) {
    if (index >= 0) current = path.join(current, steps[index]);
    let stat: fs.Stats | undefined;
    try {
      stat = fs.lstatSync(current);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    if (stat === undefined) {
      fs.mkdirSync(current, { recursive: index < 0 });
      stat = fs.lstatSync(current);
    }
    if (stat.isSymbolicLink()) throw new UnsafeDirectoryError('Telemetry directory path contains a symbolic link');
    if (!stat.isDirectory()) throw new UnsafeDirectoryError('Telemetry directory path component is not a directory');
  }
  const realRoot = fs.realpathSync(root);
  const realDir = fs.realpathSync(target);
  if (realDir !== realRoot && !isPathInside(realRoot, realDir)) {
    throw new UnsafeDirectoryError('Telemetry directory resolves outside the telemetry root');
  }
}

// ─── Atomic no-overwrite create ───────────────────────────────────────────────

const FALLBACK_LINK_ERRORS = new Set(['EPERM', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'EMLINK']);

// Writes `content` to a unique temporary file beside `target`, then publishes
// it at `target` only if `target` does not exist (hard link, which fails with
// EEXIST instead of replacing). The temporary file created by this call is
// always removed by this call; no other file is touched. Where hard links are
// unsupported, falls back to an exclusive (`wx`) create, which still never
// replaces an existing file but exposes the content non-atomically.
function createFileExclusively(target: string, content: string): void {
  const temporary = `${target}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  const fd = fs.openSync(temporary, 'wx');
  try {
    try {
      fs.writeFileSync(fd, content, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    try {
      fs.linkSync(temporary, target);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') throw new CollisionError('A telemetry record already exists at this invocation path');
      if (code === undefined || !FALLBACK_LINK_ERRORS.has(code)) throw err;
      let exclusive: number;
      try {
        exclusive = fs.openSync(target, 'wx');
      } catch (openErr) {
        if ((openErr as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new CollisionError('A telemetry record already exists at this invocation path');
        }
        throw openErr;
      }
      try {
        fs.writeFileSync(exclusive, content, 'utf8');
        fs.fsyncSync(exclusive);
      } finally {
        fs.closeSync(exclusive);
      }
    }
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch {
      // The temporary file is ours alone; if it is already gone there is nothing to clean up.
    }
  }
}

// ─── Writers ──────────────────────────────────────────────────────────────────

export interface CreatePendingInvocationInput {
  runId: string;
  command: RunTelemetryCommand;
  /** Defaults to a fresh generated ID. Supplying one is for the caller that must reuse an ID it already holds. */
  invocationId?: string;
  /** Defaults to the current UTC wall-clock time. */
  startedAt?: string;
}

export interface WrittenTelemetryRecord {
  record: RunTelemetryRecord;
  /** Absolute path of the record file (informational; never re-read as an instruction). */
  path: string;
}

/** Creates a unique pending record. Never touches the run directory. Refuses to overwrite. */
export function createPendingInvocation(
  projectRoot: string,
  input: CreatePendingInvocationInput,
): TelemetryResult<WrittenTelemetryRecord> {
  try {
    const record: RunTelemetryRecord = {
      kind: RUN_TELEMETRY_RECORD_KIND,
      schemaVersion: RUN_TELEMETRY_VERSION,
      producer: getTelemetryProducer(),
      runId: input.runId,
      invocationId: input.invocationId ?? generateInvocationId(),
      command: input.command,
      state: 'pending',
      startedAt: input.startedAt ?? nowUtcIso(),
      observations: {},
    };
    const parsed = parseTelemetryRecord(record);
    if (!parsed.ok) return failure('INVALID_INPUT', parsed.diagnostics[0].message);

    const target = getPendingRecordPath(projectRoot, record.runId, record.invocationId);
    ensureSafeDirectory(projectRoot, getPendingDir(projectRoot, record.runId));
    createFileExclusively(target, serializeTelemetryRecord(record));
    return { ok: true, value: { record, path: target } };
  } catch (err) {
    return toFailure(err);
  }
}

export interface CompleteInvocationInput {
  /** UTC ISO 8601 wall-clock completion observation. Defaults to now. */
  completedAt?: string;
  /** Finite non-negative milliseconds from a monotonic measurement. */
  durationMs: number;
  /** Bounded terminal observations (must include outcome, mode, stageCount). */
  observations: RunTelemetryObservations;
}

export interface CompletedInvocationResult extends WrittenTelemetryRecord {
  /** True when the corresponding pending record existed and was removed after the completed record was persisted. */
  pendingRemoved: boolean;
}

/**
 * Creates the immutable completed record for `pending`, then removes only the
 * matching pending record. An existing completed record is never replaced. On
 * any failure the pending record is left untouched.
 */
export function completeInvocation(
  projectRoot: string,
  pending: RunTelemetryRecord,
  completion: CompleteInvocationInput,
): TelemetryResult<CompletedInvocationResult> {
  try {
    if (pending.state !== 'pending') return failure('INVALID_INPUT', 'Only a pending record can be completed');
    if (!isValidDurationMs(completion.durationMs)) return failure('INVALID_INPUT', 'durationMs must be a finite non-negative number');
    const completedAt = completion.completedAt ?? nowUtcIso();
    if (!isValidUtcIsoTimestamp(completedAt)) return failure('INVALID_INPUT', 'completedAt must be a UTC ISO 8601 timestamp');

    const record: RunTelemetryRecord = {
      kind: pending.kind,
      schemaVersion: pending.schemaVersion,
      producer: { name: pending.producer.name, version: pending.producer.version },
      runId: pending.runId,
      invocationId: pending.invocationId,
      command: pending.command,
      state: 'completed',
      startedAt: pending.startedAt,
      completedAt,
      durationMs: completion.durationMs,
      observations: completion.observations,
    };
    const parsed = parseTelemetryRecord(record);
    if (!parsed.ok) return failure('INVALID_INPUT', parsed.diagnostics[0].message);

    const target = getCompletedRecordPath(projectRoot, record.runId, record.invocationId);
    const pendingPath = getPendingRecordPath(projectRoot, record.runId, record.invocationId);
    ensureSafeDirectory(projectRoot, getCompletedDir(projectRoot, record.runId));
    createFileExclusively(target, serializeTelemetryRecord(record));

    let pendingRemoved = false;
    try {
      fs.unlinkSync(pendingPath);
      pendingRemoved = true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    return { ok: true, value: { record, path: target, pendingRemoved } };
  } catch (err) {
    return toFailure(err);
  }
}

// ─── Readers ──────────────────────────────────────────────────────────────────

export interface RunTelemetryReadResult {
  /** Accepted records in the documented deterministic order (see compareTelemetryRecords). */
  records: RunTelemetryRecord[];
  diagnostics: TelemetryDiagnostic[];
}

const RECORD_FILE_PATTERN = /^(inv-[0-9a-f]{32})\.json$/;

interface DirectoryRead {
  accepted: RunTelemetryRecord[];
  diagnostics: TelemetryDiagnostic[];
}

function readDirectory(
  dir: string,
  runId: string,
  expectedState: 'pending' | 'completed',
): DirectoryRead {
  const accepted: RunTelemetryRecord[] = [];
  const diagnostics: TelemetryDiagnostic[] = [];
  let names: string[];
  try {
    names = fs.readdirSync(dir).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { accepted, diagnostics };
    diagnostics.push({ code: 'UNREADABLE_RECORD', message: `Telemetry directory could not be read: ${(err as Error).message}` });
    return { accepted, diagnostics };
  }

  for (const name of names) {
    if (name.endsWith('.tmp')) continue; // in-flight or abandoned temporary file of some writer
    const match = RECORD_FILE_PATTERN.exec(name);
    if (!match) {
      diagnostics.push({ code: 'UNEXPECTED_FILE', message: 'Unexpected file in telemetry directory', file: name });
      continue;
    }
    const file = path.join(dir, name);
    let text: string;
    try {
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        diagnostics.push({ code: 'UNSAFE_RECORD_FILE', message: 'Telemetry record is not a regular file', file: name });
        continue;
      }
      if (stat.size > MAX_TELEMETRY_RECORD_BYTES) {
        diagnostics.push({ code: 'RECORD_TOO_LARGE', message: 'Telemetry record exceeds the size bound', file: name });
        continue;
      }
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      diagnostics.push({ code: 'UNREADABLE_RECORD', message: `Telemetry record could not be read: ${(err as Error).message}`, file: name });
      continue;
    }

    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      diagnostics.push({ code: 'MALFORMED_JSON', message: 'Telemetry record is not valid JSON', file: name });
      continue;
    }

    const parsed = parseTelemetryRecord(value, { runId, invocationId: match[1] });
    if (!parsed.ok) {
      for (const diagnostic of parsed.diagnostics) diagnostics.push({ ...diagnostic, file: name });
      continue;
    }
    if (parsed.record.state !== expectedState) {
      diagnostics.push({
        code: 'STATE_LOCATION_MISMATCH',
        message: `A ${parsed.record.state} record was found in the ${expectedState} location`,
        file: name,
      });
      continue;
    }
    accepted.push(parsed.record);
  }
  return { accepted, diagnostics };
}

/**
 * Reads every telemetry record of one run, validating each. Pure with respect
 * to workflow state. A missing telemetry directory is valid and empty. When the
 * same invocationId is present as both pending and completed (a crash between
 * the completed write and the pending removal), the completed record is
 * accepted and the pending copy is rejected with DUPLICATE_INVOCATION_ID.
 */
export function readRunTelemetryRecords(projectRoot: string, runId: string): TelemetryResult<RunTelemetryReadResult> {
  try {
    getRunTelemetryDir(projectRoot, runId); // validates runId as a safe segment
    const completed = readDirectory(getCompletedDir(projectRoot, runId), runId, 'completed');
    const pending = readDirectory(getPendingDir(projectRoot, runId), runId, 'pending');

    const diagnostics = [...completed.diagnostics, ...pending.diagnostics];
    const completedIds = new Set(completed.accepted.map((record) => record.invocationId));
    const records = [...completed.accepted];
    for (const record of pending.accepted) {
      if (completedIds.has(record.invocationId)) {
        diagnostics.push({
          code: 'DUPLICATE_INVOCATION_ID',
          message: 'Invocation is present as both pending and completed; the completed record is used',
          file: `${record.invocationId}.json`,
        });
      } else {
        records.push(record);
      }
    }
    records.sort(compareTelemetryRecords);
    return { ok: true, value: { records, diagnostics } };
  } catch (err) {
    return toFailure(err);
  }
}

export interface RunTelemetryView extends RunTelemetryReadResult {
  activation: RunTelemetryActivation;
}

/**
 * Activation-aware read. Activation comes only from run metadata: a legacy run
 * (no field) reads nothing and requires nothing; an unsupported present value
 * is reported without reading; a supported value with no records is valid and
 * empty. Never throws and never affects workflow state.
 */
export function readRunTelemetry(run: {
  projectRoot: string;
  runId: string;
  runTelemetryVersion?: string;
}): RunTelemetryView {
  const activation = resolveRunTelemetryActivation(run.runTelemetryVersion);
  if (activation === 'not-required') return { activation, records: [], diagnostics: [] };
  if (activation === 'unsupported') {
    return {
      activation,
      records: [],
      diagnostics: [{ code: 'UNSUPPORTED_RUN_TELEMETRY_VERSION', message: 'run.json declares an unsupported runTelemetryVersion' }],
    };
  }
  const result = readRunTelemetryRecords(run.projectRoot, run.runId);
  if (!result.ok) {
    return { activation, records: [], diagnostics: [{ code: 'UNREADABLE_RECORD', message: result.error.message }] };
  }
  return { activation, ...result.value };
}
