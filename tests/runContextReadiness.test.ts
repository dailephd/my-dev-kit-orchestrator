import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { evaluateRunContextReadiness } from '../src/instructions/runContextReadiness';
import { getWorkflow } from '../src/workflows';

function makeRunFolder(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-run-readiness-'));
  fs.mkdirSync(path.join(dir, 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'reports'), { recursive: true });
  return dir;
}

function stageNames(mode: string): string[] {
  return getWorkflow(mode as never).stages.map((s) => s.name);
}

describe('evaluateRunContextReadiness', () => {
  it('greenfield is not-required with no recommendation', () => {
    const runFolder = makeRunFolder();
    const summary = evaluateRunContextReadiness({ mode: 'greenfield', runFolder, workflowStageNames: stageNames('greenfield') });
    expect(summary.overallDecision).toBe('not-required');
    expect(summary.recommendedNextStage).toBeNull();
    expect(summary.implementationContext).toBeUndefined();
    expect(summary.testContext).toBeUndefined();
  });

  it('feature mode with no context files is refresh-required and recommends implementation first', () => {
    const runFolder = makeRunFolder();
    const summary = evaluateRunContextReadiness({ mode: 'feature', runFolder, workflowStageNames: stageNames('feature') });
    expect(summary.overallDecision).toBe('refresh-required');
    expect(summary.implementationContext?.decision).toBe('refresh-required');
    expect(summary.testContext?.decision).toBe('refresh-required');
    expect(summary.recommendedNextStage).toBe('implementation');
    expect(summary.affectedStages).toEqual(expect.arrayContaining(['implementation', 'test-implementation', 'verification', 'judge']));
  });

  it('test mode only evaluates test context and recommends test-implementation', () => {
    const runFolder = makeRunFolder();
    const summary = evaluateRunContextReadiness({ mode: 'test', runFolder, workflowStageNames: stageNames('test') });
    expect(summary.implementationContext).toBeUndefined();
    expect(summary.testContext?.decision).toBe('refresh-required');
    expect(summary.recommendedNextStage).toBe('test-implementation');
  });

  it('recommended stage is validated against the actual workflow stage list', () => {
    const runFolder = makeRunFolder();
    // An empty stage-name list means no candidate can ever validate.
    const summary = evaluateRunContextReadiness({ mode: 'feature', runFolder, workflowStageNames: [] });
    expect(summary.recommendedNextStage).toBeNull();
  });
});
