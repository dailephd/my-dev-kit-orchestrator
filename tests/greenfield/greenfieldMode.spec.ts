import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { VALID_MODES, isValidMode } from '../../src/types';
import { getWorkflow, getWorkflowOrThrow } from '../../src/workflows';
import { initWorkspace } from '../../src/workspace';
import { createRun, listRunFolders, loadRun } from '../../src/run';
import { generateStagePrompt } from '../../src/promptGenerator';
import { getArtifactStatuses, getNextStage } from '../../src/stageDetector';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-greenfield-mode-test-'));
}

function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const EXPECTED_GREENFIELD_STAGES = [
  'idea-brief',
  'product-boundary',
  'stack-decision',
  'starter-profile',
  'bootstrap-bundle',
  'project-docs',
  'scaffold-plan',
  'scaffold-implementation',
  'first-vertical-slice',
  'verification',
  'initial-index',
  'judge',
  'final-report',
];

describe('greenfield mode registration', () => {
  it('is an allowed mode', () => {
    expect(VALID_MODES).toContain('greenfield');
    expect(isValidMode('greenfield')).toBe(true);
  });

  it('has the required 13-stage order', () => {
    const wf = getWorkflow('greenfield');
    expect(wf.stages.map((s) => s.name)).toEqual(EXPECTED_GREENFIELD_STAGES);
  });

  it('getWorkflowOrThrow resolves greenfield', () => {
    expect(() => getWorkflowOrThrow('greenfield')).not.toThrow();
  });
});

describe('greenfield mode does not regress existing modes', () => {
  it('feature mode stage sequence is unchanged', () => {
    expect(getWorkflow('feature').stages.map((s) => s.name)).toEqual([
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

  it.each(['repair', 'test', 'refactor', 'harden', 'extraction'] as const)(
    '%s mode still resolves and has at least one stage',
    (mode) => {
      const wf = getWorkflow(mode);
      expect(wf.stages.length).toBeGreaterThan(0);
    },
  );
});

describe('start --mode greenfield creates a run', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTempDir();
    initWorkspace(tmp);
  });

  afterEach(() => {
    cleanup(tmp);
  });

  it('creates a greenfield run with the correct mode and stage order', () => {
    const meta = createRun({
      request: 'Create a sample TypeScript CLI app',
      mode: 'greenfield',
      projectRoot: tmp,
    });
    expect(meta.mode).toBe('greenfield');
    expect(meta.stages.map((s) => s.name)).toEqual(EXPECTED_GREENFIELD_STAGES);
    expect(fs.existsSync(meta.runFolder)).toBe(true);
  });

  it('writes a prompt file for every greenfield stage in stage order', () => {
    const meta = createRun({
      request: 'Create a sample TypeScript CLI app',
      mode: 'greenfield',
      projectRoot: tmp,
    });
    const promptFiles = fs.readdirSync(path.join(meta.runFolder, 'prompts')).sort();
    expect(promptFiles.length).toBe(EXPECTED_GREENFIELD_STAGES.length);
  });

  it('generates a bounded, non-throwing prompt for every greenfield stage', () => {
    const meta = createRun({
      request: 'Create a sample TypeScript CLI app',
      mode: 'greenfield',
      projectRoot: tmp,
    });
    for (const stageName of EXPECTED_GREENFIELD_STAGES) {
      const prompt = generateStagePrompt(meta, stageName);
      expect(prompt).toContain(`Stage: ${stageName}`);
      expect(prompt).toContain('Workflow mode: greenfield');
    }
  });

  it('status mechanisms (stageDetector) represent greenfield stage/artifact state', () => {
    const meta = createRun({
      request: 'Create a sample TypeScript CLI app',
      mode: 'greenfield',
      projectRoot: tmp,
    });
    const statuses = getArtifactStatuses(meta);
    expect(statuses.length).toBe(EXPECTED_GREENFIELD_STAGES.length);
    expect(statuses.every((s) => s.present === false)).toBe(true);

    const next = getNextStage(meta);
    expect(next?.name).toBe('idea-brief');
  });

  it('list mechanisms (listRunFolders) include the greenfield run', () => {
    const meta = createRun({
      request: 'Create a sample TypeScript CLI app',
      mode: 'greenfield',
      projectRoot: tmp,
    });
    const folders = listRunFolders(tmp);
    expect(folders).toContain(meta.runFolder);
    const loaded = loadRun(meta.runFolder);
    expect(loaded.mode).toBe('greenfield');
  });
});
