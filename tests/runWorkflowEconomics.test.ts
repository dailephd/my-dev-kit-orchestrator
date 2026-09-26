import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import packageJson from '../package.json';
import {
  RUN_TELEMETRY_RECORD_KIND,
  RUN_TELEMETRY_VERSION,
  RunTelemetryCommand,
  RunTelemetryObservations,
  RunTelemetryRecord,
  getTelemetryRoot,
} from '../src/runTelemetry';
import { completeInvocation, createPendingInvocation, readRunTelemetry } from '../src/runTelemetryStore';
import {
  WORKFLOW_ECONOMICS_VERSION,
  WorkflowEconomicsEvaluated,
  WorkflowEconomicsSummary,
  computeRunWorkflowEconomics,
  evaluateWorkflowEconomics,
} from '../src/runWorkflowEconomics';
import * as gateModule from '../src/runIntegrityGate';
import * as judgeModule from '../src/judgeIntegrity';
import * as lifecycleModule from '../src/artifactLifecycle';
import * as continuityModule from '../src/instructions/semanticContinuity';
import { createRun } from '../src/run';
import { initWorkspace } from '../src/workspace';

const BASE = Date.parse('2026-01-01T00:00:00.000Z');
const iso = (offsetMs: number): string => new Date(BASE + offsetMs).toISOString();
let counter = 0;
const nextId = (): string => `inv-${(++counter).toString(16).padStart(32, '0')}`;

interface Spec {
  command?: RunTelemetryCommand;
  start?: number; // ms offset
  end?: number; // ms offset (defaults start + durationMs)
  durationMs?: number;
  obs?: Partial<RunTelemetryObservations>;
  id?: string;
}

function completed(spec: Spec = {}): RunTelemetryRecord {
  const start = spec.start ?? 0;
  const durationMs = spec.durationMs ?? 10;
  return {
    kind: RUN_TELEMETRY_RECORD_KIND,
    schemaVersion: RUN_TELEMETRY_VERSION,
    producer: { name: packageJson.name, version: packageJson.version },
    runId: 'run-1',
    invocationId: spec.id ?? nextId(),
    command: spec.command ?? 'prompt',
    state: 'completed',
    startedAt: iso(start),
    completedAt: iso(spec.end ?? start + durationMs),
    durationMs,
    observations: { outcome: 'succeeded', mode: 'feature', stageCount: 5, ...spec.obs },
  };
}

function pendingRecord(start = 0, id?: string): RunTelemetryRecord {
  return {
    kind: RUN_TELEMETRY_RECORD_KIND,
    schemaVersion: RUN_TELEMETRY_VERSION,
    producer: { name: packageJson.name, version: packageJson.version },
    runId: 'run-1',
    invocationId: id ?? nextId(),
    command: 'prompt',
    state: 'pending',
    startedAt: iso(start),
    observations: {},
  };
}

function evaluate(records: RunTelemetryRecord[], diagnosticCount = 0): WorkflowEconomicsEvaluated {
  const summary = evaluateWorkflowEconomics({
    runTelemetryVersion: RUN_TELEMETRY_VERSION,
    records,
    diagnostics: Array.from({ length: diagnosticCount }, () => ({ code: 'MALFORMED_JSON' as const, message: 'x' })),
  });
  if (!('coverage' in summary)) throw new Error('expected evaluated summary');
  return summary;
}

function stage(index: number, name = `s${index}`): Partial<RunTelemetryObservations> {
  return { currentStage: name, stageIndex: index };
}

const integrity = (ready: boolean): Partial<RunTelemetryObservations> => ({
  integrity: { availability: 'observed', runIntegrityReady: ready },
});
const unavailable: Partial<RunTelemetryObservations> = { integrity: { availability: 'unavailable' } };
const eligible = (value: boolean): Partial<RunTelemetryObservations> => ({
  judge: { availability: 'observed', verdictAccepted: true, finalReportEligible: value },
});

function checkInvariants(s: WorkflowEconomicsEvaluated): void {
  const c = s.coverage;
  expect(c.completedInvocationCount).toBe(c.succeededInvocationCount + c.failedInvocationCount);
  expect(s.interactions.start.completed + s.interactions.prompt.completed + s.interactions.mark.completed).toBe(c.completedInvocationCount);
  for (const key of ['start', 'prompt', 'mark'] as const) {
    expect(s.interactions[key].completed).toBe(s.interactions[key].succeeded + s.interactions[key].failed);
  }
  expect(s.prompts.promptRenderedCount).toBeLessThanOrEqual(s.interactions.prompt.completed);
  expect(s.prompts.normalPromptRenderCount + s.prompts.correctionPromptRenderCount).toBeLessThanOrEqual(s.interactions.prompt.completed);
  expect(s.durations.startDurationMs! + s.durations.promptDurationMs! + s.durations.markDurationMs!).toBe(s.durations.totalInvocationDurationMs);
  expect(s.stages.stageTransitionCount).toBe(s.stages.forwardStageTransitionCount + s.stages.backwardStageTransitionCount);
  expect(s.stages.stageRevisitCount).toBe(s.stages.backwardStageTransitionCount);
  expect(s.stages.stageComparableBoundaryCount).toBe(s.stages.stageTransitionCount + s.stages.unchangedStageBoundaryCount);
  expect(s.integrity.integrityReadyObservationCount + s.integrity.integrityBlockedObservationCount).toBe(s.integrity.integrityObservationCount);
  expect(s.judge.judgeAcceptedObservationCount + s.judge.judgeRejectedObservationCount).toBeLessThanOrEqual(s.judge.judgeObservationCount);
  expect(s.judge.finalEligibleObservationCount + s.judge.finalIneligibleObservationCount).toBe(s.judge.finalEligibilityObservationCount);
  expect(s.lifecycle.successfulMarkCount + s.lifecycle.failedMarkCount).toBe(s.interactions.mark.completed);
}

describe('availability', () => {
  it('a legacy run is not-activated with no metrics', () => {
    const summary = evaluateWorkflowEconomics({ records: [], diagnostics: [] });
    expect(summary).toEqual({ economicsVersion: '1.0.0', availability: 'not-activated', telemetryVersion: null });
    expect(WORKFLOW_ECONOMICS_VERSION).toBe('1.0.0');
  });

  it('an unsupported version is unsupported and is never read as 1.0.0', () => {
    const summary = evaluateWorkflowEconomics({ runTelemetryVersion: '2.0.0', records: [completed()], diagnostics: [] });
    expect(summary).toEqual({ economicsVersion: '1.0.0', availability: 'unsupported', telemetryVersion: null });
  });

  it('an activated empty run is available with zero counts and unavailable (null) extrema', () => {
    const s = evaluate([]);
    expect(s.availability).toBe('available');
    expect(s.coverage).toMatchObject({ completedInvocationCount: 0, incompleteInvocationCount: 0, concurrencyDetected: false });
    expect(s.prompts).toMatchObject({ promptRenderedCount: 0, totalPromptCharacters: 0, minimumPromptCharacters: null, maximumPromptCharacters: null, averagePromptCharacters: null });
    expect(s.durations).toMatchObject({ totalInvocationDurationMs: 0, minimumInvocationDurationMs: null, maximumInvocationDurationMs: null, averageInvocationDurationMs: null });
    expect(s.observedWorkflowSpanMs).toBeNull();
    checkInvariants(s);
  });
});

describe('interaction economics', () => {
  it('counts start, prompt, and mark completions and preserves invariants', () => {
    const s = evaluate([
      completed({ command: 'start', start: 0 }),
      completed({ command: 'prompt', start: 100 }),
      completed({ command: 'mark', start: 200 }),
    ]);
    expect(s.availability).toBe('available');
    expect(s.interactions).toEqual({
      start: { completed: 1, succeeded: 1, failed: 0 },
      prompt: { completed: 1, succeeded: 1, failed: 0 },
      mark: { completed: 1, succeeded: 1, failed: 0 },
    });
    expect(s.coverage.completedInvocationCount).toBe(3);
    checkInvariants(s);
  });

  it('failed completed interactions are counted separately from succeeded', () => {
    const s = evaluate([
      completed({ command: 'prompt', start: 0 }),
      completed({ command: 'prompt', start: 100, obs: { outcome: 'failed' } }),
      completed({ command: 'mark', start: 200, obs: { outcome: 'failed', mark: { artifact: 'a.txt', requestedState: 'complete', reasonProvided: false } } }),
    ]);
    expect(s.coverage).toMatchObject({ completedInvocationCount: 3, succeededInvocationCount: 1, failedInvocationCount: 2 });
    expect(s.interactions.prompt).toEqual({ completed: 2, succeeded: 1, failed: 1 });
    expect(s.lifecycle).toMatchObject({ successfulMarkCount: 0, failedMarkCount: 1 });
    checkInvariants(s);
  });

  it('a pending record is partial coverage and contributes to no completed metric', () => {
    const s = evaluate([completed({ start: 0 }), pendingRecord(50)]);
    expect(s.availability).toBe('partial');
    expect(s.coverage).toMatchObject({ completedInvocationCount: 1, incompleteInvocationCount: 1 });
    expect(s.interactions.prompt.completed).toBe(1);
    expect(s.observedWorkflowSpanMs).toBe(10);
    checkInvariants(s);
  });

  it('a pending copy of a completed invocation is not a second or incomplete invocation', () => {
    const done = completed({ start: 0 });
    const s = evaluate([done, pendingRecord(0, done.invocationId)], 1);
    expect(s.coverage).toMatchObject({ completedInvocationCount: 1, incompleteInvocationCount: 0, telemetryDiagnosticCount: 1 });
    expect(s.availability).toBe('partial');
  });

  it('reader diagnostics keep invalid records out of metrics and make coverage partial', () => {
    const s = evaluate([completed({ start: 0 })], 2);
    expect(s.coverage.telemetryDiagnosticCount).toBe(2);
    expect(s.availability).toBe('partial');
    expect(s.coverage.completedInvocationCount).toBe(1);
  });
});

describe('prompt economics', () => {
  it('aggregates rendered prompt characters and ignores terminal prompts without a count', () => {
    const s = evaluate([
      completed({ start: 0, obs: { promptCharacterCount: 100, promptKind: 'stage' } }),
      completed({ start: 100, obs: { promptCharacterCount: 250, promptKind: 'stage' } }),
      completed({ start: 200, obs: { promptCharacterCount: 101, promptKind: 'correction' } }),
      completed({ start: 300 }), // terminal message: no prompt rendered
    ]);
    expect(s.interactions.prompt.completed).toBe(4);
    expect(s.prompts).toEqual({
      promptRenderedCount: 3,
      normalPromptRenderCount: 2,
      correctionPromptRenderCount: 1,
      totalPromptCharacters: 451,
      minimumPromptCharacters: 100,
      maximumPromptCharacters: 250,
      averagePromptCharacters: 150.33,
    });
    expect(Object.keys(s.prompts).join()).not.toMatch(/token|cost|cycle/i);
    checkInvariants(s);
  });

  it('never counts a correction prompt as a stage revisit or a correction cycle', () => {
    const s = evaluate([
      completed({ start: 0, obs: { ...stage(2), promptKind: 'correction', promptCharacterCount: 10 } }),
      completed({ start: 100, obs: { ...stage(2), promptKind: 'correction', promptCharacterCount: 10 } }),
    ]);
    expect(s.prompts.correctionPromptRenderCount).toBe(2);
    expect(s.stages.stageRevisitCount).toBe(0);
    expect(JSON.stringify(s)).not.toMatch(/correctionCycle/i);
  });
});

describe('duration economics', () => {
  it('uses persisted durations, not timestamps', () => {
    const s = evaluate([
      completed({ command: 'start', start: 0, durationMs: 5, end: 9000 }),
      completed({ command: 'prompt', start: 10000, durationMs: 20, end: 10001 }),
      completed({ command: 'prompt', start: 20000, durationMs: 35.5, end: 20001 }),
      completed({ command: 'mark', start: 30000, durationMs: 4, end: 30002 }),
    ]);
    expect(s.durations).toEqual({
      totalInvocationDurationMs: 64.5,
      minimumInvocationDurationMs: 4,
      maximumInvocationDurationMs: 35.5,
      averageInvocationDurationMs: 16.13,
      startDurationMs: 5,
      promptDurationMs: 55.5,
      markDurationMs: 4,
    });
    checkInvariants(s);
  });

  it('observed workflow span includes idle gaps and is not active work time', () => {
    const s = evaluate([completed({ start: 0, durationMs: 10 }), completed({ start: 3_600_000, durationMs: 10 })]);
    expect(s.observedWorkflowSpanMs).toBe(3_600_010);
    expect(s.durations.totalInvocationDurationMs).toBe(20);
    expect(s.observedWorkflowSpanMs).not.toBe(s.durations.totalInvocationDurationMs);
  });

  it('a single completed record spans its own start to completion', () => {
    expect(evaluate([completed({ start: 500, end: 512, durationMs: 11 })]).observedWorkflowSpanMs).toBe(12);
  });
});

describe('stage economics', () => {
  it('counts forward transitions across non-overlapping completed records', () => {
    const s = evaluate([completed({ start: 0, obs: stage(1) }), completed({ start: 100, obs: stage(2) }), completed({ start: 200, obs: stage(3) })]);
    expect(s.stages).toMatchObject({ stageComparableBoundaryCount: 2, stageTransitionCount: 2, forwardStageTransitionCount: 2, backwardStageTransitionCount: 0, stageRevisitCount: 0 });
    checkInvariants(s);
  });

  it('a backward transition is a revisit', () => {
    const s = evaluate([completed({ start: 0, obs: stage(3) }), completed({ start: 100, obs: stage(2) })]);
    expect(s.stages).toMatchObject({ backwardStageTransitionCount: 1, stageRevisitCount: 1, stageTransitionCount: 1 });
    checkInvariants(s);
  });

  it('repeated prompts for the same stage are unchanged boundaries, not revisits', () => {
    const s = evaluate([completed({ start: 0, obs: { ...stage(2), selectedStage: 's2' } }), completed({ start: 100, obs: { ...stage(2), selectedStage: 's2' } })]);
    expect(s.stages).toMatchObject({ unchangedStageBoundaryCount: 1, stageTransitionCount: 0, stageRevisitCount: 0 });
    checkInvariants(s);
  });

  it('records without usable stage facts make no comparable boundary', () => {
    const s = evaluate([completed({ start: 0, obs: stage(1) }), completed({ start: 100 }), completed({ start: 200, obs: stage(2) })]);
    expect(s.stages.stageComparableBoundaryCount).toBe(0);
  });
});

describe('overlap', () => {
  it('detects overlap, infers nothing across it, and treats equality as non-overlap', () => {
    const records = [
      completed({ start: 0, durationMs: 100, obs: { ...stage(1), ...integrity(true), ...eligible(false) } }),
      completed({ start: 50, durationMs: 10, obs: { ...stage(4), ...integrity(false), ...eligible(true) } }), // overlaps previous
      completed({ start: 60, durationMs: 10, obs: { ...stage(5), ...integrity(true), ...eligible(true) } }), // starts exactly when previous ends? 60 == 50+10
    ];
    const s = evaluate(records);
    expect(s.coverage.concurrencyDetected).toBe(true);
    expect(s.ambiguousTransitionBoundaryCount).toBe(1);
    // Only the second boundary (equality, not overlap) is comparable.
    expect(s.stages.stageComparableBoundaryCount).toBe(1);
    expect(s.stages.forwardStageTransitionCount).toBe(1);
    expect(s.integrity.integrityComparableBoundaryCount).toBe(1);
    expect(s.integrity.integrityRecoveryCount).toBe(1);
    expect(s.integrity.integrityBlockedEntryCount).toBe(0);
    expect(s.judge.finalEligibilityComparableBoundaryCount).toBe(1);
    expect(s.judge.finalEligibilityLostCount).toBe(0);
    expect(s.judge.finalEligibilityReachedCount).toBe(0);
  });

  it('no overlap means no concurrency', () => {
    const s = evaluate([completed({ start: 0, durationMs: 10 }), completed({ start: 10, durationMs: 10 })]);
    expect(s.coverage.concurrencyDetected).toBe(false);
    expect(s.ambiguousTransitionBoundaryCount).toBe(0);
  });

  it('a record whose completion precedes its start is a coverage anomaly excluded from inference', () => {
    const s = evaluate([completed({ start: 100, end: 50, obs: stage(1) }), completed({ start: 200, obs: stage(2) })]);
    expect(s.coverage.wallClockAnomalyCount).toBe(1);
    expect(s.availability).toBe('partial');
    expect(s.observedWorkflowSpanMs).toBeNull();
    expect(s.stages.stageComparableBoundaryCount).toBe(0);
  });
});

describe('integrity, judge, and final-eligibility snapshots', () => {
  it('counts ready -> blocked -> ready as one entry and one recovery', () => {
    const s = evaluate([
      completed({ start: 0, obs: integrity(true) }),
      completed({ start: 100, obs: integrity(false) }),
      completed({ start: 200, obs: integrity(true) }),
    ]);
    expect(s.integrity).toMatchObject({
      integrityObservationCount: 3, integrityReadyObservationCount: 2, integrityBlockedObservationCount: 1,
      integrityComparableBoundaryCount: 2, integrityBlockedEntryCount: 1, integrityRecoveryCount: 1,
    });
    checkInvariants(s);
  });

  it('does not infer a transition across an unavailable snapshot', () => {
    const s = evaluate([completed({ start: 0, obs: integrity(true) }), completed({ start: 100, obs: unavailable }), completed({ start: 200, obs: integrity(false) })]);
    expect(s.integrity).toMatchObject({ integrityObservationCount: 2, integrityComparableBoundaryCount: 0, integrityBlockedEntryCount: 0, integrityRecoveryCount: 0 });
  });

  it('counts final eligibility reached and lost', () => {
    const s = evaluate([
      completed({ start: 0, obs: eligible(false) }),
      completed({ start: 100, obs: eligible(true) }),
      completed({ start: 200, obs: eligible(false) }),
    ]);
    expect(s.judge).toMatchObject({
      finalEligibilityObservationCount: 3, finalEligibleObservationCount: 1, finalIneligibleObservationCount: 2,
      finalEligibilityComparableBoundaryCount: 2, finalEligibilityReachedCount: 1, finalEligibilityLostCount: 1,
    });
    checkInvariants(s);
  });

  it('repeated judge snapshots are observations, never attempts', () => {
    const snapshot = { judge: { availability: 'observed', judgeArtifactPresent: true, verdictParseStatus: 'parsed', authoredVerdict: 'PASS', verdictAccepted: true } } as const;
    const s = evaluate([completed({ start: 0, obs: snapshot }), completed({ start: 100, obs: snapshot }), completed({ start: 200, obs: { judge: { availability: 'unavailable' } } })]);
    expect(s.judge).toMatchObject({ judgeObservationCount: 2, judgeAcceptedObservationCount: 2, judgeRejectedObservationCount: 0, finalEligibilityObservationCount: 0 });
    expect(JSON.stringify(s)).not.toMatch(/judgeAttempt|uniqueJudge/i);
    checkInvariants(s);
  });
});

describe('semantic continuity snapshots', () => {
  it('counts the persisted finite vocabulary without evaluating anything', () => {
    const sc = (extra: object) => ({ semanticContinuity: { availability: 'observed', ...extra } }) as Partial<RunTelemetryObservations>;
    const s = evaluate([
      completed({ start: 0, obs: sc({ classification: 'ready', continuityState: 'complete' }) }),
      completed({ start: 100, obs: sc({ classification: 'warning', continuityState: 'incomplete' }) }),
      completed({ start: 200, obs: sc({ classification: 'blocked', continuityState: 'blocked' }) }),
      completed({ start: 300, obs: sc({ classification: 'blocked', continuityState: 'mystery' }) }),
      completed({ start: 400, obs: { semanticContinuity: { availability: 'not-applicable' } } }),
      completed({ start: 500, obs: { semanticContinuity: { availability: 'unavailable' } } }),
    ]);
    expect(s.semanticContinuity).toMatchObject({
      semanticContinuityObservationCount: 4,
      semanticContinuityNotApplicableCount: 1,
      semanticContinuityUnavailableCount: 1,
      semanticReadyObservationCount: 1,
      semanticWarningObservationCount: 1,
      semanticBlockingObservationCount: 2,
      continuityStateCounts: { complete: 1, incomplete: 1, blocked: 1, unrecognized: 1, pending: 0, failed: 0, invalid: 0, indeterminate: 0, notApplicable: 0 },
    });
  });
});

describe('mark economics', () => {
  it('counts requested and resulting lifecycle observations from telemetry only', () => {
    const mark = (requestedState: string, resultingState?: string) =>
      completed({ command: 'mark', start: 0 + counter * 10, obs: { mark: { artifact: 'a.txt', requestedState, reasonProvided: false, ...(resultingState ? { resultingState } : {}) } } });
    const s = evaluate([mark('complete', 'missing'), mark('blocked'), mark('incomplete'), mark('complete', 'complete'), mark('weird')]);
    expect(s.lifecycle.requestedStateCounts).toEqual({ incomplete: 1, blocked: 1, complete: 2, unrecognized: 1 });
    expect(s.lifecycle.resultingStateObservationCount).toBe(2);
    expect(s.lifecycle.successfulMarkCount).toBe(5);
    checkInvariants(s);
  });
});

describe('determinism and numeric safety', () => {
  it('is independent of input array order and does not mutate its input', () => {
    const records = [0, 100, 200, 300, 400].map((start, i) => completed({ start, obs: { ...stage(i % 3), promptCharacterCount: 10 * (i + 1) }, durationMs: i + 1.25 }));
    const snapshot = JSON.stringify(records);
    const expected = evaluate(records);
    for (const permutation of [[...records].reverse(), [records[2], records[0], records[4], records[1], records[3]]]) {
      expect(evaluate(permutation)).toEqual(expected);
    }
    expect(JSON.stringify(records)).toBe(snapshot);
    expect(evaluate(records)).toEqual(evaluate(records));
  });

  it('handles zero and the maximum accepted values without NaN or Infinity', () => {
    const max = 1_000_000_000;
    const s = evaluate([
      completed({ start: 0, durationMs: 0, obs: { promptCharacterCount: 0, promptKind: 'stage' } }),
      completed({ start: 10, end: 20, durationMs: Number.MAX_VALUE / 4, obs: { promptCharacterCount: max, promptKind: 'stage' } }),
    ]);
    expect(s.prompts).toMatchObject({ minimumPromptCharacters: 0, maximumPromptCharacters: max, totalPromptCharacters: max, averagePromptCharacters: 500000000 });
    const numbers = JSON.stringify(s).match(/-?\d+(\.\d+)?(e[+-]?\d+)?/gi) ?? [];
    for (const n of numbers) expect(Number.isFinite(Number(n))).toBe(true);
  });

  it('an unrepresentable aggregate becomes null and partial instead of Infinity', () => {
    const s = evaluate([
      completed({ start: 0, end: 5, durationMs: Number.MAX_VALUE }),
      completed({ start: 10, end: 15, durationMs: Number.MAX_VALUE }),
    ]);
    expect(s.coverage.numericLimitExceeded).toBe(true);
    expect(s.availability).toBe('partial');
    expect(s.durations.promptDurationMs).toBeNull();
    expect(s.durations.totalInvocationDurationMs).toBeNull();
    expect(s.durations.averageInvocationDurationMs).toBeNull();
    expect(JSON.stringify(s)).not.toMatch(/Infinity|NaN/);
  });

  it('a large record set stays bounded and correct', () => {
    const records = Array.from({ length: 5000 }, (_, i) => completed({ start: i * 20, durationMs: 1, obs: { promptCharacterCount: 3, promptKind: 'stage' } }));
    const s = evaluate(records);
    expect(s.coverage.completedInvocationCount).toBe(5000);
    expect(s.prompts.totalPromptCharacters).toBe(15000);
    expect(s.durations.totalInvocationDurationMs).toBe(5000);
  });
});

// ─── Canonical reader integration and purity ─────────────────────────────────

function withTmp<T>(fn: (tmp: string) => T): T {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orc-econ-'));
  try {
    return fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
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

const OBS_BASE = { outcome: 'succeeded', mode: 'feature', stageCount: 5 } as const;

function writeInvocation(tmp: string, runId: string, id: string, startOffset: number, obs: RunTelemetryObservations, complete = true): void {
  const pending = createPendingInvocation(tmp, { runId, command: 'prompt', invocationId: id, startedAt: iso(startOffset) });
  if (!pending.ok) throw new Error(pending.error.message);
  if (!complete) return;
  const done = completeInvocation(tmp, pending.value.record, { completedAt: iso(startOffset + 5), durationMs: 5, observations: obs });
  if (!done.ok) throw new Error(done.error.message);
}

describe('canonical reader integration', () => {
  const ids = ['inv-' + 'a'.repeat(32), 'inv-' + 'b'.repeat(32), 'inv-' + '0'.repeat(32)];
  const layout: Array<[string, number]> = [[ids[0], 0], [ids[1], 100], [ids[2], 200]];

  it('produces identical summaries for different physical creation orders', () => {
    const summaries = [layout, [...layout].reverse(), [layout[1], layout[2], layout[0]]].map((order) =>
      withTmp((tmp) => {
        initWorkspace(tmp);
        const meta = createRun({ request: 'r', mode: 'feature', projectRoot: tmp, runTelemetryVersion: RUN_TELEMETRY_VERSION });
        order.forEach(([id, start]) => writeInvocation(tmp, meta.runId, id, start, { ...OBS_BASE, currentStage: 's', stageIndex: layout.findIndex(([x]) => x === id), promptCharacterCount: 10 + start }));
        const summary = computeRunWorkflowEconomics({ projectRoot: tmp, runId: meta.runId, runTelemetryVersion: RUN_TELEMETRY_VERSION });
        return summary;
      }),
    );
    expect(summaries[1]).toEqual(summaries[0]);
    expect(summaries[2]).toEqual(summaries[0]);
    expect((summaries[0] as WorkflowEconomicsEvaluated).stages.forwardStageTransitionCount).toBe(2);
  });

  it('counts a completed record once when a leftover pending copy exists, and reports partial coverage', () => {
    withTmp((tmp) => {
      initWorkspace(tmp);
      const meta = createRun({ request: 'r', mode: 'feature', projectRoot: tmp, runTelemetryVersion: RUN_TELEMETRY_VERSION });
      writeInvocation(tmp, meta.runId, ids[0], 0, OBS_BASE);
      const completedRecord = readRunTelemetry({ projectRoot: tmp, runId: meta.runId, runTelemetryVersion: RUN_TELEMETRY_VERSION }).records[0];
      // Recreate the crash edge: the pending copy survives beside the completed record.
      const pendingDir = path.join(getTelemetryRoot(tmp), meta.runId, 'pending');
      fs.mkdirSync(pendingDir, { recursive: true });
      fs.writeFileSync(path.join(pendingDir, `${ids[0]}.json`), JSON.stringify({ ...completedRecord, state: 'pending', completedAt: undefined, durationMs: undefined, observations: {} }), 'utf8');
      const summary = computeRunWorkflowEconomics({ projectRoot: tmp, runId: meta.runId, runTelemetryVersion: RUN_TELEMETRY_VERSION }) as WorkflowEconomicsEvaluated;
      expect(summary.coverage).toMatchObject({ completedInvocationCount: 1, incompleteInvocationCount: 0, telemetryDiagnosticCount: 1 });
      expect(summary.availability).toBe('partial');
    });
  });

  it('excludes an invalid record from metrics and keeps its diagnostic', () => {
    withTmp((tmp) => {
      initWorkspace(tmp);
      const meta = createRun({ request: 'r', mode: 'feature', projectRoot: tmp, runTelemetryVersion: RUN_TELEMETRY_VERSION });
      writeInvocation(tmp, meta.runId, ids[0], 0, OBS_BASE);
      const dir = path.join(getTelemetryRoot(tmp), meta.runId, 'invocations');
      fs.writeFileSync(path.join(dir, `${ids[1]}.json`), '{not json', 'utf8');
      const summary = computeRunWorkflowEconomics({ projectRoot: tmp, runId: meta.runId, runTelemetryVersion: RUN_TELEMETRY_VERSION }) as WorkflowEconomicsEvaluated;
      expect(summary.coverage).toMatchObject({ completedInvocationCount: 1, telemetryDiagnosticCount: 1, incompleteInvocationCount: 0 });
      expect(summary.availability).toBe('partial');
    });
  });

  it('a pending-only invocation is incomplete and evaluation writes nothing', () => {
    withTmp((tmp) => {
      initWorkspace(tmp);
      const meta = createRun({ request: 'r', mode: 'feature', projectRoot: tmp, runTelemetryVersion: RUN_TELEMETRY_VERSION });
      writeInvocation(tmp, meta.runId, ids[0], 0, OBS_BASE);
      writeInvocation(tmp, meta.runId, ids[1], 100, OBS_BASE, false);
      const before = [treeHash(tmp), treeHash(meta.runFolder)];
      const gate = jest.spyOn(gateModule, 'evaluateRunIntegrityGate');
      const judge = jest.spyOn(judgeModule, 'evaluateJudgeIntegrity');
      const eligibility = jest.spyOn(judgeModule, 'evaluateFinalReportEligibility');
      const mutate = jest.spyOn(lifecycleModule, 'setArtifactManualState');
      const continuity = jest.spyOn(continuityModule, 'evaluateSemanticContinuity' as never);
      try {
        const first = computeRunWorkflowEconomics({ projectRoot: tmp, runId: meta.runId, runTelemetryVersion: RUN_TELEMETRY_VERSION }) as WorkflowEconomicsEvaluated;
        const second = computeRunWorkflowEconomics({ projectRoot: tmp, runId: meta.runId, runTelemetryVersion: RUN_TELEMETRY_VERSION });
        expect(second).toEqual(first);
        expect(first.coverage).toMatchObject({ completedInvocationCount: 1, incompleteInvocationCount: 1 });
        expect(first.availability).toBe('partial');
        for (const spy of [gate, judge, eligibility, mutate, continuity]) expect(spy).not.toHaveBeenCalled();
      } finally {
        jest.restoreAllMocks();
      }
      expect([treeHash(tmp), treeHash(meta.runFolder)]).toEqual(before);
    });
  });

  it('a legacy run reads nothing and creates no telemetry', () => {
    withTmp((tmp) => {
      initWorkspace(tmp);
      const meta = createRun({ request: 'r', mode: 'feature', projectRoot: tmp });
      const summary = computeRunWorkflowEconomics({ projectRoot: tmp, runId: meta.runId });
      expect(summary.availability).toBe('not-activated');
      expect(fs.existsSync(getTelemetryRoot(tmp))).toBe(false);
    });
  });
});

describe('module boundary', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'runWorkflowEconomics.ts'), 'utf8');

  it('imports only the telemetry contract/reader and uses no clock, subprocess, or write API', () => {
    const imports = source.split('\n').filter((line) => /from '/.test(line));
    expect(imports.every((line) => /'\.\/runTelemetry(Store)?'/.test(line))).toBe(true);
    expect(source).not.toMatch(/Date\.now|new Date\(|hrtime|child_process|writeFile|unlink|mkdir|rename|fetch\(|https?:/);
  });

  it('no economics or telemetry persistence artifact name exists and only the presentation surface imports the evaluator', () => {
    expect(source).not.toMatch(/workflow-economics\.json|economics\.json|metrics\.json/);
    const srcDir = path.join(__dirname, '..', 'src');
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    const importers = walk(srcDir).filter((f) => f.endsWith('.ts') && /runWorkflowEconomics/.test(fs.readFileSync(f, 'utf8')) && !f.endsWith('runWorkflowEconomics.ts'));
    // Only the shared presentation surface may consume it; commands never import it directly.
    expect(importers.map((f) => path.basename(f))).toEqual(['workflowEconomicsSurface.ts']);
  });
});
