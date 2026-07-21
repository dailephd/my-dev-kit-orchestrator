import { generateStagePrompt } from '../src/promptGenerator';
import { RunMetadata } from '../src/run';
import { getAllWorkflows } from '../src/workflows';
import { VALID_MODES } from '../src/types';

function makeFakeRun(mode: typeof VALID_MODES[number]): RunMetadata {
  const workflow = getAllWorkflows().find((w) => w.mode === mode)!;
  return {
    runId: '20240101T120000-test-run',
    mode,
    request: 'test request',
    projectRoot: '/fake/project',
    runFolder: '/fake/project/.my-dev-kit-orchestrator/runs/20240101T120000-test-run',
    createdAt: '2024-01-01T12:00:00.000Z',
    currentStage: workflow.stages[0].name,
    stages: workflow.stages,
    status: 'created',
    ...(mode === 'extraction' ? { sourceRepoRoot: '/fake/source', targetRepoRoot: '/fake/target' } : {}),
  };
}

// Globally prohibited phrases: no native stage prompt in any mode should
// contain these, since none of the current v1.2.1 workflows document a
// release, publication, or security-validation contract.
const GLOBAL_PROHIBITED = [
  'npm publish',
  'npm version',
  'github release',
  'release tagging',
  'release-branch management',
  'package publication authorization',
  'documentation-plan restoration',
  'forensic documentation',
  'my-dev-kit-lab',
  'security:validate',
];

describe('global prohibited-content leakage', () => {
  for (const wf of getAllWorkflows()) {
    const meta = makeFakeRun(wf.mode);
    for (const stage of wf.stages) {
      it(`${wf.mode}/${stage.name} contains no globally prohibited terms`, () => {
        const prompt = generateStagePrompt(meta, stage.name).toLowerCase();
        for (const term of GLOBAL_PROHIBITED) {
          expect(prompt).not.toContain(term);
        }
      });
    }
  }
});

describe('mode-boundary leakage', () => {
  const nonGreenfieldModes = VALID_MODES.filter((m) => m !== 'greenfield');
  const nonExtractionModes = VALID_MODES.filter((m) => m !== 'extraction');

  it('no non-greenfield stage mentions greenfield-specific profile terms', () => {
    for (const mode of nonGreenfieldModes) {
      const meta = makeFakeRun(mode);
      const workflow = getAllWorkflows().find((w) => w.mode === mode)!;
      for (const stage of workflow.stages) {
        const prompt = generateStagePrompt(meta, stage.name).toLowerCase();
        expect(prompt).not.toContain('android-compose');
        expect(prompt).not.toContain('starter profile');
        expect(prompt).not.toContain('bootstrap bundle');
      }
    }
  });

  it('no non-extraction stage mentions extraction source/target porting terms', () => {
    for (const mode of nonExtractionModes) {
      const meta = makeFakeRun(mode);
      const workflow = getAllWorkflows().find((w) => w.mode === mode)!;
      for (const stage of workflow.stages) {
        const prompt = generateStagePrompt(meta, stage.name).toLowerCase();
        expect(prompt).not.toContain('donotportlist');
        expect(prompt).not.toContain('sourcetotargetportingmap');
        expect(prompt).not.toContain('golden behavior contract');
      }
    }
  });

  it('greenfield does not leak unsupported mobile framework instructions', () => {
    const meta = makeFakeRun('greenfield');
    const workflow = getAllWorkflows().find((w) => w.mode === 'greenfield')!;
    for (const stage of workflow.stages) {
      const prompt = generateStagePrompt(meta, stage.name).toLowerCase();
      expect(prompt).not.toContain('react-native');
      expect(prompt).not.toContain('flutter');
      expect(prompt).not.toContain('kotlin-multiplatform');
    }
  });
});

describe('stage-role leakage', () => {
  it('architecture/design/brief stages do not instruct production implementation', () => {
    const designStages: Array<[typeof VALID_MODES[number], string]> = [
      ['feature', 'request-brief'],
      ['feature', 'architecture-context'],
      ['feature', 'behavior-model'],
      ['feature', 'pseudocode-packet'],
      ['refactor', 'refactor-brief'],
      ['harden', 'hardening-brief'],
    ];
    for (const [mode, stage] of designStages) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, stage);
      expect(prompt).not.toMatch(/implement (the )?production code/i);
      expect(prompt).not.toMatch(/tests? (have )?passed/i);
    }
  });

  it('test-strategy stages do not instruct production implementation', () => {
    for (const mode of ['feature', 'test', 'extraction'] as const) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'test-strategy');
      expect(prompt.toLowerCase()).not.toMatch(/implement (the )?production code/);
    }
  });

  it('test-implementation stages stay test-focused (no unrelated production feature work)', () => {
    for (const mode of ['feature', 'repair', 'refactor', 'harden'] as const) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'test-implementation');
      expect(prompt).not.toMatch(/implement the pseudocodepacket/i);
    }
  });

  it('verification stages do not instruct source implementation and require evidence before claiming success', () => {
    for (const mode of ['feature', 'repair', 'test', 'refactor', 'harden'] as const) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'verification');
      expect(prompt).not.toMatch(/implement the pseudocodepacket/i);
      // The stage must require evidence before any success claim; it must
      // never itself assert that verification has already succeeded.
      expect(prompt).not.toMatch(/verification (has |is |was )?passed\b/i);
      expect(prompt.toLowerCase()).toContain('do not claim');
    }
  });

  it('judge stages do not implement fixes or invent new verdicts (but do carry their own "do not rewrite code" guard)', () => {
    for (const mode of ['feature', 'repair', 'test', 'refactor', 'harden'] as const) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'judge');
      expect(prompt).not.toMatch(/implement the pseudocodepacket/i);
      expect(prompt).toContain('do not rewrite code');
      for (const verdict of ['PASS', 'DESIGN_INCOMPLETE', 'IMPLEMENTATION_MISMATCH', 'SCOPE_VIOLATION', 'BLOCKED']) {
        expect(prompt).toContain(verdict);
      }
    }
  });

  it('final-report stages do not implement or verify new work', () => {
    for (const mode of ['feature', 'repair', 'test', 'refactor', 'harden'] as const) {
      const meta = makeFakeRun(mode);
      const prompt = generateStagePrompt(meta, 'final-report');
      expect(prompt).not.toMatch(/implement the pseudocodepacket/i);
      expect(prompt).not.toMatch(/run the required verification commands/i);
    }
  });
});
