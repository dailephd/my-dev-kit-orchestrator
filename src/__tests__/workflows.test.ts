import {
  getWorkflow,
  getWorkflowOrThrow,
  getAllWorkflows,
} from '../workflows';
import { VALID_MODES } from '../types';

describe('workflow mode sequences', () => {
  it('feature mode has correct stage sequence', () => {
    const wf = getWorkflow('feature');
    const names = wf.stages.map((s) => s.name);
    expect(names).toEqual([
      'request-brief',
      'architecture-context',
      'behavior-model',
      'pseudocode-packet',
      'test-strategy',
      'implementation',
      'test-implementation',
      'verification',
      'judge',
      'final-report',
    ]);
  });

  it('repair mode has correct stage sequence', () => {
    const wf = getWorkflow('repair');
    const names = wf.stages.map((s) => s.name);
    expect(names).toEqual([
      'observed-behavior-report',
      'architecture-context',
      'behavior-trace',
      'divergence-report',
      'correction-design',
      'regression-test-strategy',
      'implementation',
      'test-implementation',
      'verification',
      'judge',
      'final-report',
    ]);
  });

  it('test mode has correct stage sequence', () => {
    const wf = getWorkflow('test');
    const names = wf.stages.map((s) => s.name);
    expect(names).toEqual([
      'test-target-brief',
      'architecture-context',
      'behavior-reconstruction',
      'pseudocode-summary',
      'test-strategy',
      'test-implementation',
      'verification',
      'judge',
      'final-report',
    ]);
  });

  it('refactor mode has correct stage sequence', () => {
    const wf = getWorkflow('refactor');
    const names = wf.stages.map((s) => s.name);
    expect(names).toEqual([
      'refactor-brief',
      'architecture-context',
      'existing-behavior-map',
      'preserved-invariant-list',
      'compatibility-test-strategy',
      'refactor-pseudocode-packet',
      'implementation',
      'test-implementation',
      'verification',
      'judge',
      'final-report',
    ]);
  });

  it('harden mode has correct stage sequence', () => {
    const wf = getWorkflow('harden');
    const names = wf.stages.map((s) => s.name);
    expect(names).toEqual([
      'hardening-brief',
      'architecture-context',
      'assumption-report',
      'failure-mode-matrix',
      'guard-pseudocode-packet',
      'resilience-test-strategy',
      'implementation',
      'test-implementation',
      'verification',
      'judge',
      'final-report',
    ]);
  });
});

describe('artifact filenames', () => {
  for (const mode of VALID_MODES) {
    it(`every stage in ${mode} mode has an artifact filename`, () => {
      const wf = getWorkflow(mode);
      for (const stage of wf.stages) {
        expect(stage.artifactFile).toBeTruthy();
        expect(stage.artifactFile).toMatch(/^artifacts\/.+\.txt$/);
      }
    });
  }

  it('feature mode artifact filenames match spec', () => {
    const wf = getWorkflow('feature');
    const map: Record<string, string> = {};
    for (const s of wf.stages) map[s.name] = s.artifactFile;

    expect(map['request-brief']).toBe('artifacts/request-brief.txt');
    expect(map['architecture-context']).toBe('artifacts/architecture-context-packet.txt');
    expect(map['behavior-model']).toBe('artifacts/behavior-model.txt');
    expect(map['pseudocode-packet']).toBe('artifacts/pseudocode-packet.txt');
    expect(map['test-strategy']).toBe('artifacts/test-strategy-packet.txt');
    expect(map['implementation']).toBe('artifacts/implementation-report.txt');
    expect(map['test-implementation']).toBe('artifacts/test-implementation-report.txt');
    expect(map['verification']).toBe('artifacts/verification-report.txt');
    expect(map['judge']).toBe('artifacts/judge-report.txt');
    expect(map['final-report']).toBe('artifacts/final-report.txt');
  });

  it('repair mode has mode-specific artifact filenames', () => {
    const wf = getWorkflow('repair');
    const map: Record<string, string> = {};
    for (const s of wf.stages) map[s.name] = s.artifactFile;

    expect(map['observed-behavior-report']).toBe('artifacts/observed-behavior-report.txt');
    expect(map['behavior-trace']).toBe('artifacts/behavior-trace.txt');
    expect(map['divergence-report']).toBe('artifacts/divergence-report.txt');
    expect(map['correction-design']).toBe('artifacts/correction-design.txt');
    expect(map['regression-test-strategy']).toBe('artifacts/regression-test-strategy.txt');
  });

  it('test mode has mode-specific artifact filenames', () => {
    const wf = getWorkflow('test');
    const map: Record<string, string> = {};
    for (const s of wf.stages) map[s.name] = s.artifactFile;

    expect(map['test-target-brief']).toBe('artifacts/test-target-brief.txt');
    expect(map['behavior-reconstruction']).toBe('artifacts/behavior-reconstruction.txt');
    expect(map['pseudocode-summary']).toBe('artifacts/pseudocode-summary.txt');
  });

  it('refactor mode has mode-specific artifact filenames', () => {
    const wf = getWorkflow('refactor');
    const map: Record<string, string> = {};
    for (const s of wf.stages) map[s.name] = s.artifactFile;

    expect(map['refactor-brief']).toBe('artifacts/refactor-brief.txt');
    expect(map['existing-behavior-map']).toBe('artifacts/existing-behavior-map.txt');
    expect(map['preserved-invariant-list']).toBe('artifacts/preserved-invariant-list.txt');
    expect(map['compatibility-test-strategy']).toBe('artifacts/compatibility-test-strategy.txt');
    expect(map['refactor-pseudocode-packet']).toBe('artifacts/refactor-pseudocode-packet.txt');
  });

  it('harden mode has mode-specific artifact filenames', () => {
    const wf = getWorkflow('harden');
    const map: Record<string, string> = {};
    for (const s of wf.stages) map[s.name] = s.artifactFile;

    expect(map['hardening-brief']).toBe('artifacts/hardening-brief.txt');
    expect(map['assumption-report']).toBe('artifacts/assumption-report.txt');
    expect(map['failure-mode-matrix']).toBe('artifacts/failure-mode-matrix.txt');
    expect(map['guard-pseudocode-packet']).toBe('artifacts/guard-pseudocode-packet.txt');
    expect(map['resilience-test-strategy']).toBe('artifacts/resilience-test-strategy.txt');
  });
});

describe('prompt filenames', () => {
  for (const mode of VALID_MODES) {
    it(`every stage in ${mode} mode has a prompt filename`, () => {
      const wf = getWorkflow(mode);
      for (const stage of wf.stages) {
        expect(stage.promptFile).toBeTruthy();
        expect(stage.promptFile).toMatch(/^prompts\/\d{2}-.+\.prompt\.txt$/);
      }
    });
  }

  it('feature mode prompt filenames are numbered from 01', () => {
    const wf = getWorkflow('feature');
    expect(wf.stages[0].promptFile).toBe('prompts/01-request-brief.prompt.txt');
    expect(wf.stages[1].promptFile).toBe('prompts/02-architecture-context.prompt.txt');
    expect(wf.stages[2].promptFile).toBe('prompts/03-behavior-model.prompt.txt');
    expect(wf.stages[9].promptFile).toBe('prompts/10-final-report.prompt.txt');
  });

  it('repair mode prompt filenames are numbered from 01', () => {
    const wf = getWorkflow('repair');
    expect(wf.stages[0].promptFile).toBe('prompts/01-observed-behavior-report.prompt.txt');
    expect(wf.stages[1].promptFile).toBe('prompts/02-architecture-context.prompt.txt');
    expect(wf.stages[10].promptFile).toBe('prompts/11-final-report.prompt.txt');
  });

  it('prompt numbers are stable and ordered', () => {
    for (const mode of VALID_MODES) {
      const wf = getWorkflow(mode);
      for (let i = 0; i < wf.stages.length; i++) {
        const expectedNum = String(i + 1).padStart(2, '0');
        expect(wf.stages[i].promptFile).toMatch(new RegExp(`^prompts/${expectedNum}-`));
      }
    }
  });

  it('no duplicate prompt numbers within a mode', () => {
    for (const mode of VALID_MODES) {
      const wf = getWorkflow(mode);
      const promptFiles = wf.stages.map((s) => s.promptFile);
      const uniqueFiles = new Set(promptFiles);
      expect(uniqueFiles.size).toBe(promptFiles.length);
    }
  });
});

describe('invalid mode rejection', () => {
  it('getWorkflowOrThrow throws for unknown mode', () => {
    expect(() => getWorkflowOrThrow('unknown')).toThrow();
  });

  it('getWorkflowOrThrow throws for empty string', () => {
    expect(() => getWorkflowOrThrow('')).toThrow();
  });

  it('getWorkflowOrThrow throws for capitalized mode', () => {
    expect(() => getWorkflowOrThrow('Feature')).toThrow();
  });

  it('getWorkflowOrThrow accepts valid modes', () => {
    for (const mode of VALID_MODES) {
      expect(() => getWorkflowOrThrow(mode)).not.toThrow();
    }
  });
});

describe('getAllWorkflows', () => {
  it('returns all five workflow modes', () => {
    const all = getAllWorkflows();
    expect(all).toHaveLength(5);
    const modes = all.map((wf) => wf.mode).sort();
    expect(modes).toEqual(['feature', 'harden', 'refactor', 'repair', 'test']);
  });
});
