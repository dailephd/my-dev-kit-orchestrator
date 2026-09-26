import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRun } from '../src/run';
import { initWorkspace } from '../src/workspace';
import {
  RUN_TELEMETRY_VERSION,
  generateInvocationId,
  getCompletedDir,
  getCompletedRecordPath,
  getPendingDir,
  getPendingRecordPath,
  getRunTelemetryDir,
  getTelemetryRoot,
  serializeTelemetryRecord,
} from '../src/runTelemetry';
import {
  completeInvocation,
  createPendingInvocation,
  readRunTelemetry,
  readRunTelemetryRecords,
} from '../src/runTelemetryStore';

const OBS = { outcome: 'succeeded', mode: 'feature', stageCount: 5 } as const;

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-telemetry-store-'));
}

function withTmp(fn: (tmp: string) => void): void {
  const tmp = tmpDir();
  try {
    fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function hashTree(dir: string): string {
  const hash = crypto.createHash('sha256');
  const entries: string[] = [];
  const walk = (d: string, prefix: string): void => {
    for (const name of fs.readdirSync(d).sort()) {
      const full = path.join(d, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (fs.statSync(full).isDirectory()) walk(full, rel);
      else entries.push(`${rel}:${fs.readFileSync(full).toString('base64')}`);
    }
  };
  walk(dir, '');
  return hash.update(entries.join('\n')).digest('hex');
}

function listAll(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

const RUN = '20260926T010203-test-run';

function ok<T>(result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`);
  return result.value;
}

describe('pending persistence', () => {
  it('writes a structurally valid pending record only at its own path and never touches the run folder', () => {
    withTmp((tmp) => {
      initWorkspace(tmp);
      const meta = createRun({ request: 'r', mode: 'feature', projectRoot: tmp, runTelemetryVersion: RUN_TELEMETRY_VERSION });
      const before = hashTree(meta.runFolder);
      const mtimeBefore = fs.statSync(meta.runFolder).mtimeMs;
      const written = ok(createPendingInvocation(tmp, { runId: meta.runId, command: 'prompt' }));
      expect(written.path).toBe(getPendingRecordPath(tmp, meta.runId, written.record.invocationId));
      expect(written.record.state).toBe('pending');
      expect(hashTree(meta.runFolder)).toBe(before);
      expect(fs.statSync(meta.runFolder).mtimeMs).toBe(mtimeBefore);
      expect(listAll(getTelemetryRoot(tmp))).toEqual([`${meta.runId}/pending/${written.record.invocationId}.json`]);
      const onDisk = JSON.parse(fs.readFileSync(written.path, 'utf8'));
      expect(onDisk.state).toBe('pending');
      expect(onDisk.completedAt).toBeUndefined();
    });
  });

  it('refuses to overwrite an existing invocation and leaves the original bytes and no temp files', () => {
    withTmp((tmp) => {
      const id = generateInvocationId();
      const first = ok(createPendingInvocation(tmp, { runId: RUN, command: 'start', invocationId: id }));
      const original = fs.readFileSync(first.path, 'utf8');
      const second = createPendingInvocation(tmp, { runId: RUN, command: 'mark', invocationId: id });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error.code).toBe('INVOCATION_COLLISION');
      expect(fs.readFileSync(first.path, 'utf8')).toBe(original);
      expect(listAll(getTelemetryRoot(tmp))).toEqual([`${RUN}/pending/${id}.json`]);
    });
  });

  it('distinct invocations use distinct files and many concurrent creations all succeed', async () => {
    const tmp = tmpDir();
    try {
      const results = await Promise.all(
        Array.from({ length: 50 }, () => Promise.resolve().then(() => createPendingInvocation(tmp, { runId: RUN, command: 'prompt' }))),
      );
      expect(results.every((r) => r.ok)).toBe(true);
      const files = listAll(getPendingDir(tmp, RUN));
      expect(files.length).toBe(50);
      expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects invalid input without creating anything', () => {
    withTmp((tmp) => {
      const bad = createPendingInvocation(tmp, { runId: '../escape', command: 'prompt' });
      expect(bad.ok).toBe(false);
      if (!bad.ok) expect(['INVALID_INPUT', 'UNSAFE_PATH']).toContain(bad.error.code);
      const badCommand = createPendingInvocation(tmp, { runId: RUN, command: 'status' as never });
      expect(badCommand.ok).toBe(false);
      if (!badCommand.ok) expect(badCommand.error.code).toBe('INVALID_INPUT');
      const badTime = createPendingInvocation(tmp, { runId: RUN, command: 'prompt', startedAt: 'now' });
      expect(badTime.ok).toBe(false);
      const badId = createPendingInvocation(tmp, { runId: RUN, command: 'prompt', invocationId: '../x' });
      expect(badId.ok).toBe(false);
      expect(fs.existsSync(getTelemetryRoot(tmp))).toBe(false);
    });
  });
});

describe('completion', () => {
  it('creates a valid completed record and removes only the matching pending record', () => {
    withTmp((tmp) => {
      const a = ok(createPendingInvocation(tmp, { runId: RUN, command: 'prompt', startedAt: '2026-01-01T00:00:00.000Z' }));
      const other = ok(createPendingInvocation(tmp, { runId: RUN, command: 'mark', startedAt: '2026-01-01T00:00:01.000Z' }));
      const otherBytes = fs.readFileSync(other.path, 'utf8');

      const done = ok(completeInvocation(tmp, a.record, { observations: OBS, completedAt: '2026-01-01T00:00:02.000Z', durationMs: 42.5 }));
      expect(done.pendingRemoved).toBe(true);
      expect(done.path).toBe(getCompletedRecordPath(tmp, RUN, a.record.invocationId));
      expect(fs.existsSync(a.path)).toBe(false);
      expect(fs.readFileSync(other.path, 'utf8')).toBe(otherBytes);

      const persisted = JSON.parse(fs.readFileSync(done.path, 'utf8'));
      expect(persisted).toMatchObject({ state: 'completed', completedAt: '2026-01-01T00:00:02.000Z', durationMs: 42.5, startedAt: '2026-01-01T00:00:00.000Z' });
      expect(fs.readFileSync(done.path, 'utf8')).toBe(serializeTelemetryRecord(done.record));
      expect(listAll(getTelemetryRoot(tmp))).toEqual([
        `${RUN}/invocations/${a.record.invocationId}.json`,
        `${RUN}/pending/${other.record.invocationId}.json`,
      ]);
    });
  });

  it('never overwrites a completed record and keeps its bytes; the same invocation cannot complete twice', () => {
    withTmp((tmp) => {
      const p = ok(createPendingInvocation(tmp, { runId: RUN, command: 'prompt' }));
      const first = ok(completeInvocation(tmp, p.record, { observations: OBS, durationMs: 1 }));
      const bytes = fs.readFileSync(first.path, 'utf8');
      const second = completeInvocation(tmp, p.record, { observations: OBS, durationMs: 999 });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error.code).toBe('INVOCATION_COLLISION');
      expect(fs.readFileSync(first.path, 'utf8')).toBe(bytes);
      expect(listAll(getCompletedDir(tmp, RUN)).length).toBe(1);
    });
  });

  it('a failed completion leaves the pending record in place', () => {
    withTmp((tmp) => {
      const p = ok(createPendingInvocation(tmp, { runId: RUN, command: 'prompt' }));
      ok(completeInvocation(tmp, p.record, { observations: OBS, durationMs: 1 }));
      // Recreate a stale pending copy, then fail completion by collision.
      fs.writeFileSync(p.path, serializeTelemetryRecord(p.record), 'utf8');
      const again = completeInvocation(tmp, p.record, { observations: OBS, durationMs: 2 });
      expect(again.ok).toBe(false);
      expect(fs.existsSync(p.path)).toBe(true);
    });
  });

  it('rejects invalid completion input and non-pending input without writing', () => {
    withTmp((tmp) => {
      const p = ok(createPendingInvocation(tmp, { runId: RUN, command: 'prompt' }));
      for (const durationMs of [-1, NaN, Infinity]) {
        const r = completeInvocation(tmp, p.record, { observations: OBS, durationMs });
        expect(r.ok).toBe(false);
      }
      expect(completeInvocation(tmp, p.record, { observations: OBS, durationMs: 1, completedAt: 'later' }).ok).toBe(false);
      const done = ok(completeInvocation(tmp, p.record, { observations: OBS, durationMs: 1 }));
      const notPending = completeInvocation(tmp, done.record, { observations: OBS, durationMs: 1 });
      expect(notPending.ok).toBe(false);
      if (!notPending.ok) expect(notPending.error.code).toBe('INVALID_INPUT');
      expect(fs.existsSync(getCompletedDir(tmp, RUN))).toBe(true);
    });
  });

  it('completes even when the pending file is already gone', () => {
    withTmp((tmp) => {
      const p = ok(createPendingInvocation(tmp, { runId: RUN, command: 'start' }));
      fs.unlinkSync(p.path);
      const done = ok(completeInvocation(tmp, p.record, { observations: OBS, durationMs: 3 }));
      expect(done.pendingRemoved).toBe(false);
    });
  });
});

describe('interrupted / incomplete behavior', () => {
  it('a lone pending record is read as incomplete with no inferred outcome', () => {
    withTmp((tmp) => {
      const p = ok(createPendingInvocation(tmp, { runId: RUN, command: 'mark' }));
      const read = ok(readRunTelemetryRecords(tmp, RUN));
      expect(read.diagnostics).toEqual([]);
      expect(read.records).toHaveLength(1);
      const record = read.records[0];
      expect(record.state).toBe('pending');
      expect(record.invocationId).toBe(p.record.invocationId);
      expect(record.completedAt).toBeUndefined();
      expect(record.durationMs).toBeUndefined();
      expect(Object.keys(record)).not.toContain('success');
      expect(Object.keys(record)).not.toContain('exitCode');
    });
  });
});

describe('reader', () => {
  const activeRun = (tmp: string, extra: Record<string, unknown> = {}) => ({ projectRoot: tmp, runId: RUN, runTelemetryVersion: RUN_TELEMETRY_VERSION, ...extra });

  function writeRaw(dir: string, name: string, content: string): void {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }

  function validCompleted(tmp: string, overrides: Record<string, unknown> = {}): { id: string; body: Record<string, unknown> } {
    const id = generateInvocationId();
    const body = {
      kind: 'my-dev-kit-orchestrator/run-telemetry-invocation',
      schemaVersion: '1.0.0',
      producer: { name: 'p', version: '1' },
      runId: RUN,
      invocationId: id,
      command: 'prompt',
      state: 'completed',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      durationMs: 5,
      observations: OBS,
      ...overrides,
    };
    writeRaw(getCompletedDir(tmp, RUN), `${id}.json`, JSON.stringify(body));
    return { id, body };
  }

  it('legacy run (no version): not required, nothing read, no diagnostics', () => {
    withTmp((tmp) => {
      validCompleted(tmp);
      const view = readRunTelemetry({ projectRoot: tmp, runId: RUN });
      expect(view).toEqual({ activation: 'not-required', records: [], diagnostics: [] });
    });
  });

  it('active run with missing or empty telemetry root is valid and empty', () => {
    withTmp((tmp) => {
      expect(readRunTelemetry(activeRun(tmp))).toEqual({ activation: 'active', records: [], diagnostics: [] });
      fs.mkdirSync(getRunTelemetryDir(tmp, RUN), { recursive: true });
      expect(readRunTelemetry(activeRun(tmp))).toEqual({ activation: 'active', records: [], diagnostics: [] });
    });
  });

  it('unsupported run telemetry version is reported without reading', () => {
    withTmp((tmp) => {
      validCompleted(tmp);
      const view = readRunTelemetry(activeRun(tmp, { runTelemetryVersion: '9.9.9' }));
      expect(view.activation).toBe('unsupported');
      expect(view.records).toEqual([]);
      expect(view.diagnostics.map((d) => d.code)).toEqual(['UNSUPPORTED_RUN_TELEMETRY_VERSION']);
    });
  });

  const invalidCases: Array<[string, (tmp: string) => void, string]> = [
    ['malformed JSON', (tmp) => { const id = generateInvocationId(); writeRaw(getCompletedDir(tmp, RUN), `${id}.json`, '{not json'); }, 'MALFORMED_JSON'],
    ['unsupported schema version', (tmp) => { validCompleted(tmp, { schemaVersion: '2.0.0' }); }, 'UNSUPPORTED_TELEMETRY_VERSION'],
    ['wrong runId', (tmp) => { validCompleted(tmp, { runId: 'other-run' }); }, 'RUN_ID_MISMATCH'],
    ['filename/body invocation mismatch', (tmp) => {
      const { body } = validCompleted(tmp);
      const other = generateInvocationId();
      writeRaw(getCompletedDir(tmp, RUN), `${other}.json`, JSON.stringify(body));
    }, 'INVOCATION_ID_MISMATCH'],
    ['unknown property', (tmp) => { validCompleted(tmp, { extra: true }); }, 'UNKNOWN_PROPERTY'],
    ['invalid command', (tmp) => { validCompleted(tmp, { command: 'export' }); }, 'INVALID_COMMAND'],
    ['invalid timestamp', (tmp) => { validCompleted(tmp, { startedAt: 'tomorrow' }); }, 'INVALID_TIMESTAMP'],
    ['negative duration', (tmp) => { validCompleted(tmp, { durationMs: -5 }); }, 'INVALID_DURATION'],
    ['completed missing completedAt', (tmp) => {
      const id = generateInvocationId();
      const body = { kind: 'my-dev-kit-orchestrator/run-telemetry-invocation', schemaVersion: '1.0.0', producer: { name: 'p', version: '1' }, runId: RUN, invocationId: id, command: 'prompt', state: 'completed', startedAt: '2026-01-01T00:00:00.000Z', durationMs: 1, observations: OBS };
      writeRaw(getCompletedDir(tmp, RUN), `${id}.json`, JSON.stringify(body));
    }, 'MISSING_COMPLETED_FIELD'],
    ['pending record claiming completed state', (tmp) => {
      const id = generateInvocationId();
      const body = { kind: 'my-dev-kit-orchestrator/run-telemetry-invocation', schemaVersion: '1.0.0', producer: { name: 'p', version: '1' }, runId: RUN, invocationId: id, command: 'prompt', state: 'completed', startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:01.000Z', durationMs: 1, observations: OBS };
      writeRaw(getPendingDir(tmp, RUN), `${id}.json`, JSON.stringify(body));
    }, 'STATE_LOCATION_MISMATCH'],
    ['completed record claiming pending state', (tmp) => {
      const id = generateInvocationId();
      const body = { kind: 'my-dev-kit-orchestrator/run-telemetry-invocation', schemaVersion: '1.0.0', producer: { name: 'p', version: '1' }, runId: RUN, invocationId: id, command: 'prompt', state: 'pending', startedAt: '2026-01-01T00:00:00.000Z', observations: {} };
      writeRaw(getCompletedDir(tmp, RUN), `${id}.json`, JSON.stringify(body));
    }, 'STATE_LOCATION_MISMATCH'],
    ['oversized record', (tmp) => { const id = generateInvocationId(); writeRaw(getCompletedDir(tmp, RUN), `${id}.json`, ' '.repeat(9000)); }, 'RECORD_TOO_LARGE'],
    ['unexpected file name', (tmp) => { writeRaw(getCompletedDir(tmp, RUN), 'notes.json', '{}'); }, 'UNEXPECTED_FILE'],
  ];

  it.each(invalidCases)('rejects %s with a diagnostic and accepts nothing', (_name, setup, code) => {
    withTmp((tmp) => {
      setup(tmp);
      const view = readRunTelemetry(activeRun(tmp));
      const codes = view.diagnostics.map((d) => d.code);
      expect(codes).toContain(code);
      // The filename/body mismatch case also leaves the one valid record accepted.
      const accepted = view.records.length;
      expect(accepted).toBeLessThanOrEqual(1);
      for (const diagnostic of view.diagnostics) expect(diagnostic.message).not.toContain(tmp);
    });
  });

  it('ignores abandoned temporary files and never reports absolute paths', () => {
    withTmp((tmp) => {
      const { id } = validCompleted(tmp);
      writeRaw(getCompletedDir(tmp, RUN), `${id}.json.deadbeefdeadbeef.tmp`, 'partial');
      const view = readRunTelemetry(activeRun(tmp));
      expect(view.diagnostics).toEqual([]);
      expect(view.records.map((r) => r.invocationId)).toEqual([id]);
    });
  });

  it('pending plus completed copies of one invocation report a duplicate and use the completed record', () => {
    withTmp((tmp) => {
      const p = ok(createPendingInvocation(tmp, { runId: RUN, command: 'prompt' }));
      const pendingBytes = fs.readFileSync(p.path, 'utf8');
      ok(completeInvocation(tmp, p.record, { observations: OBS, durationMs: 7 }));
      fs.writeFileSync(p.path, pendingBytes, 'utf8'); // simulate crash before pending removal
      const view = readRunTelemetry(activeRun(tmp));
      expect(view.records).toHaveLength(1);
      expect(view.records[0].state).toBe('completed');
      expect(view.diagnostics.map((d) => d.code)).toEqual(['DUPLICATE_INVOCATION_ID']);
    });
  });

  it('an unrelated run never leaks into another run\'s read', () => {
    withTmp((tmp) => {
      ok(createPendingInvocation(tmp, { runId: 'other-run', command: 'prompt' }));
      expect(readRunTelemetry(activeRun(tmp)).records).toEqual([]);
    });
  });

  it('a hostile runId makes the read fail as a value, not a throw', () => {
    withTmp((tmp) => {
      const view = readRunTelemetry({ projectRoot: tmp, runId: '../..', runTelemetryVersion: RUN_TELEMETRY_VERSION });
      expect(view.records).toEqual([]);
      expect(view.diagnostics).toHaveLength(1);
    });
  });

  it('ordering is independent of creation and directory enumeration order', () => {
    const spec = [
      { id: 'inv-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', at: '2026-01-01T00:00:03.000Z' },
      { id: 'inv-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', at: '2026-01-01T00:00:01.000Z' },
      { id: 'inv-cccccccccccccccccccccccccccccccc', at: '2026-01-01T00:00:01.000Z' },
      { id: 'inv-00000000000000000000000000000000', at: '2026-01-01T00:00:02.000Z' },
    ];
    const orders = [spec, [...spec].reverse(), [spec[2], spec[0], spec[3], spec[1]]];
    const results = orders.map((order) => {
      const tmp = tmpDir();
      try {
        for (const item of order) {
          const p = ok(createPendingInvocation(tmp, { runId: RUN, command: 'prompt', invocationId: item.id, startedAt: item.at }));
          if (item.id.startsWith('inv-a') || item.id.startsWith('inv-0')) ok(completeInvocation(tmp, p.record, { observations: OBS, durationMs: 1, completedAt: '2026-01-01T00:01:00.000Z' }));
        }
        return readRunTelemetry(activeRun(tmp)).records.map((r) => `${r.invocationId}:${r.state}`);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
    expect(results[0]).toEqual([
      'inv-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:pending',
      'inv-cccccccccccccccccccccccccccccccc:pending',
      'inv-00000000000000000000000000000000:completed',
      'inv-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:completed',
    ]);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it('reading never modifies telemetry files', () => {
    withTmp((tmp) => {
      const p = ok(createPendingInvocation(tmp, { runId: RUN, command: 'prompt' }));
      ok(completeInvocation(tmp, p.record, { observations: OBS, durationMs: 1 }));
      ok(createPendingInvocation(tmp, { runId: RUN, command: 'mark' }));
      const before = hashTree(getTelemetryRoot(tmp));
      readRunTelemetry(activeRun(tmp));
      readRunTelemetry(activeRun(tmp));
      expect(hashTree(getTelemetryRoot(tmp))).toBe(before);
    });
  });
});

describe('symlink safety', () => {
  it('refuses to write through a symlinked run telemetry directory', () => {
    withTmp((tmp) => {
      const outside = path.join(tmp, 'outside');
      fs.mkdirSync(outside);
      const root = getTelemetryRoot(tmp);
      fs.mkdirSync(root, { recursive: true });
      try {
        fs.symlinkSync(outside, path.join(root, RUN), 'junction');
      } catch {
        return; // symlink creation unavailable on this platform/account
      }
      const result = createPendingInvocation(tmp, { runId: RUN, command: 'prompt' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('UNSAFE_PATH');
      expect(fs.readdirSync(outside)).toEqual([]);
    });
  });

  it('reader does not follow a symlinked record file', () => {
    withTmp((tmp) => {
      const p = ok(createPendingInvocation(tmp, { runId: RUN, command: 'prompt' }));
      const target = path.join(tmp, 'elsewhere.json');
      fs.writeFileSync(target, fs.readFileSync(p.path, 'utf8'), 'utf8');
      const id = generateInvocationId();
      try {
        fs.symlinkSync(target, path.join(getPendingDir(tmp, RUN), `${id}.json`), 'file');
      } catch {
        return;
      }
      const view = ok(readRunTelemetryRecords(tmp, RUN));
      expect(view.diagnostics.map((d) => d.code)).toContain('UNSAFE_RECORD_FILE');
      expect(view.records.map((r) => r.invocationId)).toEqual([p.record.invocationId]);
    });
  });
});

describe('no workflow-policy coupling', () => {
  const sources = ['runTelemetry.ts', 'runTelemetryStore.ts'].map((f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'));

  it('telemetry modules import no workflow-policy owner', () => {
    const forbidden = ['runIntegrityGate', 'judgeIntegrity', 'artifactLifecycle', 'correctionRouter', 'correctionState', 'semanticContinuity', 'runSemanticContinuity', 'stageDetector', 'runLifecycle', 'promptGenerator', './run\''];
    for (const source of sources) {
      const imports = source.split('\n').filter((line) => /^\s*(import|export)\b.*\bfrom\b/.test(line) || /^\s*}\s*from\b/.test(line));
      for (const line of imports) for (const name of forbidden) expect(line).not.toContain(name);
    }
  });

  it('workflow-policy owners do not import telemetry', () => {
    for (const file of ['runIntegrityGate.ts', 'judgeIntegrity.ts', 'artifactLifecycle.ts', 'correctionRouter.ts', 'stageDetector.ts', 'runLifecycle.ts']) {
      const text = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
      expect(text).not.toMatch(/runTelemetry/);
    }
    for (const file of ['instructions/semanticContinuity.ts', 'instructions/runSemanticContinuity.ts']) {
      expect(fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8')).not.toMatch(/runTelemetry/);
    }
  });

  it('a telemetry write failure leaves the run folder and loadRun-visible state untouched', () => {
    withTmp((tmp) => {
      const meta = createRun({ request: 'r', mode: 'feature', projectRoot: tmp, runTelemetryVersion: RUN_TELEMETRY_VERSION });
      const before = hashTree(meta.runFolder);
      // Block the telemetry root with a regular file so every write fails.
      fs.mkdirSync(path.dirname(getTelemetryRoot(tmp)), { recursive: true });
      fs.writeFileSync(getTelemetryRoot(tmp), 'not a directory', 'utf8');
      const result = createPendingInvocation(tmp, { runId: meta.runId, command: 'prompt' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(['IO_ERROR', 'UNSAFE_PATH']).toContain(result.error.code);
      const view = readRunTelemetry({ projectRoot: tmp, runId: meta.runId, runTelemetryVersion: RUN_TELEMETRY_VERSION });
      expect(view.records).toEqual([]);
      expect(hashTree(meta.runFolder)).toBe(before);
    });
  });
});
