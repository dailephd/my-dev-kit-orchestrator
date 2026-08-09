import { generateStagePrompt } from '../../src/promptGenerator';
import { RunMetadata } from '../../src/run';
import { getWorkflow } from '../../src/workflows';

function fakeMeta(): RunMetadata {
  return {
    runId: 'test-run',
    mode: 'greenfield',
    request: 'Create a sample TypeScript CLI app',
    projectRoot: '/repo',
    runFolder: '/repo/.my-dev-kit-orchestrator/runs/test-run',
    createdAt: new Date().toISOString(),
    currentStage: 'initial-index',
    stages: getWorkflow('greenfield').stages,
    status: 'in_progress',
  };
}

describe('initial-index handoff prompt', () => {
  it('uses scaffold-plan, scaffold-implementation-report, first-vertical-slice, and verification-report as inputs', () => {
    const prompt = generateStagePrompt(fakeMeta(), 'initial-index');
    expect(prompt).toContain('artifacts/scaffold-plan.txt');
    expect(prompt).toContain('reports/scaffold-implementation-report.txt');
    expect(prompt).toContain('artifacts/first-vertical-slice.txt');
    expect(prompt).toContain('artifacts/verification-report.txt');
  });

  it('outputs reports/initial-index-report.txt', () => {
    const prompt = generateStagePrompt(fakeMeta(), 'initial-index');
    expect(prompt).toContain('reports/initial-index-report.txt');
  });

  it('uses package execution language for my-dev-kit and does not assume a global command', () => {
    const prompt = generateStagePrompt(fakeMeta(), 'initial-index');
    expect(prompt).toContain('npx @dailephd/my-dev-kit@latest');
    expect(prompt).toMatch(/do not assume a global my-dev-kit command exists/);
  });

  it('requires command evidence for indexing', () => {
    const prompt = generateStagePrompt(fakeMeta(), 'initial-index');
    expect(prompt).toMatch(/do not claim indexing succeeded unless command evidence exists/);
    expect(prompt.toLowerCase()).toContain('exit code');
  });

  it('does not run security validation or a publish workflow', () => {
    const prompt = generateStagePrompt(fakeMeta(), 'initial-index');
    expect(prompt).toMatch(/do not run security validation/);
    expect(prompt).toMatch(/do not publish/);
  });

  it('does not include Android/mobile behavior', () => {
    const prompt = generateStagePrompt(fakeMeta(), 'initial-index');
    expect(prompt.toLowerCase()).not.toMatch(/android|react-native|flutter|jetpack/);
  });
});
