import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import packageJson from '../package.json';
import { createRun, loadRun } from '../src/run';
import { initWorkspace } from '../src/workspace';
import {
  RUN_TELEMETRY_RECORD_KIND,
  RUN_TELEMETRY_VERSION,
  RunTelemetryRecord,
  compareTelemetryRecords,
  describeUnsafeTelemetrySegment,
  generateInvocationId,
  getCompletedRecordPath,
  getPendingRecordPath,
  getRunTelemetryDir,
  getTelemetryProducer,
  getTelemetryRoot,
  isPathInside,
  isValidInvocationId,
  parseTelemetryRecord,
  resolveRunTelemetryActivation,
  serializeTelemetryRecord,
  startMonotonicTimer,
} from '../src/runTelemetry';
import { runCli } from './cliTestHelpers';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-telemetry-'));
}

const INV = 'inv-0123456789abcdef0123456789abcdef';

function pending(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: RUN_TELEMETRY_RECORD_KIND,
    schemaVersion: RUN_TELEMETRY_VERSION,
    producer: { name: packageJson.name, version: packageJson.version },
    runId: 'run-1',
    invocationId: INV,
    command: 'prompt',
    state: 'pending',
    startedAt: '2026-01-02T03:04:05.006Z',
    observations: {},
    ...overrides,
  };
}

function completed(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return pending({ state: 'completed', completedAt: '2026-01-02T03:04:06.000Z', durationMs: 12.5, ...overrides });
}

describe('run metadata activation compatibility (runTelemetryVersion)', () => {
  it('bare createRun keeps the exact historical run.json key set', () => {
    const tmp = tmpDir();
    try {
      const meta = createRun({ request: 'test request', mode: 'feature', projectRoot: tmp });
      const keys = Object.keys(JSON.parse(fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8'))).sort();
      expect(keys).toEqual(['createdAt', 'currentStage', 'mode', 'projectRoot', 'proofOnly', 'request', 'runFolder', 'runId', 'stages', 'status']);
      expect(fs.existsSync(getTelemetryRoot(tmp))).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('explicit activation persists runTelemetryVersion 1.0.0 and creates no telemetry files', () => {
    const tmp = tmpDir();
    try {
      const meta = createRun({ request: 'x', mode: 'feature', projectRoot: tmp, runTelemetryVersion: RUN_TELEMETRY_VERSION });
      const persisted = JSON.parse(fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8'));
      expect(persisted.runTelemetryVersion).toBe('1.0.0');
      expect(fs.existsSync(getTelemetryRoot(tmp))).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('the start command activates telemetry, but writes no telemetry records yet', () => {
    const tmp = tmpDir();
    try {
      runCli(['start', 'a request', '--root', tmp]);
      const runsDir = path.join(tmp, '.my-dev-kit-orchestrator', 'runs');
      const [runId] = fs.readdirSync(runsDir);
      const persisted = JSON.parse(fs.readFileSync(path.join(runsDir, runId, 'run.json'), 'utf8'));
      expect(persisted.runTelemetryVersion).toBe('1.0.0');
      expect(fs.existsSync(getTelemetryRoot(tmp))).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a legacy run without the field still loads and the version is never inferred', () => {
    const tmp = tmpDir();
    try {
      initWorkspace(tmp);
      const meta = createRun({ request: 'legacy', mode: 'feature', projectRoot: tmp });
      const loaded = loadRun(meta.runFolder);
      expect('runTelemetryVersion' in loaded).toBe(false);
      expect('runTelemetryVersion' in JSON.parse(fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8'))).toBe(false);
      expect(resolveRunTelemetryActivation(undefined)).toBe('not-required');
      expect(resolveRunTelemetryActivation('1.0.0')).toBe('active');
      expect(resolveRunTelemetryActivation('2.0.0')).toBe('unsupported');
      expect(resolveRunTelemetryActivation('')).toBe('unsupported');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('invocation identity', () => {
  it('has a bounded, path-safe format', () => {
    const id = generateInvocationId();
    expect(id).toMatch(/^inv-[0-9a-f]{32}$/);
    expect(id.length).toBe(36);
    expect(isValidInvocationId(id)).toBe(true);
    expect(describeUnsafeTelemetrySegment(id)).toBeUndefined();
  });

  it('is unique across a large batch and takes no time/path/runId input', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20000; i += 1) seen.add(generateInvocationId());
    expect(seen.size).toBe(20000);
    expect(generateInvocationId.length).toBe(0);
  });

  it('rejects malformed identities', () => {
    const bad: unknown[] = ['', 'inv-', 'INV-0123456789abcdef0123456789abcdef', `${INV}0`, '../x', INV.replace('inv', 'run'), 5, null];
    for (const value of bad) expect(isValidInvocationId(value)).toBe(false);
  });
});

describe('producer identity and clocks', () => {
  it('records package name/version separately from the telemetry schema version', () => {
    expect(getTelemetryProducer()).toEqual({ name: '@dailephd/my-dev-kit-orchestrator', version: packageJson.version });
    expect(RUN_TELEMETRY_VERSION).toBe('1.0.0');
  });

  it('monotonic timer is finite and non-negative', () => {
    const elapsed = startMonotonicTimer().elapsedMs();
    expect(Number.isFinite(elapsed)).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });
});

describe('telemetry path safety', () => {
  const hostile = [
    '..', '../x', 'a/../b', '..\\..\\x', 'a/b', 'a\\b', '/etc/passwd', 'C:\\Windows\\x', 'C:/x', '\\\\server\\share',
    './x', '.hidden', 'a..b', 'trail.', 'trail ', 'CON', 'nul.txt', '', 'a\u0000b', 'x'.repeat(200),
  ];

  it.each(hostile)('rejects unsafe segment %j', (segment) => {
    expect(describeUnsafeTelemetrySegment(segment)).toBeDefined();
    expect(() => getRunTelemetryDir('/proj', segment)).toThrow();
  });

  it('rejects unsafe invocation IDs for record paths', () => {
    for (const bad of ['../evil', 'a/b', '/abs', 'C:\\abs']) {
      expect(() => getPendingRecordPath('/proj', 'run-1', bad)).toThrow();
      expect(() => getCompletedRecordPath('/proj', 'run-1', bad)).toThrow();
    }
  });

  it('accepts real run IDs and keeps every path under the telemetry root', () => {
    const projectRoot = path.resolve('proj-x');
    const root = path.join(projectRoot, '.my-dev-kit-orchestrator', 'telemetry');
    expect(getTelemetryRoot(projectRoot)).toBe(root);
    for (const runId of ['20260926T081500-add-login', 'run_1.2-x']) {
      for (const p of [getRunTelemetryDir(projectRoot, runId), getPendingRecordPath(projectRoot, runId, INV), getCompletedRecordPath(projectRoot, runId, INV)]) {
        expect(isPathInside(root, p)).toBe(true);
      }
    }
    expect(getPendingRecordPath(projectRoot, 'r1', INV)).toBe(path.join(root, 'r1', 'pending', `${INV}.json`));
    expect(getCompletedRecordPath(projectRoot, 'r1', INV)).toBe(path.join(root, 'r1', 'invocations', `${INV}.json`));
  });

  it('containment uses path semantics, not a string prefix', () => {
    const root = path.resolve('root-a');
    expect(isPathInside(root, path.resolve('root-a-evil', 'x'))).toBe(false);
    expect(isPathInside(root, path.join(root, '..', 'root-a-evil'))).toBe(false);
    expect(isPathInside(root, path.join(root, 'x', '..', '..', 'y'))).toBe(false);
    expect(isPathInside(root, path.join(root, 'x'))).toBe(true);
    expect(isPathInside(root, root)).toBe(false);
  });

  it('telemetry lives beside runs, not inside a run directory, and its names avoid the semantic-state pattern', () => {
    const root = getTelemetryRoot(path.resolve('p'));
    expect(root).not.toMatch(/semantic|rsp-state/i);
    expect(path.basename(root)).toBe('telemetry');
    expect(path.dirname(root)).toBe(path.join(path.resolve('p'), '.my-dev-kit-orchestrator'));
  });
});

describe('record validator', () => {
  it('accepts valid pending and completed records', () => {
    expect(parseTelemetryRecord(pending(), { runId: 'run-1', invocationId: INV }).ok).toBe(true);
    expect(parseTelemetryRecord(completed(), { runId: 'run-1', invocationId: INV }).ok).toBe(true);
    expect(parseTelemetryRecord(completed({ durationMs: 0 })).ok).toBe(true);
  });

  const cases: Array<[string, unknown, string]> = [
    ['non-object', 5, 'MALFORMED_RECORD'],
    ['array', [], 'MALFORMED_RECORD'],
    ['wrong kind', pending({ kind: 'other' }), 'UNSUPPORTED_RECORD_KIND'],
    ['unsupported schema', pending({ schemaVersion: '2.0.0' }), 'UNSUPPORTED_TELEMETRY_VERSION'],
    ['unknown property', pending({ extra: 1 }), 'UNKNOWN_PROPERTY'],
    ['non-empty observations', pending({ observations: { a: 1 } }), 'UNKNOWN_PROPERTY'],
    ['producer extra key', pending({ producer: { name: 'a', version: '1', x: 1 } }), 'INVALID_PRODUCER'],
    ['producer empty', pending({ producer: { name: '', version: '1' } }), 'INVALID_PRODUCER'],
    ['bad invocation id', pending({ invocationId: 'nope' }), 'INVALID_INVOCATION_ID'],
    ['unsafe runId', pending({ runId: '../x' }), 'MALFORMED_RECORD'],
    ['invalid command', pending({ command: 'status' }), 'INVALID_COMMAND'],
    ['invalid state', pending({ state: 'failed' }), 'INVALID_STATE'],
    ['bad startedAt', pending({ startedAt: '2026-01-02' }), 'INVALID_TIMESTAMP'],
    ['non-UTC startedAt', pending({ startedAt: '2026-01-02T03:04:05.006+01:00' }), 'INVALID_TIMESTAMP'],
    ['impossible date', pending({ startedAt: '2026-02-31T03:04:05.006Z' }), 'INVALID_TIMESTAMP'],
    ['completed without completedAt', pending({ state: 'completed', durationMs: 1 }), 'MISSING_COMPLETED_FIELD'],
    ['completed without duration', pending({ state: 'completed', completedAt: '2026-01-02T03:04:06.000Z' }), 'MISSING_COMPLETED_FIELD'],
    ['bad completedAt', completed({ completedAt: 'yesterday' }), 'INVALID_TIMESTAMP'],
    ['negative duration', completed({ durationMs: -1 }), 'INVALID_DURATION'],
    ['NaN duration', completed({ durationMs: NaN }), 'INVALID_DURATION'],
    ['Infinity duration', completed({ durationMs: Infinity }), 'INVALID_DURATION'],
    ['string duration', completed({ durationMs: '5' }), 'INVALID_DURATION'],
    ['pending with completedAt', pending({ completedAt: '2026-01-02T03:04:06.000Z' }), 'UNEXPECTED_COMPLETED_FIELD'],
    ['pending with durationMs', pending({ durationMs: 3 }), 'UNEXPECTED_COMPLETED_FIELD'],
  ];
  it.each(cases)('rejects %s', (_name, value, code) => {
    const result = parseTelemetryRecord(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0].code).toBe(code);
  });

  it('cross-checks runId and file-derived invocation id', () => {
    const wrongRun = parseTelemetryRecord(pending(), { runId: 'other' });
    expect(!wrongRun.ok && wrongRun.diagnostics[0].code).toBe('RUN_ID_MISMATCH');
    const wrongInv = parseTelemetryRecord(pending(), { invocationId: 'inv-ffffffffffffffffffffffffffffffff' });
    expect(!wrongInv.ok && wrongInv.diagnostics[0].code).toBe('INVOCATION_ID_MISMATCH');
  });

  it('serialization is canonical, round-trips, and ends with a newline', () => {
    const parsed = parseTelemetryRecord(completed()) as { ok: true; record: RunTelemetryRecord };
    const text = serializeTelemetryRecord(parsed.record);
    expect(text.endsWith('\n')).toBe(true);
    expect(Object.keys(JSON.parse(text))).toEqual([
      'kind', 'schemaVersion', 'producer', 'runId', 'invocationId', 'command', 'state', 'startedAt', 'completedAt', 'durationMs', 'observations',
    ]);
    expect(parseTelemetryRecord(JSON.parse(text)).ok).toBe(true);
    expect(serializeTelemetryRecord(parsed.record)).toBe(text);
  });

  it('ordering is startedAt then invocationId, independent of input order', () => {
    const mk = (id: string, startedAt: string) =>
      (parseTelemetryRecord(pending({ invocationId: id, startedAt })) as { ok: true; record: RunTelemetryRecord }).record;
    const a = mk('inv-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '2026-01-01T00:00:00.000Z');
    const b = mk('inv-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '2026-01-01T00:00:00.000Z');
    const c = mk('inv-00000000000000000000000000000000', '2026-01-02T00:00:00.000Z');
    const expected = [a, b, c].map((r) => r.invocationId);
    for (const permutation of [[a, b, c], [c, b, a], [b, c, a], [a, c, b]]) {
      expect([...permutation].sort(compareTelemetryRecords).map((r) => r.invocationId)).toEqual(expected);
    }
  });
});
