import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRun } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { RUN_TELEMETRY_VERSION, RunTelemetryObservations, getTelemetryRoot } from '../src/runTelemetry';
import { completeInvocation, createPendingInvocation } from '../src/runTelemetryStore';
import { runCli } from './cliTestHelpers';

const BASE = Date.parse('2026-01-01T00:00:00.000Z');
const iso = (offsetMs: number): string => new Date(BASE + offsetMs).toISOString();
let counter = 0;
const nextId = (): string => `inv-${(++counter).toString(16).padStart(32, '0')}`;

interface Fixture {
  tmp: string;
  runId: string;
  runFolder: string;
}

function withRun<T>(fn: (f: Fixture) => T, telemetryVersion: string | null = RUN_TELEMETRY_VERSION): T {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orc-surface-'));
  try {
    initWorkspace(tmp);
    const meta = createRun({
      request: 'r',
      mode: 'feature',
      projectRoot: tmp,
      ...(telemetryVersion !== null ? { runTelemetryVersion: telemetryVersion } : {}),
    });
    return fn({ tmp, runId: meta.runId, runFolder: meta.runFolder });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

interface Seed {
  command?: 'start' | 'prompt' | 'mark';
  start: number;
  end?: number;
  durationMs?: number;
  obs?: Partial<RunTelemetryObservations>;
  pending?: boolean;
}

function seed(f: Fixture, specs: Seed[]): void {
  for (const spec of specs) {
    const created = createPendingInvocation(f.tmp, { runId: f.runId, command: spec.command ?? 'prompt', invocationId: nextId(), startedAt: iso(spec.start) });
    if (!created.ok) throw new Error(created.error.message);
    if (spec.pending) continue;
    const durationMs = spec.durationMs ?? 10;
    const done = completeInvocation(f.tmp, created.value.record, {
      completedAt: iso(spec.end ?? spec.start + durationMs),
      durationMs,
      observations: { outcome: 'succeeded', mode: 'feature', stageCount: 5, ...spec.obs },
    });
    if (!done.ok) throw new Error(done.error.message);
  }
}

function junk(f: Fixture, count: number): void {
  const dir = path.join(getTelemetryRoot(f.tmp), f.runId, 'invocations');
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < count; i += 1) fs.writeFileSync(path.join(dir, `${nextId()}.json`), '{not json', 'utf8');
}

function treeHash(dir: string): string {
  const hash = crypto.createHash('sha256');
  const walk = (current: string): void => {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else hash.update(path.relative(dir, full)).update(fs.readFileSync(full)).update(String(fs.statSync(full).mtimeMs));
    }
  };
  walk(dir);
  return hash.digest('hex');
}

function section(output: string, header: string): string[] {
  const lines = output.split('\n');
  const start = lines.findIndex((l) => l.trim() === header);
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start; i < lines.length; i += 1) {
    if (i > start && (lines[i].trim() === '' || lines[i].startsWith('==='))) break;
    out.push(lines[i]);
  }
  return out;
}

const stage = (index: number): Partial<RunTelemetryObservations> => ({ currentStage: `s${index}`, stageIndex: index });
const status = (f: Fixture) => runCli(['status', '--root', f.tmp]);
const check = (f: Fixture, ...args: string[]) => runCli(['check', ...args, '--root', f.tmp]);
const exportText = (f: Fixture) => runCli(['export', '--root', f.tmp]);
const economics = (f: Fixture) => section(status(f).output, 'Workflow Economics:');
const stripGenerated = (text: string): string => text.split('\n').filter((l) => !l.startsWith('Generated:')).join('\n');

describe('status', () => {
  it('legacy runs show no Workflow Economics and write no telemetry', () => {
    withRun((f) => {
      const res = status(f);
      expect(res.output).not.toContain('Workflow Economics');
      expect(fs.existsSync(getTelemetryRoot(f.tmp))).toBe(false);
    }, null);
  });

  it('an activated empty run is available with zeros and unavailable values', () => {
    withRun((f) => {
      expect(economics(f)).toEqual([
        'Workflow Economics:',
        '  Availability: available',
        '  Interactions: 0 completed, 0 succeeded, 0 failed, 0 incomplete',
        '  Commands: start 0, prompt 0, mark 0',
        '  Prompts: 0 rendered, 0 characters total, unavailable characters average',
        '  Orchestrator duration: 0 ms total, unavailable ms average',
        '  Stage movement: 0 forward, 0 backward (revisits), 0 unchanged',
        '  Correction prompts: 0',
        '  Integrity observations: 0 blocked entries, 0 recoveries',
        '  Final eligibility observations: 0 reached, 0 lost',
        '  Observed workflow span: unavailable',
        '  Coverage: 0 diagnostics, 0 wall-clock anomalies, numeric limit exceeded: no, concurrent intervals: no, ambiguous boundaries: 0',
      ]);
      expect(status(f).output).not.toMatch(/NaN|Infinity|null|undefined/);
    });
  });

  it('shows exact deterministic metrics for an available record set', () => {
    withRun((f) => {
      seed(f, [
        { command: 'start', start: 0, durationMs: 5, obs: stage(0) },
        { start: 1000, durationMs: 12.5, obs: { ...stage(0), promptCharacterCount: 100, promptKind: 'stage', integrity: { availability: 'observed', runIntegrityReady: true } } },
        { start: 2000, durationMs: 7.126, obs: { ...stage(1), promptCharacterCount: 201, promptKind: 'correction', integrity: { availability: 'observed', runIntegrityReady: false } } },
        { start: 3000, durationMs: 1, obs: { ...stage(0), integrity: { availability: 'observed', runIntegrityReady: true } } },
      ]);
      expect(economics(f)).toEqual([
        'Workflow Economics:',
        '  Availability: available',
        '  Interactions: 4 completed, 4 succeeded, 0 failed, 0 incomplete',
        '  Commands: start 1, prompt 3, mark 0',
        '  Prompts: 2 rendered, 301 characters total, 150.5 characters average',
        '  Orchestrator duration: 25.63 ms total, 6.41 ms average',
        '  Stage movement: 1 forward, 1 backward (revisits), 1 unchanged',
        '  Correction prompts: 1',
        '  Integrity observations: 1 blocked entries, 1 recoveries',
        '  Final eligibility observations: 0 reached, 0 lost',
        '  Observed workflow span: 3001 ms (wall clock, not active work time)',
        '  Coverage: 0 diagnostics, 0 wall-clock anomalies, numeric limit exceeded: no, concurrent intervals: no, ambiguous boundaries: 0',
      ]);
    });
  });

  it('a pending invocation is partial with an incomplete count', () => {
    withRun((f) => {
      seed(f, [{ start: 0 }, { start: 100, pending: true }]);
      const lines = economics(f);
      expect(lines[1]).toBe('  Availability: partial');
      expect(lines[2]).toBe('  Interactions: 1 completed, 1 succeeded, 0 failed, 1 incomplete');
    });
  });

  it('malformed telemetry does not crash status, shows partial coverage, and dumps no raw diagnostics', () => {
    withRun((f) => {
      seed(f, [{ start: 0 }]);
      junk(f, 2);
      const res = status(f);
      expect(res.exitCode).toBeUndefined();
      const lines = section(res.output, 'Workflow Economics:');
      expect(lines[1]).toBe('  Availability: partial');
      expect(lines.join('\n')).toContain('2 diagnostics');
      expect(res.output).not.toMatch(/MALFORMED_JSON|\{not json|inv-[0-9a-f]{32}/);
    });
  });

  it('surfaces a wall-clock anomaly honestly with an unavailable span', () => {
    withRun((f) => {
      seed(f, [{ start: 100, end: 50 }]);
      const lines = economics(f).join('\n');
      expect(lines).toContain('1 wall-clock anomalies');
      expect(lines).toContain('Observed workflow span: unavailable');
      expect(lines).toContain('Availability: partial');
    });
  });

  it('surfaces the numeric limit and shows unavailable rather than zero', () => {
    withRun((f) => {
      seed(f, [
        { start: 0, end: 5, durationMs: Number.MAX_VALUE },
        { start: 10, end: 15, durationMs: Number.MAX_VALUE },
      ]);
      const lines = economics(f).join('\n');
      expect(lines).toContain('numeric limit exceeded: yes');
      expect(lines).toContain('Orchestrator duration: unavailable ms total, unavailable ms average');
      expect(lines).not.toMatch(/NaN|Infinity|e\+/);
    });
  });

  it('shows concurrency as observation, not failure', () => {
    withRun((f) => {
      seed(f, [{ start: 0, durationMs: 100 }, { start: 50, durationMs: 10 }]);
      const text = economics(f).join('\n');
      expect(text).toContain('concurrent intervals: yes, ambiguous boundaries: 1');
      expect(text).not.toMatch(/fail(ed|ure)? detected|error/i);
    });
  });

  it('an unsupported version shows a bounded unsupported section', () => {
    withRun((f) => {
      expect(economics(f)).toEqual(['Workflow Economics:', '  Availability: unsupported']);
    }, '9.9.9');
  });

  it('is deterministic and non-recording across repeated runs', () => {
    withRun((f) => {
      seed(f, [{ start: 0, obs: { promptCharacterCount: 10, promptKind: 'stage' } }]);
      const before = [treeHash(getTelemetryRoot(f.tmp)), treeHash(f.runFolder)];
      const first = status(f).output;
      const second = status(f).output;
      expect(second).toBe(first);
      expect([treeHash(getTelemetryRoot(f.tmp)), treeHash(f.runFolder)]).toEqual(before);
    });
  });
});

describe('check', () => {
  const heading = '=== Run telemetry ===';

  it('legacy runs get no telemetry section and no warning', () => {
    withRun((f) => {
      const res = check(f);
      expect(res.output).not.toContain('Run telemetry');
      expect(res.output).not.toContain('TELEMETRY');
    }, null);
  });

  it('clean and empty activated telemetry passes', () => {
    withRun((f) => {
      expect(section(check(f).output, heading)).toEqual([heading, '  [pass] telemetry records valid']);
      seed(f, [{ start: 0 }]);
      expect(section(check(f).output, heading)).toEqual([heading, '  [pass] telemetry records valid']);
    });
  });

  it('reader diagnostics reuse canonical codes as warnings; strict promotes them per existing semantics', () => {
    withRun((f) => {
      const baseline = check(f).exitCode;
      const baselineStrict = check(f, '--strict').exitCode;
      junk(f, 1);
      const res = check(f);
      const lines = section(res.output, heading);
      expect(lines[1]).toMatch(/^ {2}\[warn\] MALFORMED_JSON: Telemetry record is not valid JSON \(inv-[0-9a-f]{32}\.json\)$/);
      expect(res.exitCode).toBe(baseline);
      if (baselineStrict === undefined) expect(check(f, '--strict').exitCode).toBe(1);
      else expect(check(f, '--strict').exitCode).toBe(baselineStrict);
    });
  });

  it('a unique pending invocation is an incomplete-coverage warning, not malformed', () => {
    withRun((f) => {
      seed(f, [{ start: 0, pending: true }]);
      const lines = section(check(f).output, heading).join('\n');
      expect(lines).toContain('[warn] INCOMPLETE_TELEMETRY_INVOCATION: 1 recorded interaction(s)');
      expect(lines).not.toContain('MALFORMED');
    });
  });

  it('a completed record with a leftover pending copy reports only the canonical duplicate diagnostic', () => {
    withRun((f) => {
      seed(f, [{ start: 0 }]);
      const invocations = path.join(getTelemetryRoot(f.tmp), f.runId, 'invocations');
      const file = fs.readdirSync(invocations)[0];
      const record = JSON.parse(fs.readFileSync(path.join(invocations, file), 'utf8'));
      const pendingDir = path.join(getTelemetryRoot(f.tmp), f.runId, 'pending');
      fs.mkdirSync(pendingDir, { recursive: true });
      const { completedAt: _c, durationMs: _d, ...rest } = record;
      fs.writeFileSync(path.join(pendingDir, file), JSON.stringify({ ...rest, state: 'pending', observations: {} }), 'utf8');
      const lines = section(check(f).output, heading).join('\n');
      expect(lines).toContain('DUPLICATE_INVOCATION_ID');
      expect(lines).not.toContain('INCOMPLETE_TELEMETRY_INVOCATION');
    });
  });

  it('an unsupported version is a warning with no metrics', () => {
    withRun((f) => {
      const lines = section(check(f).output, heading).join('\n');
      expect(lines).toContain('[warn] UNSUPPORTED_RUN_TELEMETRY_VERSION');
      expect(lines).not.toMatch(/[0-9] completed/);
    }, '9.9.9');
  });

  it('wall-clock anomalies and numeric limits are warnings', () => {
    withRun((f) => {
      seed(f, [{ start: 100, end: 50 }]);
      expect(section(check(f).output, heading).join('\n')).toContain('[warn] TELEMETRY_WALL_CLOCK_ANOMALY');
    });
    withRun((f) => {
      seed(f, [{ start: 0, end: 5, durationMs: Number.MAX_VALUE }, { start: 10, end: 15, durationMs: Number.MAX_VALUE }]);
      expect(section(check(f).output, heading).join('\n')).toContain('[warn] TELEMETRY_NUMERIC_LIMIT_EXCEEDED');
    });
  });

  it('caps individual diagnostics, reports truncation, and keeps the true total', () => {
    withRun((f) => {
      junk(f, 25);
      const lines = section(check(f).output, heading);
      expect(lines.filter((l) => l.includes('[warn] MALFORMED_JSON'))).toHaveLength(20);
      expect(lines[lines.length - 1]).toBe('  [warn] TELEMETRY_DIAGNOSTICS_TRUNCATED: 5 additional diagnostics not shown (25 total)');
    });
  });

  it('leaks no absolute path or raw content', () => {
    withRun((f) => {
      junk(f, 1);
      fs.writeFileSync(path.join(getTelemetryRoot(f.tmp), f.runId, 'invocations', 'stray file.json'), 'x', 'utf8');
      const text = section(check(f).output, heading).join('\n');
      expect(text).not.toContain(f.tmp);
      expect(text).not.toContain('stray');
      expect(text).not.toContain('{not json');
    });
  });

  it('participates in check --all with a summary line, and does not appear in targeted checks', () => {
    withRun((f) => {
      seed(f, [{ start: 0, pending: true }]);
      const all = check(f, '--all');
      expect(section(all.output, heading).join('\n')).toContain('INCOMPLETE_TELEMETRY_INVOCATION');
      expect(all.output).toContain('  Run telemetry: warn');
      expect(all.output).toContain('=== Summary ===');
      for (const args of [['--trace'], ['--artifacts'], ['--design-map'], ['--artifact', 'request-brief'], ['--prompts']]) {
        expect(check(f, ...args).output).not.toContain('Run telemetry');
      }
    });
    withRun((f) => {
      expect(check(f, '--all').output).toContain('  Run telemetry: pass');
    });
  });

  it('is non-recording across repeated check and check --all', () => {
    withRun((f) => {
      seed(f, [{ start: 0 }]);
      const before = treeHash(getTelemetryRoot(f.tmp));
      check(f);
      check(f, '--all');
      check(f, '--strict');
      expect(treeHash(getTelemetryRoot(f.tmp))).toBe(before);
    });
  });
});

describe('export', () => {
  const heading = '=== Workflow Economics ===';
  const body = (f: Fixture): string[] => {
    const lines = exportText(f).output.split('\n');
    const start = lines.findIndex((l) => l.trim() === heading);
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((l) => l.startsWith('==='));
    return [heading, ...rest.slice(0, end < 0 ? rest.length : end).filter((l) => l.trim() !== '')];
  };

  it('omits the section for legacy runs', () => {
    withRun((f) => {
      expect(exportText(f).output).not.toContain('Workflow Economics');
    }, null);
  });

  it('activated empty run: bounded available section with zeros and unavailable values', () => {
    withRun((f) => {
      const lines = body(f).join('\n');
      expect(lines).toContain('Telemetry availability: available');
      expect(lines).toContain('Completed interactions: 0');
      expect(lines).toContain('Prompt characters average: unavailable');
      expect(lines).toContain('Observed workflow span (ms, wall clock; not active work time): unavailable');
      expect(lines).not.toMatch(/NaN|Infinity|null|undefined/);
    });
  });

  it('available summary carries every aggregate group from the evaluator', () => {
    withRun((f) => {
      seed(f, [
        { command: 'start', start: 0, durationMs: 4, obs: stage(0) },
        { start: 100, durationMs: 6, obs: { ...stage(1), promptCharacterCount: 50, promptKind: 'stage', integrity: { availability: 'observed', runIntegrityReady: true }, judge: { availability: 'observed', verdictAccepted: true, finalReportEligible: false } } },
        { command: 'mark', start: 200, durationMs: 2, obs: { ...stage(0), mark: { artifact: 'a.txt', requestedState: 'complete', reasonProvided: false }, judge: { availability: 'observed', verdictAccepted: true, finalReportEligible: true } } },
      ]);
      const text = body(f).join('\n');
      for (const expected of [
        'Economics version: 1.0.0',
        'Telemetry availability: available',
        'Completed interactions: 3',
        'start: 1 completed / 1 succeeded / 0 failed',
        'prompt: 1 completed / 1 succeeded / 0 failed',
        'mark: 1 completed / 1 succeeded / 0 failed',
        'Prompt renders: 1',
        'Prompt characters total: 50',
        'Orchestrator invocation duration total (ms): 12',
        'Start duration total (ms): 4',
        'Forward stage transitions: 1',
        'Backward stage transitions: 1',
        'Stage revisits: 1',
        'Mark requested complete: 1',
        'Integrity observations: 1',
        'Judge observations: 2',
        'Judge accepted observations: 2',
        'Final eligibility reached: 1',
        'Continuity snapshots unavailable: 0',
      ]) expect(text).toContain(expected);
      expect(text).not.toMatch(/attempt|execution/i);
    });
  });

  it('partial coverage shows pending, diagnostics, anomalies, numeric limit, and concurrency', () => {
    withRun((f) => {
      seed(f, [
        { start: 0, durationMs: 100 },
        { start: 50, durationMs: 10 },
        { start: 500, end: 400 },
        { start: 900, pending: true },
      ]);
      junk(f, 1);
      const text = body(f).join('\n');
      expect(text).toContain('Telemetry availability: partial');
      expect(text).toContain('Incomplete interactions: 1');
      expect(text).toContain('Telemetry diagnostics: 1');
      expect(text).toContain('Wall-clock anomalies: 1');
      expect(text).toContain('Numeric limit exceeded: no');
    });
    withRun((f) => {
      seed(f, [{ start: 0, durationMs: 100 }, { start: 50, durationMs: 10 }]);
      const text = body(f).join('\n');
      expect(text).toContain('Concurrent intervals: yes');
      expect(text).toContain('Ambiguous transition boundaries: 1');
    });
    withRun((f) => {
      seed(f, [{ start: 0, end: 5, durationMs: Number.MAX_VALUE }, { start: 10, end: 15, durationMs: Number.MAX_VALUE }]);
      const text = body(f).join('\n');
      expect(text).toContain('Numeric limit exceeded: yes');
      expect(text).toContain('Orchestrator invocation duration total (ms): unavailable');
    });
  });

  it('unsupported version: bounded section without fabricated zeros', () => {
    withRun((f) => {
      expect(body(f)).toEqual([heading, '  Availability: unsupported']);
    }, '9.9.9');
  });

  it('contains no raw telemetry, prompt text, paths, or malformed content', () => {
    withRun((f) => {
      seed(f, [{ start: 0, obs: { promptCharacterCount: 10, promptKind: 'stage' } }]);
      junk(f, 1);
      const text = body(f).join('\n');
      expect(text).not.toMatch(/inv-[0-9a-f]{32}|"kind"|\{not json|MALFORMED_JSON|telemetry[\\/]/);
      expect(text).not.toContain(f.tmp);
    });
  });

  it('is byte-identical across repeated exports (except Generated) and non-recording', () => {
    withRun((f) => {
      seed(f, [{ start: 0 }, { start: 100 }]);
      const before = [treeHash(getTelemetryRoot(f.tmp)), treeHash(f.runFolder)];
      const first = exportText(f).output;
      const second = exportText(f).output;
      expect(stripGenerated(second)).toBe(stripGenerated(first));
      expect([treeHash(getTelemetryRoot(f.tmp)), treeHash(f.runFolder)]).toEqual(before);
    });
  });

  it('the section has a fixed size regardless of invocation and diagnostic counts', () => {
    let small = 0;
    let large = 0;
    withRun((f) => {
      seed(f, [{ start: 0 }]);
      small = body(f).length;
    });
    withRun((f) => {
      seed(f, Array.from({ length: 80 }, (_, i) => ({ start: i * 100 })));
      junk(f, 30);
      large = body(f).length;
    });
    expect(small).toBeGreaterThan(30);
    expect(large).toBe(small);
  });
});

describe('ownership and non-recording', () => {
  const read = (file: string): string => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');

  it('status, export, and check consume the shared surface, not the evaluator, reader, or recording API', () => {
    for (const file of ['commands/status.ts', 'commands/export.ts', 'commands/check.ts']) {
      const source = read(file);
      expect(source).toMatch(/from '\.\.\/workflowEconomicsSurface'/);
      expect(source).not.toMatch(/runWorkflowEconomics|runTelemetryStore|runTelemetryObservation/);
    }
  });

  it('the surface composes the canonical reader and evaluator and contains no reducer or writer', () => {
    const surface = read('workflowEconomicsSurface.ts');
    expect(surface).toMatch(/readRunTelemetry\b/);
    expect(surface).toMatch(/evaluateWorkflowEconomics/);
    expect(surface).not.toMatch(/\.reduce\(|writeFile|mkdir|unlink|createPendingInvocation|completeInvocation\(|toLocale|Intl\./);
  });

  it('status, check, check --all, export, and list never create telemetry records', () => {
    withRun((f) => {
      seed(f, [{ start: 0 }]);
      const before = treeHash(getTelemetryRoot(f.tmp));
      for (const args of [['status'], ['check'], ['check', '--all'], ['export'], ['list']]) runCli([...args, '--root', f.tmp]);
      expect(treeHash(getTelemetryRoot(f.tmp))).toBe(before);
      expect(fs.readdirSync(path.join(getTelemetryRoot(f.tmp), f.runId, 'pending'))).toEqual([]);
      expect(fs.readdirSync(path.join(getTelemetryRoot(f.tmp), f.runId, 'invocations'))).toHaveLength(1);
    });
  });
});
