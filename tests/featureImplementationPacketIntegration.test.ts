import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRun, loadRun, RunMetadata } from '../src/run';
import { generateStagePrompt, writeStagePrompts } from '../src/promptGenerator';
import { getWorkflow } from '../src/workflows';
import { VALID_MODES } from '../src/types';
import { parseWorkflowInstructionPacket } from '../src/instructions/workflowInstructionPacketSerialization';
import { makeReadyRunFolder } from './readyContextTestHelpers';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-batch2-test-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeFakeRun(mode: typeof VALID_MODES[number], runFolder: string): RunMetadata {
  const workflow = getWorkflow(mode);
  return {
    runId: '20240101T120000-test-run',
    mode,
    request: 'test request',
    projectRoot: '/fake/project',
    runFolder,
    createdAt: '2024-01-01T12:00:00.000Z',
    currentStage: workflow.stages[0].name,
    stages: workflow.stages,
    status: 'created',
  };
}

describe('feature/implementation prompt content', () => {
  const readyRunFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-feature-impl-ready-'));
  makeReadyRunFolder(readyRunFolder, 'feature');
  const meta = makeFakeRun('feature', readyRunFolder);
  const prompt = generateStagePrompt(meta, 'implementation');

  it('contains the packet block', () => {
    expect(prompt).toContain('Workflow instruction packet:');
    expect(prompt).toContain('workflow.feature');
    expect(prompt).toContain('stage.feature.implementation');
  });

  it('retains required upstream artifact inputs', () => {
    expect(prompt).toContain('artifacts/request-brief.txt');
    expect(prompt).toContain('artifacts/architecture-context-packet.txt');
    expect(prompt).toContain('artifacts/behavior-model.txt');
    expect(prompt).toContain('artifacts/pseudocode-packet.txt');
  });

  it('retains the required output artifact and output file path', () => {
    expect(prompt).toContain('Required output artifact: ImplementationReport');
    expect(prompt).toContain(`Output file: ${meta.runFolder}/artifacts/implementation-report.txt`);
  });

  it('retains ImplementationReport content requirements via the packet validation requirements', () => {
    expect(prompt).toContain('files read');
    expect(prompt).toContain('files changed');
    expect(prompt).toContain('deviations from the PseudocodePacket');
  });

  it('does not duplicate packet-owned stop conditions', () => {
    const occurrences = prompt.split('do not modify files outside justified scope').length - 1;
    expect(occurrences).toBe(1);
  });

  it('does not duplicate packet-owned task narrative', () => {
    const occurrences = prompt.split('Implement the PseudocodePacket in the current project').length - 1;
    expect(occurrences).toBe(1);
  });

  it('all standard prompt sections required by existing tests are still present', () => {
    for (const field of ['Stage:', 'Workflow mode:', 'Run ID:', 'Project root:', 'Run folder:', 'Task:', 'Required output artifact:', 'Output file:', 'Stop conditions:', 'Return format:']) {
      expect(prompt).toContain(field);
    }
  });
});

describe('Batch 3: every mode/stage is now packet-backed', () => {
  // Batch 2 kept every other mode/stage on the legacy renderer; Batch 3
  // migrates all 79 native stages (see tests/allStagePacketIntegration.test.ts
  // for exhaustive coverage). These checks confirm the representative
  // feature/implementation packet integration composes correctly with the
  // now-generalized mechanism, not that other stages remain legacy.
  it('repair/refactor/harden implementation prompts are now packet-backed too', () => {
    for (const mode of ['repair', 'refactor', 'harden'] as const) {
      const runFolder = fs.mkdtempSync(path.join(os.tmpdir(), `mdko-${mode}-impl-ready-`));
      makeReadyRunFolder(runFolder, mode);
      const meta = makeFakeRun(mode, runFolder);
      const prompt = generateStagePrompt(meta, 'implementation');
      expect(prompt).toContain('Workflow instruction packet:');
      expect(prompt).toContain(`stage.${mode}.implementation`);
      cleanup(runFolder);
    }
  });

  it('extraction implementation prompt is packet-backed', () => {
    const runFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-extraction-impl-ready-'));
    makeReadyRunFolder(runFolder, 'extraction');
    const meta = makeFakeRun('extraction', runFolder);
    const prompt = generateStagePrompt(meta, 'implementation');
    expect(prompt).toContain('Workflow instruction packet:');
    expect(prompt).toContain('stage.extraction.implementation');
    cleanup(runFolder);
  });

  it('feature architecture-context prompt is packet-backed', () => {
    const meta = makeFakeRun('feature', '/fake/project/.my-dev-kit-orchestrator/runs/feature-run');
    const prompt = generateStagePrompt(meta, 'architecture-context');
    expect(prompt).toContain('Workflow instruction packet:');
    expect(prompt).toContain('stage.feature.architecture-context');
  });
});

describe('packet sidecar (new-run behavior)', () => {
  it('creates exactly one packet sidecar for a new feature run, alongside the implementation prompt', () => {
    const tmp = makeTempDir();
    try {
      const meta = createRun({ request: 'add a feature', mode: 'feature', projectRoot: tmp });
      const implStage = meta.stages.find((s) => s.name === 'implementation')!;
      const sidecarPath = path.join(
        meta.runFolder,
        implStage.promptFile.replace(/\.prompt\.txt$/, '.instruction-packet.json'),
      );
      expect(fs.existsSync(sidecarPath)).toBe(true);

      const sidecarText = fs.readFileSync(sidecarPath, 'utf8');
      const parsed = parseWorkflowInstructionPacket(sidecarText);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.packet.workflowId).toBe('workflow.feature');
        expect(parsed.packet.stageId).toBe('stage.feature.implementation');
      }
    } finally {
      cleanup(tmp);
    }
  });

  // Batch 3 generalizes sidecar writing to every native stage in every mode
  // (see tests/allStageSidecarIntegration.test.ts for exhaustive coverage).
  it('writes a sidecar for every other feature stage too', () => {
    const tmp = makeTempDir();
    try {
      const meta = createRun({ request: 'add a feature', mode: 'feature', projectRoot: tmp });
      for (const stage of meta.stages) {
        const sidecarPath = path.join(
          meta.runFolder,
          stage.promptFile.replace(/\.prompt\.txt$/, '.instruction-packet.json'),
        );
        expect(fs.existsSync(sidecarPath)).toBe(true);
      }
    } finally {
      cleanup(tmp);
    }
  });

  it('the sidecar contains no run-specific data (runId, projectRoot, runFolder)', () => {
    const tmp = makeTempDir();
    try {
      const meta = createRun({ request: 'add a feature', mode: 'feature', projectRoot: tmp });
      const implStage = meta.stages.find((s) => s.name === 'implementation')!;
      const sidecarPath = path.join(
        meta.runFolder,
        implStage.promptFile.replace(/\.prompt\.txt$/, '.instruction-packet.json'),
      );
      const text = fs.readFileSync(sidecarPath, 'utf8');
      expect(text).not.toContain(meta.runId);
      expect(text).not.toContain(meta.runFolder);
      expect(text).not.toContain(tmp);
    } finally {
      cleanup(tmp);
    }
  });
});

describe('old-run compatibility (no sidecar present)', () => {
  it('a run created, then stripped of its sidecar, still generates a valid implementation prompt on demand', () => {
    const tmp = makeTempDir();
    try {
      const meta = createRun({ request: 'add a feature', mode: 'feature', projectRoot: tmp });
      makeReadyRunFolder(meta.runFolder, 'feature');
      const implStage = meta.stages.find((s) => s.name === 'implementation')!;
      const sidecarPath = path.join(
        meta.runFolder,
        implStage.promptFile.replace(/\.prompt\.txt$/, '.instruction-packet.json'),
      );
      fs.rmSync(sidecarPath);
      expect(fs.existsSync(sidecarPath)).toBe(false);

      const reloaded = loadRun(meta.runFolder);
      const prompt = generateStagePrompt(reloaded, 'implementation');
      expect(prompt).toContain('Workflow instruction packet:');
      expect(fs.existsSync(sidecarPath)).toBe(false); // reading the prompt must not recreate the sidecar

      const runJsonBefore = fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8');
      generateStagePrompt(reloaded, 'implementation');
      const runJsonAfter = fs.readFileSync(path.join(meta.runFolder, 'run.json'), 'utf8');
      expect(runJsonAfter).toBe(runJsonBefore);
    } finally {
      cleanup(tmp);
    }
  });

  it('writeStagePrompts on an already-created run does not require pre-existing sidecars', () => {
    const tmp = makeTempDir();
    try {
      const meta = createRun({ request: 'add a feature', mode: 'feature', projectRoot: tmp });
      const implStage = meta.stages.find((s) => s.name === 'implementation')!;
      const sidecarPath = path.join(
        meta.runFolder,
        implStage.promptFile.replace(/\.prompt\.txt$/, '.instruction-packet.json'),
      );
      fs.rmSync(sidecarPath);
      expect(() => writeStagePrompts(meta)).not.toThrow();
    } finally {
      cleanup(tmp);
    }
  });
});
