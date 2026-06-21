import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateStagePrompt, writeStagePrompts } from '../promptGenerator';
import { RunMetadata } from '../run';
import { getWorkflow } from '../workflows';
import { VALID_MODES } from '../types';

function makeFakeRun(mode: typeof VALID_MODES[number]): RunMetadata {
  const workflow = getWorkflow(mode);
  return {
    runId: `20240101T120000-test-run`,
    mode,
    request: 'test request',
    projectRoot: '/fake/project',
    runFolder: '/fake/project/.my-dev-kit-orchestrator/runs/20240101T120000-test-run',
    createdAt: '2024-01-01T12:00:00.000Z',
    currentStage: workflow.stages[0].name,
    stages: workflow.stages,
    status: 'created',
  };
}

describe('generateStagePrompt — required sections', () => {
  it('throws for unknown stage name', () => {
    const meta = makeFakeRun('feature');
    expect(() => generateStagePrompt(meta, 'unknown-stage')).toThrow();
  });

  it('throws for stage not in current mode', () => {
    const meta = makeFakeRun('feature');
    expect(() => generateStagePrompt(meta, 'observed-behavior-report')).toThrow();
  });

  const REQUIRED_FIELDS = ['Stage:', 'Workflow mode:', 'Run ID:', 'Project root:', 'Run folder:', 'Task:', 'Required output artifact:', 'Output file:', 'Stop conditions:', 'Return format:'];

  for (const mode of VALID_MODES) {
    describe(`${mode} mode`, () => {
      const meta = makeFakeRun(mode);
      const workflow = getWorkflow(mode);

      for (const stage of workflow.stages) {
        it(`${stage.name} prompt has all required sections`, () => {
          const prompt = generateStagePrompt(meta, stage.name);
          for (const field of REQUIRED_FIELDS) {
            expect(prompt).toContain(field);
          }
        });
      }
    });
  }
});

describe('generateStagePrompt — stage identity', () => {
  it('each prompt contains only its own stage name in Stage: line', () => {
    for (const mode of VALID_MODES) {
      const meta = makeFakeRun(mode);
      const workflow = getWorkflow(mode);
      for (const stage of workflow.stages) {
        const prompt = generateStagePrompt(meta, stage.name);
        expect(prompt).toContain(`Stage: ${stage.name}`);
        expect(prompt).toContain(`Workflow mode: ${mode}`);
        expect(prompt).toContain(`Run ID: ${meta.runId}`);
      }
    }
  });
});

describe('generateStagePrompt — scope boundaries', () => {
  it('implementation prompt requires pseudocode-packet as input', () => {
    for (const mode of ['feature', 'repair', 'refactor', 'harden'] as const) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'implementation');
      expect(prompt).toContain('pseudocode-packet.txt');
    }
  });

  it('test-implementation prompt requires test-strategy-packet as input', () => {
    for (const mode of VALID_MODES) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'test-implementation');
      expect(prompt).toContain('test-strategy-packet.txt');
    }
  });

  it('implementation prompt does not claim verification success', () => {
    for (const mode of ['feature', 'repair', 'refactor', 'harden'] as const) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'implementation');
      expect(prompt).not.toMatch(/verification.*passed/i);
      expect(prompt).not.toMatch(/tests.*passed/i);
    }
  });

  it('test-strategy prompt prohibits writing test files', () => {
    for (const mode of ['feature', 'test'] as const) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'test-strategy');
      expect(prompt).toContain('do not write test files in this stage');
    }
  });

  it('test-strategy prompt requires derivation from BehaviorModel and PseudocodePacket', () => {
    for (const mode of ['feature', 'test'] as const) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'test-strategy');
      expect(prompt).toContain('behavior-model.txt');
      expect(prompt).toContain('pseudocode-packet.txt');
    }
  });

  it('test-strategy prompt requires traceability to behavior, invariant, etc', () => {
    const meta = makeFakeRun('feature');
    const prompt = generateStagePrompt(meta, 'test-strategy');
    expect(prompt).toContain('behavior');
    expect(prompt).toContain('invariant');
    expect(prompt).toContain('state transition');
    expect(prompt).toContain('derived value');
    expect(prompt).toContain('boundary');
    expect(prompt).toContain('external contract');
    expect(prompt).toContain('failure mode');
  });

  it('behavior-model prompt does not include production code instructions', () => {
    const meta = makeFakeRun('feature');
    const prompt = generateStagePrompt(meta, 'behavior-model');
    expect(prompt).toContain('do not write production code');
    expect(prompt).toContain('do not write test files');
  });

  it('pseudocode-packet prompt does not include production code or test file instructions', () => {
    const meta = makeFakeRun('feature');
    const prompt = generateStagePrompt(meta, 'pseudocode-packet');
    expect(prompt).toContain('do not write production code');
    expect(prompt).toContain('do not write test files');
    expect(prompt).toContain('do not modify files');
  });

  it('verification prompt requires command evidence', () => {
    const meta = makeFakeRun('feature');
    const prompt = generateStagePrompt(meta, 'verification');
    expect(prompt).toContain('do not claim checks passed unless command output was produced');
  });
});

describe('generateStagePrompt — no unrelated workflow modes', () => {
  it('feature mode prompts do not mention repair mode stages', () => {
    const meta = makeFakeRun('feature');
    for (const stage of getWorkflow('feature').stages) {
      const prompt = generateStagePrompt(meta, stage.name);
      expect(prompt).not.toContain('observed-behavior-report');
      expect(prompt).not.toContain('divergence-report');
    }
  });

  it('repair mode prompts do not mention refactor mode stages', () => {
    const meta = makeFakeRun('repair');
    for (const stage of getWorkflow('repair').stages) {
      const prompt = generateStagePrompt(meta, stage.name);
      expect(prompt).not.toContain('preserved-invariant-list');
      expect(prompt).not.toContain('refactor-brief');
    }
  });

  it('harden mode prompts do not mention test-mode stages', () => {
    const meta = makeFakeRun('harden');
    for (const stage of getWorkflow('harden').stages) {
      const prompt = generateStagePrompt(meta, stage.name);
      expect(prompt).not.toContain('test-target-brief');
      expect(prompt).not.toContain('behavior-reconstruction');
    }
  });
});

describe('generateStagePrompt — architecture-context my-dev-kit guidance', () => {
  it('architecture-context prompt mentions my-dev-kit as prompt-driven guidance', () => {
    for (const mode of VALID_MODES) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'architecture-context');
      expect(prompt).toContain('my-dev-kit');
      expect(prompt).toContain('graph-guided retrieval');
    }
  });

  it('architecture-context prompt does not claim automated my-dev-kit execution', () => {
    for (const mode of VALID_MODES) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'architecture-context');
      expect(prompt).not.toContain('automatically executes');
      expect(prompt).not.toContain('will run my-dev-kit');
    }
  });
});

describe('generateStagePrompt — architecture-context v0.2.0 graph-guided context acquisition', () => {
  it('architecture-context prompt includes full retrieval sequence steps', () => {
    for (const mode of VALID_MODES) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'architecture-context');
      expect(prompt).toContain('index');
      expect(prompt).toContain('search');
      expect(prompt).toContain('lookup');
      expect(prompt).toContain('slice');
    }
  });

  it('architecture-context prompt includes retrieval report output path', () => {
    for (const mode of VALID_MODES) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'architecture-context');
      expect(prompt).toContain('reports/architecture-context-retrieval-report.txt');
    }
  });

  it('architecture-context prompt includes ArchitectureContextPacket output path', () => {
    for (const mode of VALID_MODES) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'architecture-context');
      expect(prompt).toContain('artifacts/architecture-context-packet.txt');
    }
  });

  it('architecture-context prompt instructs synthesizing retrieval evidence, not dumping raw output', () => {
    for (const mode of VALID_MODES) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'architecture-context');
      expect(prompt).toContain('Synthesize retrieval evidence');
      expect(prompt).toContain('Do not dump raw retrieval output');
    }
  });

  it('architecture-context prompt does not include implementation task instructions', () => {
    for (const mode of VALID_MODES) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'architecture-context');
      expect(prompt).not.toContain('Implement the PseudocodePacket');
      expect(prompt).not.toContain('ImplementationReport');
    }
  });

  it('architecture-context prompt does not include test implementation task instructions', () => {
    for (const mode of VALID_MODES) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'architecture-context');
      expect(prompt).not.toContain('TestImplementationReport');
      expect(prompt).not.toContain('test-implementation-report.txt');
    }
  });

  it('architecture-context prompt does not use the word bridge', () => {
    for (const mode of VALID_MODES) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'architecture-context');
      expect(prompt).not.toMatch(/\bbridge\b/i);
    }
  });

  it('architecture-context prompt includes the retrieval evidence report template', () => {
    for (const mode of VALID_MODES) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'architecture-context');
      expect(prompt).toContain('Retrieval evidence report');
      expect(prompt).toContain('Search queries run');
      expect(prompt).toContain('Candidate nodes selected');
      expect(prompt).toContain('Graph slices created');
    }
  });

  it('architecture-context prompt includes ArchitectureContextPacket template fields', () => {
    for (const mode of VALID_MODES) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'architecture-context');
      expect(prompt).toContain('Retrieval evidence used');
      expect(prompt).toContain('Retrieval method');
      expect(prompt).toContain('graph-guided retrieval used');
      expect(prompt).toContain('my-dev-kit used');
    }
  });

  it('architecture-context prompt mentions fallback for when my-dev-kit is unavailable', () => {
    for (const mode of VALID_MODES) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'architecture-context');
      expect(prompt).toContain('my-dev-kit is unavailable');
    }
  });
});

describe('writeStagePrompts', () => {
  it('writes prompt files to disk for each stage', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-prompt-test-'));
    try {
      const meta = makeFakeRun('feature');
      const runFolder = path.join(tmp, 'test-run');
      const patchedMeta = { ...meta, runFolder };

      fs.mkdirSync(path.join(runFolder, 'prompts'), { recursive: true });
      fs.mkdirSync(path.join(runFolder, 'artifacts'), { recursive: true });

      writeStagePrompts(patchedMeta);

      for (const stage of patchedMeta.stages) {
        const promptPath = path.join(runFolder, stage.promptFile);
        expect(fs.existsSync(promptPath)).toBe(true);
        const content = fs.readFileSync(promptPath, 'utf8');
        expect(content).toContain(`Stage: ${stage.name}`);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('writes prompts for all five modes', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-prompt-modes-'));
    try {
      for (const mode of VALID_MODES) {
        const meta = makeFakeRun(mode);
        const runFolder = path.join(tmp, mode);
        const patchedMeta = { ...meta, runFolder };

        for (const stage of patchedMeta.stages) {
          fs.mkdirSync(path.join(runFolder, path.dirname(stage.promptFile)), { recursive: true });
        }

        writeStagePrompts(patchedMeta);

        for (const stage of patchedMeta.stages) {
          const promptPath = path.join(runFolder, stage.promptFile);
          expect(fs.existsSync(promptPath)).toBe(true);
        }
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('generateStagePrompt — output file path', () => {
  it('each prompt specifies the correct output file path', () => {
    const meta = makeFakeRun('feature');
    const workflow = getWorkflow('feature');
    for (const stage of workflow.stages) {
      const prompt = generateStagePrompt(meta, stage.name);
      const expectedArtifactFile = stage.artifactFile.replace('artifacts/', '');
      expect(prompt).toContain(expectedArtifactFile);
    }
  });
});
