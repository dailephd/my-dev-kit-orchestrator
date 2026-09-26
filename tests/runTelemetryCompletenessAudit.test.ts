import * as fs from 'fs';
import * as path from 'path';
import { createProgram } from '../src/program';
import { loadRun, makeRunId } from '../src/run';
import { VALID_MODES } from '../src/types';
import { getTelemetryRoot } from '../src/runTelemetry';
import { runCli } from './cliTestHelpers';
import { readyTelemetryRun, seedCompleted, withTmp } from './runTelemetryAuditHelpers';

// v1.6.0 completeness audit: each test closes one specific evidence gap left by
// the implementation batches (isolated strict behavior, public-surface freeze,
// makeRunId stability, storage layout, hardening visibility, policy separation).

describe('telemetry is not a workflow policy input', () => {
  it('telemetry problems never change workflow state: loadRun and gate-derived output are unaffected', () => {
    withTmp((tmp) => {
      const meta = readyTelemetryRun(tmp);
      const before = runCli(['prompt', '--root', tmp]).output.replace(/Telemetry warning:.*\n?/g, '');
      fs.rmSync(getTelemetryRoot(tmp), { recursive: true, force: true });
      fs.mkdirSync(path.join(getTelemetryRoot(tmp), meta.runId, 'invocations'), { recursive: true });
      fs.writeFileSync(path.join(getTelemetryRoot(tmp), meta.runId, 'invocations', `inv-${'b'.repeat(32)}.json`), 'garbage', 'utf8');
      expect(() => loadRun(meta.runFolder)).not.toThrow();
      const after = runCli(['prompt', '--root', tmp]);
      expect(after.exitCode).toBeUndefined();
      expect(after.output).toBe(before);
    });
  });
});

describe('public CLI surface is frozen relative to v1.5.0', () => {
  const program = createProgram();

  it('registers exactly the eight existing commands', () => {
    expect(program.commands.map((c) => c.name()).sort()).toEqual(['check', 'export', 'init', 'list', 'mark', 'prompt', 'start', 'status']);
  });

  it('adds no telemetry/economics/metrics/json option or command anywhere', () => {
    const forbidden = /telemetry|economics|metrics|json|invocation/i;
    for (const command of program.commands) {
      expect(forbidden.test(command.name())).toBe(false);
      for (const option of command.options) expect(option.flags).not.toMatch(forbidden);
      expect(command.description()).not.toMatch(/telemetry|economics/i);
    }
  });

  it('keeps the seven workflow modes', () => {
    expect([...VALID_MODES]).toHaveLength(7);
  });
});

describe('makeRunId is unchanged and independent of invocation identity', () => {
  it('keeps the timestamp-slug format and slug rules', () => {
    expect(makeRunId('Add Login!! Now')).toMatch(/^\d{8}T\d{6}-add-login-now$/);
    expect(makeRunId('anything', 'My Name')).toMatch(/^\d{8}T\d{6}-my-name$/);
    expect(makeRunId('!!!')).toMatch(/^\d{8}T\d{6}-run$/);
    expect(makeRunId('x'.repeat(100))).toMatch(/^\d{8}T\d{6}-x{30}$/);
    expect(makeRunId('a')).not.toMatch(/inv-/);
  });

  it('the run folder name equals runId and telemetry never adds files to it', () => {
    withTmp((tmp) => {
      runCli(['start', 'audit run', '--root', tmp]);
      const runsDir = path.join(tmp, '.my-dev-kit-orchestrator', 'runs');
      const [runId] = fs.readdirSync(runsDir);
      const meta = JSON.parse(fs.readFileSync(path.join(runsDir, runId, 'run.json'), 'utf8'));
      expect(meta.runId).toBe(runId);
      runCli(['prompt', '--root', tmp]);
      const inRun: string[] = [];
      const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) walk(path.join(dir, entry.name));
          else inRun.push(entry.name);
        }
      };
      walk(path.join(runsDir, runId));
      expect(inRun.filter((n) => /^inv-|telemetry|economics/i.test(n))).toEqual([]);
    });
  });
});

describe('storage layout and no aggregate persistence', () => {
  it('every telemetry file sits at telemetry/<run-id>/(pending|invocations)/inv-*.json and no aggregate exists anywhere', () => {
    withTmp((tmp) => {
      runCli(['start', 'audit run', '--root', tmp]);
      const runsDir = path.join(tmp, '.my-dev-kit-orchestrator', 'runs');
      const [runId] = fs.readdirSync(runsDir);
      const meta = loadRun(path.join(runsDir, runId));
      runCli(['prompt', '--root', tmp]);
      runCli(['mark', path.basename(meta.stages[0].artifactFile), '--state', 'incomplete', '--reason', 'r', '--root', tmp]);
      for (const args of [['status'], ['check'], ['check', '--all'], ['export'], ['list']]) runCli([...args, '--root', tmp]);

      const all: string[] = [];
      const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else all.push(path.relative(tmp, full).split(path.sep).join('/'));
        }
      };
      walk(tmp);
      const telemetry = all.filter((f) => f.startsWith('.my-dev-kit-orchestrator/telemetry/'));
      expect(telemetry.length).toBe(3); // start, prompt, mark; inspection commands added none
      for (const file of telemetry) {
        expect(file).toMatch(new RegExp(`^\\.my-dev-kit-orchestrator/telemetry/${runId}/(invocations)/inv-[0-9a-f]{32}\\.json$`));
      }
      expect(all.filter((f) => /economics|metrics/i.test(f))).toEqual([]);
      expect(all.filter((f) => f.includes('/runs/') && /inv-[0-9a-f]{32}/.test(f))).toEqual([]);
    });
  });
});

describe('Batch 3 hardening is visible on the public surfaces', () => {
  it('unrecognized recorded values are counted honestly on status and export, without inventing meaning', () => {
    withTmp((tmp) => {
      const meta = readyTelemetryRun(tmp);
      seedCompleted(tmp, meta.runId, { mark: { artifact: 'a.txt', requestedState: 'weird', reasonProvided: false } });
      const status = runCli(['status', '--root', tmp]).output;
      expect(status).toContain('  Unrecognized values: 1');
      const exported = runCli(['export', '--root', tmp]).output;
      expect(exported).toContain('  Unrecognized values: 1');
      expect(exported).toContain('Mark requested incomplete: 0');
      const check = runCli(['check', '--root', tmp]).output;
      expect(check).toContain('[warn] TELEMETRY_UNRECOGNIZED_VALUE: 1 recorded value(s)');
    });
  });
});

describe('Semantic Continuity snapshot labelling and applicability', () => {
  it('a Semantic-Continuity-active run reports observed snapshots; greenfield reports not-applicable and never active state', () => {
    withTmp((tmp) => {
      runCli(['start', 'audit run', '--root', tmp]);
      runCli(['prompt', '--root', tmp]);
      const exported = runCli(['export', '--root', tmp]).output;
      expect(exported).toMatch(/Continuity snapshots observed: 1\b/);
      expect(exported).toMatch(/Continuity snapshots not applicable: 0\b/);
    });
    withTmp((tmp) => {
      runCli(['start', 'audit run', '--mode', 'greenfield', '--root', tmp]);
      runCli(['prompt', '--root', tmp]);
      const exported = runCli(['export', '--root', tmp]).output;
      expect(exported).toMatch(/Continuity snapshots observed: 0\b/);
      // start carries no continuity snapshot at all (it evaluates nothing, so nothing is claimed);
      // prompt records not-applicable for greenfield.
      expect(exported).toMatch(/Continuity snapshots not applicable: 1\b/);
      expect(exported).toMatch(/Continuity snapshots unavailable: 0\b/);
      expect(exported).not.toContain('Semantic continuity');
    });
  });

  it('the label reuses only fields the canonical evaluator derives from existing Semantic Continuity observations', () => {
    const surface = fs.readFileSync(path.join(__dirname, '..', 'src', 'workflowEconomicsSurface.ts'), 'utf8');
    expect(surface).not.toMatch(/semanticContinuitySurface|instructions\/semanticContinuity|evaluateSemanticContinuity/);
  });
});
