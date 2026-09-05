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

// v1.4.1: nine forbidden Orchestrator-internal source references frozen by
// docs/reports/v1.4.1-installed-instruction-surface-audit.md. These must not
// appear in any rendered public greenfield prompt. This is not a blanket ban
// on the string "src/" -- legitimate generated-project paths (e.g.
// "src/cli.ts") and the published npx index command remain allowed.
const FORBIDDEN_EMITTED_REFERENCES = [
  'src/greenfield/brief/loadProjectBrief.ts',
  'normalizeProjectBrief.ts',
  'src/greenfield/brief/briefTypes.ts',
  'src/greenfield/profiles/resolveGreenfieldProfile.ts',
  'src/greenfield/profiles/profileTypes.ts',
  'src/greenfield/bootstrap/buildBootstrapBundle.ts',
  'src/greenfield/bootstrap/bootstrapBundleTypes.ts',
  'src/greenfield/bootstrap/validateBootstrapDocs.ts',
  'validateGreenfieldScaffoldPlan(',
];

describe('v1.4.1 greenfield installed instruction surface (no internal source leakage)', () => {
  const meta = makeFakeRun('greenfield');

  function render(stage: string): string {
    return generateStagePrompt(meta, stage);
  }

  it('all 13 greenfield stages still render successfully', () => {
    const workflow = getAllWorkflows().find((w) => w.mode === 'greenfield')!;
    expect(workflow.stages.length).toBe(13);
    for (const stage of workflow.stages) {
      expect(() => generateStagePrompt(meta, stage.name)).not.toThrow();
    }
  });

  it('idea-brief prompt exposes no forbidden internal reference and preserves required guidance', () => {
    const prompt = render('idea-brief');
    for (const ref of FORBIDDEN_EMITTED_REFERENCES) {
      expect(prompt).not.toContain(ref);
    }
    expect(prompt).toContain('Required output artifact: IdeaBrief');
    expect(prompt).toContain('artifacts/idea-brief.json');
    for (const field of [
      'raw idea',
      'project name',
      'product goal',
      'users/audience',
      'core workflow',
      'constraints',
      'non-goals',
      'preferred stack',
      'preferred profile',
      'platform target',
      'documentation preferences',
      'testing expectations',
      'unresolved questions',
    ]) {
      expect(prompt.toLowerCase()).toContain(field);
    }
    expect(prompt.toLowerCase()).toContain('do not silently choose a mobile/android profile as a default');
  });

  it('starter-profile prompt exposes no forbidden internal reference, lists current profile IDs/aliases, and preserves unresolved/unsupported behavior', () => {
    const prompt = render('starter-profile');
    for (const ref of FORBIDDEN_EMITTED_REFERENCES) {
      expect(prompt).not.toContain(ref);
    }
    expect(prompt).toContain('Required output artifact: StarterProfile');
    expect(prompt).toContain('artifacts/starter-profile.json');
    for (const id of ['typescript-cli', 'nextjs-app', 'android-compose', 'python-cli']) {
      expect(prompt).toContain(id);
    }
    for (const alias of ['python -> python-cli', 'android -> android-compose', 'kotlin-compose -> android-compose', 'jetpack-compose -> android-compose', 'compose-android -> android-compose']) {
      expect(prompt).toContain(alias);
    }
    expect(prompt.toLowerCase()).toContain('do not substitute a default silently');
  });

  it('bootstrap-bundle prompt exposes no forbidden internal reference and preserves bundle responsibilities', () => {
    const prompt = render('bootstrap-bundle');
    for (const ref of FORBIDDEN_EMITTED_REFERENCES) {
      expect(prompt).not.toContain(ref);
    }
    expect(prompt).toContain('Required output artifact: GreenfieldBootstrapBundleArtifact');
    expect(prompt).toContain('artifacts/bootstrap-bundle.json');
    for (const field of [
      'normalizedBrief',
      'selectedProfile',
      'starterProfile',
      'stackDecision',
      'templateTargets',
      'docGenerationInstructions',
      'scaffoldPlanningInputs',
      'validationRules',
      'unresolvedDecisions',
      'fullstackCapability',
    ]) {
      expect(prompt).toContain(field);
    }
  });

  it('project-docs prompt exposes no forbidden internal reference and preserves the android-compose-only restriction', () => {
    const prompt = render('project-docs');
    for (const ref of FORBIDDEN_EMITTED_REFERENCES) {
      expect(prompt).not.toContain(ref);
    }
    expect(prompt).toContain('Required output artifact: ProjectDocsReport');
    expect(prompt).toContain('artifacts/project-docs-report.txt');
    expect(prompt.toLowerCase()).toContain('do not claim android/mobile support in generated documentation unless the selected starter profile id is android-compose');
  });

  it('scaffold-plan prompt (rendered through generateStagePrompt) exposes no forbidden internal reference', () => {
    const prompt = render('scaffold-plan');
    for (const ref of FORBIDDEN_EMITTED_REFERENCES) {
      expect(prompt).not.toContain(ref);
    }
  });

  it('legitimate generated-project src/... references remain allowed (no bare "src/" blacklist)', () => {
    const implPrompt = render('scaffold-implementation');
    expect(implPrompt).toContain('src/cli.ts');
    const indexPrompt = render('initial-index');
    expect(indexPrompt).toContain('npx @dailephd/my-dev-kit@latest index --root . --src src --out .my-dev-kit --json');
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
