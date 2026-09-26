import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRun, loadRun } from '../src/run';
import { initWorkspace } from '../src/workspace';
import { RUN_TELEMETRY_VERSION, RunTelemetryRecord, getTelemetryRoot } from '../src/runTelemetry';
import { readRunTelemetryRecords } from '../src/runTelemetryStore';
import * as judgeModule from '../src/judgeIntegrity';
import { evaluateJudgeIntegrity } from '../src/judgeIntegrity';
import { evaluateRunIntegrityGate } from '../src/runIntegrityGate';
import { resolveGateCurrentStage } from '../src/stageDetector';
import { readArtifactStateFile } from '../src/artifactLifecycle';
import { runCli } from './cliTestHelpers';

function withTmp<T>(fn: (tmp: string) => T): T {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orc-telemetry-rec-'));
  try {
    return fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function hashTree(dir: string): string {
  const hash = crypto.createHash('sha256');
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else hash.update(path.relative(dir, full)).update(fs.readFileSync(full));
    }
  };
  walk(dir);
  return hash.digest('hex');
}

function startRun(tmp: string, extra: string[] = []): string {
  runCli(['start', 'a request', '--root', tmp, ...extra]);
  const runsDir = path.join(tmp, '.my-dev-kit-orchestrator', 'runs');
  return fs.readdirSync(runsDir).sort()[0];
}

function records(tmp: string, runId: string): { completed: RunTelemetryRecord[]; pending: RunTelemetryRecord[]; codes: string[] } {
  const result = readRunTelemetryRecords(tmp, runId);
  if (!result.ok) return { completed: [], pending: [], codes: [] };
  return {
    completed: result.value.records.filter((r) => r.state === 'completed'),
    pending: result.value.records.filter((r) => r.state === 'pending'),
    codes: result.value.diagnostics.map((d) => d.code),
  };
}

function loadFor(tmp: string, runId: string) {
  return loadRun(path.join(tmp, '.my-dev-kit-orchestrator', 'runs', runId));
}

function walkNames(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => [e.name, ...(e.isDirectory() ? walkNames(path.join(dir, e.name)) : [])]);
}

describe('start recording', () => {
  it('records exactly one completed start invocation with bounded run facts and no leftover pending', () => {
    withTmp((tmp) => {
      const runId = startRun(tmp);
      const { completed, pending } = records(tmp, runId);
      expect(pending).toEqual([]);
      expect(completed).toHaveLength(1);
      const [record] = completed;
      expect(record.command).toBe('start');
      expect(record.runId).toBe(runId);
      expect(record.invocationId).toMatch(/^inv-[0-9a-f]{32}$/);
      expect(record.durationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(record.durationMs)).toBe(true);
      expect(record.observations).toMatchObject({ outcome: 'succeeded', mode: 'feature', runStatus: 'created', stageIndex: 0 });
      expect((record.observations as { stageCount: number }).stageCount).toBeGreaterThan(0);
      expect(fs.readdirSync(path.join(tmp, '.my-dev-kit-orchestrator', 'runs', runId)).sort()).toEqual(
        ['00-request.txt', 'artifacts', 'prompts', 'reports', 'run.json'].sort().filter((n) => fs.existsSync(path.join(tmp, '.my-dev-kit-orchestrator', 'runs', runId, n))),
      );
    });
  });

  it('a start failure that creates no run creates no telemetry', () => {
    withTmp((tmp) => {
      const res = runCli(['start', 'x', '--root', tmp, '--mode', 'not-a-mode']);
      expect(res.exitCode).toBe(1);
      expect(fs.existsSync(getTelemetryRoot(tmp))).toBe(false);
    });
  });

  it('a custom --output-dir keeps telemetry under the workspace telemetry root, not the run folder', () => {
    withTmp((tmp) => {
      const out = path.join(tmp, 'custom-out');
      runCli(['start', 'x', '--root', tmp, '--output-dir', out]);
      const [runId] = fs.readdirSync(out);
      expect(walkNames(path.join(out, runId)).some((n) => /telemetry|inv-/.test(n))).toBe(false);
      expect(records(tmp, runId).completed).toHaveLength(1);
    });
  });

  it('extraction telemetry lives with the target repository, never the source repository', () => {
    withTmp((tmp) => {
      const source = path.join(tmp, 'source');
      const target = path.join(tmp, 'target');
      fs.mkdirSync(source);
      fs.mkdirSync(target);
      runCli(['start', 'x', '--mode', 'extraction', '--source', source, '--target', target]);
      expect(fs.existsSync(getTelemetryRoot(target))).toBe(true);
      expect(fs.existsSync(getTelemetryRoot(source))).toBe(false);
      expect(fs.existsSync(path.join(source, '.my-dev-kit-orchestrator'))).toBe(false);
    });
  });
});

describe('prompt recording', () => {
  it('records one completed prompt with the emitted character count and canonical observations, leaving the run folder untouched', () => {
    withTmp((tmp) => {
      const runId = startRun(tmp);
      const runFolder = path.join(tmp, '.my-dev-kit-orchestrator', 'runs', runId);
      const before = hashTree(runFolder);
      const res = runCli(['prompt', '--root', tmp]);
      expect(res.exitCode).toBeUndefined();
      expect(hashTree(runFolder)).toBe(before);

      const { completed, pending } = records(tmp, runId);
      expect(pending).toEqual([]);
      const promptRecords = completed.filter((r) => r.command === 'prompt');
      expect(promptRecords).toHaveLength(1);
      const obs = promptRecords[0].observations as Record<string, any>;
      expect(obs.outcome).toBe('succeeded');
      expect(obs.promptKind).toBe('stage');
      expect(obs.selectedStage).toBe(loadFor(tmp, runId).stages[0].name);
      // Character semantics: JS string length of exactly what was emitted.
      expect(obs.promptCharacterCount).toBe(res.output.length);
      expect(res.output).not.toContain('Telemetry warning');
      // Prompt body is never persisted.
      const raw = fs.readFileSync(path.join(getTelemetryRoot(tmp), runId, 'invocations', `${promptRecords[0].invocationId}.json`), 'utf8');
      expect(raw.length).toBeLessThan(2500);
      expect(raw).not.toContain(res.output.slice(0, 80));
      expect(raw).not.toMatch(/token|cost/i);

      // Canonical observations equal the canonical result already used by the command.
      const meta = loadFor(tmp, runId);
      const gate = evaluateRunIntegrityGate({
        mode: meta.mode,
        runFolder: meta.runFolder,
        workflowStageNames: meta.stages.map((s) => s.name),
        currentStage: resolveGateCurrentStage(meta, readArtifactStateFile(meta.runFolder)),
        projectRoot: meta.projectRoot,
        semanticContinuityVersion: meta.semanticContinuityVersion,
        proofOnly: meta.proofOnly === true,
      });
      const judge = evaluateJudgeIntegrity({ gate, runFolder: meta.runFolder, mode: meta.mode });
      expect(obs.integrity).toMatchObject({
        availability: 'observed',
        runIntegrityReady: gate.runIntegrityReady,
        expectedJudgeVerdict: gate.expectedJudgeVerdict,
      });
      expect(obs.judge).toMatchObject({
        availability: 'observed',
        judgeArtifactPresent: judge.judgeArtifactPresent,
        verdictParseStatus: judge.judgeVerdictParseStatus,
        verdictAccepted: judge.judgeVerdictAccepted,
      });
      expect(obs.semanticContinuity.availability).toBe(gate.semanticContinuityRequired ? 'observed' : 'not-applicable');
      if (gate.semanticContinuityRequired) expect(obs.semanticContinuity.classification).toBe(gate.semanticContinuityClassification);
    });
  });

  it('repeated prompts produce distinct immutable records in deterministic order', () => {
    withTmp((tmp) => {
      const runId = startRun(tmp);
      runCli(['prompt', '--root', tmp]);
      const first = records(tmp, runId).completed.filter((r) => r.command === 'prompt');
      const firstFile = path.join(getTelemetryRoot(tmp), runId, 'invocations', `${first[0].invocationId}.json`);
      const firstBytes = fs.readFileSync(firstFile, 'utf8');
      runCli(['prompt', '--root', tmp]);
      const all = records(tmp, runId).completed;
      const prompts = all.filter((r) => r.command === 'prompt');
      expect(prompts).toHaveLength(2);
      expect(new Set(prompts.map((r) => r.invocationId)).size).toBe(2);
      expect(fs.readFileSync(firstFile, 'utf8')).toBe(firstBytes);
      const again = records(tmp, runId).completed.map((r) => r.invocationId);
      expect(again).toEqual(all.map((r) => r.invocationId));
    });
  });

  it('a handled failure after the pending record is finalized as failed and keeps exit code 1', () => {
    withTmp((tmp) => {
      const runId = startRun(tmp);
      const res = runCli(['prompt', 'no-such-stage', '--root', tmp]);
      expect(res.exitCode).toBe(1);
      const { completed, pending } = records(tmp, runId);
      expect(pending).toEqual([]);
      const failed = completed.filter((r) => r.command === 'prompt');
      expect(failed).toHaveLength(1);
      expect(failed[0].observations).toMatchObject({ outcome: 'failed' });
      expect(JSON.stringify(failed[0])).not.toContain('no-such-stage');
    });
  });

  it('an unknown run creates no telemetry', () => {
    withTmp((tmp) => {
      const runId = startRun(tmp);
      const res = runCli(['prompt', '--run', 'missing-run', '--root', tmp]);
      expect(res.exitCode).toBe(1);
      expect(records(tmp, runId).completed.filter((r) => r.command === 'prompt')).toEqual([]);
      expect(fs.existsSync(path.join(getTelemetryRoot(tmp), 'missing-run'))).toBe(false);
    });
  });

  it('an interruption after the pending record leaves it pending, with no fabricated outcome', () => {
    withTmp((tmp) => {
      const runId = startRun(tmp);
      // Interrupt only once the pending record exists (loadRun evaluates judge state earlier).
      const original = judgeModule.evaluateJudgeIntegrity;
      const pendingDir = path.join(getTelemetryRoot(tmp), runId, 'pending');
      const spy = jest.spyOn(judgeModule, 'evaluateJudgeIntegrity').mockImplementation((input) => {
        if (fs.existsSync(pendingDir) && fs.readdirSync(pendingDir).length > 0) throw new Error('simulated interruption');
        return original(input);
      });
      try {
        expect(() => runCli(['prompt', '--root', tmp])).toThrow('simulated interruption');
      } finally {
        spy.mockRestore();
      }
      const { completed, pending, codes } = records(tmp, runId);
      expect(completed.filter((r) => r.command === 'prompt')).toEqual([]);
      expect(pending).toHaveLength(1);
      expect(pending[0].command).toBe('prompt');
      expect(pending[0].observations).toEqual({});
      expect(codes).not.toContain('DUPLICATE_INVOCATION_ID');
    });
  });
});

describe('mark recording', () => {
  it('records bounded lifecycle facts without the reason text and leaves artifact-state canonical', () => {
    withTmp((tmp) => {
      const runId = startRun(tmp);
      const meta = loadFor(tmp, runId);
      const artifact = path.basename(meta.stages[0].artifactFile);
      const res = runCli(['mark', artifact, '--state', 'blocked', '--reason', 'SECRET-REASON-TEXT', '--root', tmp]);
      expect(res.exitCode).toBeUndefined();
      const marks = records(tmp, runId).completed.filter((r) => r.command === 'mark');
      expect(marks).toHaveLength(1);
      expect(marks[0].observations).toMatchObject({
        outcome: 'succeeded',
        mark: { artifact, requestedState: 'blocked', reasonProvided: true },
        integrity: { availability: 'unavailable' },
        judge: { availability: 'unavailable' },
        semanticContinuity: { availability: 'unavailable' },
      });
      expect(JSON.stringify(marks[0])).not.toContain('SECRET-REASON-TEXT');
      const state = readArtifactStateFile(meta.runFolder);
      expect(JSON.stringify(state)).toContain('SECRET-REASON-TEXT');
      expect(fs.existsSync(path.join(meta.runFolder, 'artifact-state.json'))).toBe(true);
    });
  });

  it('marking complete copies the gate result the command already computed', () => {
    withTmp((tmp) => {
      const runId = startRun(tmp);
      const meta = loadFor(tmp, runId);
      const artifact = path.basename(meta.stages[0].artifactFile);
      runCli(['mark', artifact, '--state', 'complete', '--root', tmp]);
      const [mark] = records(tmp, runId).completed.filter((r) => r.command === 'mark');
      const obs = mark.observations as Record<string, any>;
      expect(obs.outcome).toBe('succeeded');
      expect(obs.mark).toMatchObject({ artifact, requestedState: 'complete', resultingState: 'missing', reasonProvided: false });
      expect(obs.integrity.availability).toBe('observed');
      expect(obs.judge.availability).toBe('observed');
    });
  });

  it('a handled rejection is finalized as failed and keeps exit code 1', () => {
    withTmp((tmp) => {
      const runId = startRun(tmp);
      const res = runCli(['mark', 'final-report.txt', '--state', 'complete', '--root', tmp]);
      expect(res.exitCode).toBe(1);
      const { completed, pending } = records(tmp, runId);
      expect(pending).toEqual([]);
      const [mark] = completed.filter((r) => r.command === 'mark');
      expect(mark.observations).toMatchObject({ outcome: 'failed', mark: { artifact: 'final-report.txt', requestedState: 'complete' } });
    });
  });

  it('a rejection before any run/artifact is validated creates no record', () => {
    withTmp((tmp) => {
      const runId = startRun(tmp);
      const res = runCli(['mark', 'not-an-artifact.txt', '--state', 'complete', '--root', tmp]);
      expect(res.exitCode).toBe(1);
      expect(records(tmp, runId).completed.filter((r) => r.command === 'mark')).toEqual([]);
    });
  });
});

describe('semantic continuity applicability and naming', () => {
  it('greenfield reports not-applicable and no telemetry filename mentions semantic or rsp-state', () => {
    withTmp((tmp) => {
      const runId = startRun(tmp, ['--mode', 'greenfield']);
      runCli(['prompt', '--root', tmp]);
      const [prompt] = records(tmp, runId).completed.filter((r) => r.command === 'prompt');
      expect((prompt.observations as any).semanticContinuity).toEqual({ availability: 'not-applicable' });
      expect(walkNames(getTelemetryRoot(tmp)).some((n) => /semantic|rsp-state/i.test(n))).toBe(false);
    });
  });

  it('removing telemetry does not change later canonical prompt output', () => {
    withTmp((tmp) => {
      startRun(tmp);
      const withTelemetry = runCli(['prompt', '--root', tmp]).output;
      fs.rmSync(getTelemetryRoot(tmp), { recursive: true, force: true });
      const without = runCli(['prompt', '--root', tmp]).output;
      expect(without).toBe(withTelemetry);
    });
  });
});

describe('telemetry failure and compatibility', () => {
  it('a telemetry write failure keeps output and exit behavior and emits one bounded warning', () => {
    withTmp((tmp) => {
      initWorkspace(tmp);
      const meta = createRun({ request: 'r', mode: 'feature', projectRoot: tmp, runTelemetryVersion: RUN_TELEMETRY_VERSION });
      const baseline = runCli(['prompt', '--root', tmp]).output;
      fs.rmSync(getTelemetryRoot(tmp), { recursive: true, force: true });
      fs.writeFileSync(getTelemetryRoot(tmp), 'not a directory', 'utf8');
      const res = runCli(['prompt', '--root', tmp]);
      expect(res.exitCode).toBeUndefined();
      const warnings = res.output.split('\n').filter((line) => line.startsWith('Telemetry warning:'));
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/^Telemetry warning: [A-Z_]+$/);
      expect(res.output.replace(warnings[0], '')).toBe(baseline);
      expect(warnings[0]).not.toContain(tmp);
      expect(res.output).not.toMatch(/\bat .*\(.*:\d+:\d+\)/);
      expect(meta.runId).toBeTruthy();
    });
  });

  it('a legacy run records nothing and warns about nothing', () => {
    withTmp((tmp) => {
      initWorkspace(tmp);
      const meta = createRun({ request: 'legacy', mode: 'feature', projectRoot: tmp });
      const runFolder = meta.runFolder;
      const before = hashTree(runFolder);
      const artifact = path.basename(meta.stages[0].artifactFile);
      const prompt = runCli(['prompt', '--root', tmp]);
      const mark = runCli(['mark', artifact, '--state', 'incomplete', '--reason', 'r', '--root', tmp]);
      expect(prompt.output).not.toContain('Telemetry');
      expect(mark.output).not.toContain('Telemetry');
      expect(fs.existsSync(getTelemetryRoot(tmp))).toBe(false);
      expect(hashTree(runFolder)).not.toBe(before); // mark's own canonical state change only
    });
  });

  it('an unsupported run telemetry version writes no 1.0.0 record and warns once', () => {
    withTmp((tmp) => {
      initWorkspace(tmp);
      createRun({ request: 'r', mode: 'feature', projectRoot: tmp, runTelemetryVersion: '9.9.9' });
      const res = runCli(['prompt', '--root', tmp]);
      expect(res.exitCode).toBeUndefined();
      expect(res.output.split('\n').filter((l) => l === 'Telemetry warning: UNSUPPORTED_RUN_TELEMETRY_VERSION')).toHaveLength(1);
      expect(fs.existsSync(getTelemetryRoot(tmp))).toBe(false);
    });
  });

  it('inspection commands never create invocation records', () => {
    withTmp((tmp) => {
      const runId = startRun(tmp);
      const before = records(tmp, runId).completed.map((r) => r.invocationId);
      for (const args of [['status'], ['check'], ['check', '--all'], ['export'], ['list']]) {
        runCli([...args, '--root', tmp]);
      }
      expect(records(tmp, runId).completed.map((r) => r.invocationId)).toEqual(before);
      expect(records(tmp, runId).pending).toEqual([]);
    });
  });
});

describe('dependency direction', () => {
  const read = (file: string): string => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');

  it('the observation adapter projects canonical owners; no owner imports telemetry', () => {
    const adapter = read('runTelemetryObservation.ts');
    expect(adapter).toMatch(/from '\.\/runIntegrityGate'/);
    expect(adapter).toMatch(/from '\.\/judgeIntegrity'/);
    expect(adapter).toMatch(/from '\.\/semanticContinuitySurface'/);
    for (const file of ['runIntegrityGate.ts', 'judgeIntegrity.ts', 'artifactLifecycle.ts', 'semanticContinuitySurface.ts', 'correctionRouter.ts', 'stageDetector.ts', 'runLifecycle.ts']) {
      expect(read(file)).not.toMatch(/runTelemetry/);
    }
  });

  it('only start, prompt, and mark are instrumented', () => {
    for (const file of ['init.ts', 'list.ts', 'status.ts', 'check.ts', 'export.ts']) {
      const full = path.join(__dirname, '..', 'src', 'commands', file);
      // Inspection commands may READ telemetry through the surface, but never import the recording API.
      if (fs.existsSync(full)) expect(fs.readFileSync(full, 'utf8')).not.toMatch(/beginTelemetryInvocation|createPendingInvocation|completeInvocation|runTelemetryObservation/);
    }
  });
});
