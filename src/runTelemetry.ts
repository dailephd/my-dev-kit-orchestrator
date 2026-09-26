import * as crypto from 'crypto';
import * as path from 'path';
import packageJson from '../package.json';
import { getWorkspaceRoot } from './workspace';

// Native Orchestrator run-telemetry contract (v1.6.0 ORC-TELEMETRY, Batch 1).
//
// This is an Orchestrator-owned observational contract. It is NOT the generic
// ecosystem evidence contract (no EvidenceEnvelopeV1 semantics), it is never
// read by RunIntegrityGate, judge integrity, artifact lifecycle, correction
// routing, or Semantic Continuity, and it can never change workflow state.
//
// Two version namespaces stay separate: the package version (producer
// identity, recorded verbatim) and RUN_TELEMETRY_VERSION (this contract).

/** Activation value for `run.json#runTelemetryVersion` and the record schema version. */
export const RUN_TELEMETRY_VERSION = '1.0.0';

/** Native artifact identity of one invocation record. */
export const RUN_TELEMETRY_RECORD_KIND = 'my-dev-kit-orchestrator/run-telemetry-invocation';

/** Commands whose interactions v1.6.0 records (see ROADMAP "Recorded command boundary"). */
export const RUN_TELEMETRY_COMMANDS = ['start', 'prompt', 'mark'] as const;
export type RunTelemetryCommand = (typeof RUN_TELEMETRY_COMMANDS)[number];

/** Finite invocation lifecycle. A pending record is incomplete, never inferred success or failure. */
export const RUN_TELEMETRY_STATES = ['pending', 'completed'] as const;
export type RunTelemetryState = (typeof RUN_TELEMETRY_STATES)[number];

/** Workspace directory (beside `runs/`) that owns all telemetry. Must not match /semantic|rsp-state/i. */
export const TELEMETRY_DIR = 'telemetry';
export const TELEMETRY_PENDING_DIR = 'pending';
export const TELEMETRY_INVOCATIONS_DIR = 'invocations';

/** Bounds. A record is a few hundred bytes; anything larger is rejected unread. */
export const MAX_TELEMETRY_RECORD_BYTES = 8192;
export const MAX_TELEMETRY_SEGMENT_LENGTH = 128;
const MAX_PRODUCER_FIELD_LENGTH = 214;

export interface RunTelemetryProducer {
  name: string;
  version: string;
}

/**
 * Bounded observation payload reserved for later batches. Batch 1 defines it as
 * an empty object; unknown keys are rejected, so later batches must add
 * explicit typed fields rather than free-form metadata.
 */
export type RunTelemetryObservations = Record<string, never>;

export interface RunTelemetryRecord {
  kind: typeof RUN_TELEMETRY_RECORD_KIND;
  schemaVersion: typeof RUN_TELEMETRY_VERSION;
  producer: RunTelemetryProducer;
  runId: string;
  invocationId: string;
  command: RunTelemetryCommand;
  state: RunTelemetryState;
  /** UTC ISO 8601 wall-clock observation (YYYY-MM-DDTHH:mm:ss.sssZ). */
  startedAt: string;
  /** Present only when state is `completed`. UTC ISO 8601 wall-clock observation. */
  completedAt?: string;
  /** Present only when state is `completed`. Finite, non-negative milliseconds from a monotonic measurement. */
  durationMs?: number;
  observations: RunTelemetryObservations;
}

// ─── Producer identity ────────────────────────────────────────────────────────

export function getTelemetryProducer(): RunTelemetryProducer {
  return { name: packageJson.name, version: packageJson.version };
}

// ─── Invocation identity ──────────────────────────────────────────────────────

const INVOCATION_ID_PATTERN = /^inv-[0-9a-f]{32}$/;

/**
 * Fresh, opaque, non-deterministic invocation identity: `inv-` plus 128 random
 * bits as lowercase hex. It depends on no timestamp, path, runId, RSP ID,
 * project identity, or process state, and is a safe single path segment.
 */
export function generateInvocationId(): string {
  return `inv-${crypto.randomBytes(16).toString('hex')}`;
}

export function isValidInvocationId(value: unknown): value is string {
  return typeof value === 'string' && INVOCATION_ID_PATTERN.test(value);
}

// ─── Clocks ───────────────────────────────────────────────────────────────────

/** UTC ISO 8601 wall-clock observation. Never part of any identity. */
export function nowUtcIso(now: Date = new Date()): string {
  return now.toISOString();
}

export interface MonotonicTimer {
  /** Milliseconds elapsed since the timer started, from a monotonic clock. */
  elapsedMs(): number;
}

export function startMonotonicTimer(): MonotonicTimer {
  const start = process.hrtime.bigint();
  return { elapsedMs: () => Number(process.hrtime.bigint() - start) / 1e6 };
}

// ─── Activation ───────────────────────────────────────────────────────────────

export type RunTelemetryActivation = 'not-required' | 'active' | 'unsupported';

/** Explicit activation from run metadata only. Never inferred from files. */
export function resolveRunTelemetryActivation(version: string | undefined): RunTelemetryActivation {
  if (version === undefined) return 'not-required';
  return version === RUN_TELEMETRY_VERSION ? 'active' : 'unsupported';
}

// ─── Path ownership ───────────────────────────────────────────────────────────

// One conservative segment grammar for both runId and invocationId: starts
// alphanumeric, then alphanumerics, dot, underscore, hyphen. This excludes
// separators, drive colons, and leading dots by construction.
const SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Returns a reason string when the value is not a safe single path segment, else undefined. */
export function describeUnsafeTelemetrySegment(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return 'segment must be a non-empty string';
  if (value.length > MAX_TELEMETRY_SEGMENT_LENGTH) return 'segment is too long';
  if (!SEGMENT_PATTERN.test(value)) return 'segment contains characters outside [A-Za-z0-9._-] or does not start alphanumeric';
  if (value.includes('..')) return 'segment contains a parent-directory sequence';
  if (/[. ]$/.test(value)) return 'segment ends with a dot or space';
  if (WINDOWS_RESERVED.test(value)) return 'segment is a reserved device name';
  return undefined;
}

export class TelemetryPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelemetryPathError';
  }
}

function assertSegment(label: string, value: unknown): string {
  const reason = describeUnsafeTelemetrySegment(value);
  if (reason !== undefined) throw new TelemetryPathError(`Unsafe telemetry ${label}: ${reason}`);
  return value as string;
}

/** Real path-semantics containment (not a string-prefix check). */
export function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative === '') return false;
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function getTelemetryRoot(projectRoot: string): string {
  return path.join(getWorkspaceRoot(projectRoot), TELEMETRY_DIR);
}

export function getRunTelemetryDir(projectRoot: string, runId: string): string {
  const root = getTelemetryRoot(projectRoot);
  const dir = path.join(root, assertSegment('runId', runId));
  if (!isPathInside(root, dir)) throw new TelemetryPathError('Telemetry run directory escapes the telemetry root');
  return dir;
}

export function getPendingDir(projectRoot: string, runId: string): string {
  return path.join(getRunTelemetryDir(projectRoot, runId), TELEMETRY_PENDING_DIR);
}

export function getCompletedDir(projectRoot: string, runId: string): string {
  return path.join(getRunTelemetryDir(projectRoot, runId), TELEMETRY_INVOCATIONS_DIR);
}

function recordPath(dir: string, projectRoot: string, invocationId: string): string {
  if (!isValidInvocationId(invocationId)) throw new TelemetryPathError('Unsafe telemetry invocationId: invalid format');
  const file = path.join(dir, `${invocationId}.json`);
  if (!isPathInside(getTelemetryRoot(projectRoot), file)) {
    throw new TelemetryPathError('Telemetry record path escapes the telemetry root');
  }
  return file;
}

export function getPendingRecordPath(projectRoot: string, runId: string, invocationId: string): string {
  return recordPath(getPendingDir(projectRoot, runId), projectRoot, invocationId);
}

export function getCompletedRecordPath(projectRoot: string, runId: string, invocationId: string): string {
  return recordPath(getCompletedDir(projectRoot, runId), projectRoot, invocationId);
}

// ─── Validation ───────────────────────────────────────────────────────────────

export type TelemetryDiagnosticCode =
  | 'MALFORMED_JSON'
  | 'MALFORMED_RECORD'
  | 'UNSUPPORTED_TELEMETRY_VERSION'
  | 'UNSUPPORTED_RECORD_KIND'
  | 'UNKNOWN_PROPERTY'
  | 'RUN_ID_MISMATCH'
  | 'INVOCATION_ID_MISMATCH'
  | 'INVALID_INVOCATION_ID'
  | 'INVALID_COMMAND'
  | 'INVALID_STATE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_DURATION'
  | 'INVALID_PRODUCER'
  | 'MISSING_COMPLETED_FIELD'
  | 'UNEXPECTED_COMPLETED_FIELD'
  | 'STATE_LOCATION_MISMATCH'
  | 'DUPLICATE_INVOCATION_ID'
  | 'RECORD_TOO_LARGE'
  | 'UNSAFE_RECORD_FILE'
  | 'UNEXPECTED_FILE'
  | 'UNSUPPORTED_RUN_TELEMETRY_VERSION'
  | 'UNREADABLE_RECORD';

export interface TelemetryDiagnostic {
  code: TelemetryDiagnosticCode;
  message: string;
  /** Record file name (basename only, never an absolute path) when the diagnostic concerns one file. */
  file?: string;
}

export type ParseTelemetryRecordResult =
  | { ok: true; record: RunTelemetryRecord }
  | { ok: false; diagnostics: TelemetryDiagnostic[] };

const TOP_LEVEL_KEYS = [
  'kind', 'schemaVersion', 'producer', 'runId', 'invocationId', 'command', 'state',
  'startedAt', 'completedAt', 'durationMs', 'observations',
];
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidUtcIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_UTC_PATTERN.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

export function isValidDurationMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * The one canonical validator. Pure: no I/O. `expectedRunId` and
 * `expectedInvocationId` (from the run and file name) are cross-checked when supplied.
 */
export function parseTelemetryRecord(
  value: unknown,
  expected: { runId?: string; invocationId?: string } = {},
): ParseTelemetryRecordResult {
  const fail = (code: TelemetryDiagnosticCode, message: string): ParseTelemetryRecordResult =>
    ({ ok: false, diagnostics: [{ code, message }] });

  if (!isPlainObject(value)) return fail('MALFORMED_RECORD', 'Telemetry record must be a JSON object');
  if (value.kind !== RUN_TELEMETRY_RECORD_KIND) return fail('UNSUPPORTED_RECORD_KIND', 'Unrecognized telemetry record kind');
  if (value.schemaVersion !== RUN_TELEMETRY_VERSION) {
    return fail('UNSUPPORTED_TELEMETRY_VERSION', 'Unsupported telemetry schema version');
  }

  const unknown = Object.keys(value).filter((key) => !TOP_LEVEL_KEYS.includes(key));
  if (unknown.length > 0) return fail('UNKNOWN_PROPERTY', `Unknown telemetry property: ${unknown.sort()[0]}`);

  const producer = value.producer;
  if (
    !isPlainObject(producer) ||
    Object.keys(producer).some((key) => key !== 'name' && key !== 'version') ||
    typeof producer.name !== 'string' || producer.name.length === 0 || producer.name.length > MAX_PRODUCER_FIELD_LENGTH ||
    typeof producer.version !== 'string' || producer.version.length === 0 || producer.version.length > MAX_PRODUCER_FIELD_LENGTH
  ) {
    return fail('INVALID_PRODUCER', 'producer must be exactly {name, version} with bounded non-empty strings');
  }

  if (describeUnsafeTelemetrySegment(value.runId) !== undefined) return fail('MALFORMED_RECORD', 'runId is not a safe path segment');
  if (expected.runId !== undefined && value.runId !== expected.runId) return fail('RUN_ID_MISMATCH', 'Record runId does not match the run');

  if (!isValidInvocationId(value.invocationId)) return fail('INVALID_INVOCATION_ID', 'invocationId has an invalid format');
  if (expected.invocationId !== undefined && value.invocationId !== expected.invocationId) {
    return fail('INVOCATION_ID_MISMATCH', 'Record invocationId does not match its file name');
  }

  if (!(RUN_TELEMETRY_COMMANDS as readonly unknown[]).includes(value.command)) {
    return fail('INVALID_COMMAND', 'command is not a recorded command');
  }
  if (!(RUN_TELEMETRY_STATES as readonly unknown[]).includes(value.state)) return fail('INVALID_STATE', 'state is not a known invocation state');
  if (!isValidUtcIsoTimestamp(value.startedAt)) return fail('INVALID_TIMESTAMP', 'startedAt must be a UTC ISO 8601 timestamp');

  if (value.state === 'completed') {
    if (value.completedAt === undefined) return fail('MISSING_COMPLETED_FIELD', 'completed record requires completedAt');
    if (value.durationMs === undefined) return fail('MISSING_COMPLETED_FIELD', 'completed record requires durationMs');
    if (!isValidUtcIsoTimestamp(value.completedAt)) return fail('INVALID_TIMESTAMP', 'completedAt must be a UTC ISO 8601 timestamp');
    if (!isValidDurationMs(value.durationMs)) return fail('INVALID_DURATION', 'durationMs must be a finite non-negative number');
  } else if (value.completedAt !== undefined || value.durationMs !== undefined) {
    return fail('UNEXPECTED_COMPLETED_FIELD', 'pending record must not carry completedAt or durationMs');
  }

  if (!isPlainObject(value.observations) || Object.keys(value.observations).length > 0) {
    return fail('UNKNOWN_PROPERTY', 'observations must be an empty object in telemetry schema 1.0.0 (Batch 1)');
  }

  return { ok: true, record: value as unknown as RunTelemetryRecord };
}

/** Deterministic ordering: startedAt ascending, then invocationId (code-point order). Not a causal order. */
export function compareTelemetryRecords(a: RunTelemetryRecord, b: RunTelemetryRecord): number {
  if (a.startedAt !== b.startedAt) return a.startedAt < b.startedAt ? -1 : 1;
  if (a.invocationId !== b.invocationId) return a.invocationId < b.invocationId ? -1 : 1;
  return 0;
}

/** Canonical serialization: fixed key order, 2-space indent, trailing newline. */
export function serializeTelemetryRecord(record: RunTelemetryRecord): string {
  const ordered: Record<string, unknown> = {
    kind: record.kind,
    schemaVersion: record.schemaVersion,
    producer: { name: record.producer.name, version: record.producer.version },
    runId: record.runId,
    invocationId: record.invocationId,
    command: record.command,
    state: record.state,
    startedAt: record.startedAt,
  };
  if (record.completedAt !== undefined) ordered.completedAt = record.completedAt;
  if (record.durationMs !== undefined) ordered.durationMs = record.durationMs;
  ordered.observations = {};
  return `${JSON.stringify(ordered, null, 2)}\n`;
}
