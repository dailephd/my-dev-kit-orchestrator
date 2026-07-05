import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { normalizeProjectBrief } from '../../src/greenfield/brief/normalizeProjectBrief';
import { resolveGreenfieldProfile } from '../../src/greenfield/profiles/resolveGreenfieldProfile';
import { buildGreenfieldBootstrapBundle } from '../../src/greenfield/bootstrap/buildBootstrapBundle';
import { buildScaffoldPlan } from '../../src/greenfield/scaffold/buildScaffoldPlan';
import {
  renderScaffoldPlanPrompt,
  renderScaffoldImplementationPrompt,
} from '../../src/greenfield/scaffold/renderScaffoldPrompt';
import { generateStagePrompt } from '../../src/promptGenerator';
import { RunMetadata } from '../../src/run';
import { getWorkflow } from '../../src/workflows';

function buildBundleFor(rawIdea: string, overrides: Record<string, unknown> = {}) {
  const normalizedBrief = normalizeProjectBrief({ rawIdea, ...overrides } as any).normalized;
  const selection = resolveGreenfieldProfile(normalizedBrief);
  return buildGreenfieldBootstrapBundle(normalizedBrief, selection);
}

function makeCtx() {
  return {
    stage: 'scaffold-plan',
    mode: 'greenfield',
    runId: 'test-run',
    projectRoot: '/repo',
    runFolder: '/repo/.my-dev-kit-orchestrator/runs/test-run',
  };
}

describe('buildScaffoldPlan', () => {
  it('uses the bootstrap bundle scaffold planning inputs for an explicit TypeScript CLI profile', () => {
    const bundle = buildBundleFor('A CLI tool for dotfiles.', { preferredProfile: 'typescript-cli' });
    const plan = buildScaffoldPlan(bundle);
    expect(plan.profileId).toBe('typescript-cli');
    expect(plan.plannedFileGroups.length).toBeGreaterThan(0);
    expect(plan.setupCommands).toEqual(['npm install']);
    expect(plan.validationCommands).toEqual(expect.arrayContaining(['npm run typecheck', 'npm run build', 'npm test']));
  });

  it('preserves unresolved decisions and non-goals from the bundle', () => {
    const bundle = buildBundleFor('A tool for tracking budgets and expenses.', { nonGoals: ['no mobile app'] });
    const plan = buildScaffoldPlan(bundle);
    expect(plan.nonGoals).toEqual(['no mobile app']);
    expect(plan.unresolvedDecisions.length).toBeGreaterThan(0);
  });

  it('leaves the plan incomplete rather than inventing a file tree when the profile is unsupported', () => {
    // v1.2.0: android-compose is now supported (see
    // artifacts/v1.2.0-android-compose-profile-contract.txt), so this
    // regression case now uses a still-unsupported profile (flutter)
    // instead. See the dedicated android-compose scaffold-plan coverage
    // added in tests/greenfield/androidComposeProfile.spec.ts.
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'flutter' });
    const plan = buildScaffoldPlan(bundle);
    expect(plan.profileId).toBeUndefined();
    expect(plan.plannedFileGroups).toEqual([]);
    expect(plan.unsupportedClaims.length).toBeGreaterThan(0);
  });

  it('does not invent an Android/mobile file tree for any profile', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const plan = buildScaffoldPlan(bundle);
    const serialized = JSON.stringify(plan).toLowerCase();
    expect(serialized).not.toMatch(/android|react-native|flutter|jetpack/);
  });

  it('does not write any files while building a scaffold plan', () => {
    // Use a dedicated, exclusively-owned temp directory rather than counting
    // entries in the shared os.tmpdir() root (flaky under parallel test execution).
    const ownDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-scaffold-plan-'));
    try {
      const before = fs.readdirSync(ownDir).length;
      const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
      buildScaffoldPlan(bundle);
      const after = fs.readdirSync(ownDir).length;
      expect(after).toBe(before);
    } finally {
      fs.rmSync(ownDir, { recursive: true, force: true });
    }
  });

  it('is deterministic for the same bundle', () => {
    const bundle = buildBundleFor('A CLI tool for syncing notes.', { preferredStack: ['TypeScript'] });
    expect(buildScaffoldPlan(bundle)).toEqual(buildScaffoldPlan(bundle));
  });
});

describe('renderScaffoldPlanPrompt', () => {
  it('references bootstrap-bundle and project-docs-report as inputs and scaffold-plan.txt as output', () => {
    const prompt = renderScaffoldPlanPrompt(makeCtx());
    expect(prompt).toContain('artifacts/bootstrap-bundle.json');
    expect(prompt).toContain('artifacts/project-docs-report.txt');
    expect(prompt).toContain('artifacts/scaffold-plan.txt');
  });

  it('contains relevant stop conditions', () => {
    const prompt = renderScaffoldPlanPrompt(makeCtx());
    expect(prompt).toMatch(/do not write scaffold files/);
    expect(prompt).toMatch(/do not install dependencies/);
    expect(prompt).toMatch(/do not implement first vertical slice/);
  });

  it('does not include release/security/publish workflow instructions', () => {
    const prompt = renderScaffoldPlanPrompt(makeCtx());
    expect(prompt.toLowerCase()).not.toMatch(/release checklist|npm publish|security validation|security-validate/);
  });

  it('does not include Android/mobile behavior', () => {
    const prompt = renderScaffoldPlanPrompt(makeCtx());
    expect(prompt.toLowerCase()).not.toMatch(/react-native|flutter|jetpack|ios app/);
  });

  it('does not mutate any files at prompt-generation time', () => {
    // Use a dedicated, exclusively-owned temp directory rather than counting
    // entries in the shared os.tmpdir() root, which other concurrently
    // running test workers may also be writing into (flaky under parallel
    // test execution).
    const ownDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-scaffold-prompt-'));
    try {
      const before = fs.readdirSync(ownDir).length;
      renderScaffoldPlanPrompt(makeCtx());
      const after = fs.readdirSync(ownDir).length;
      expect(after).toBe(before);
    } finally {
      fs.rmSync(ownDir, { recursive: true, force: true });
    }
  });
});

describe('renderScaffoldImplementationPrompt', () => {
  it('references scaffold-plan.txt as an input and outputs reports/scaffold-implementation-report.txt', () => {
    const prompt = renderScaffoldImplementationPrompt({ ...makeCtx(), stage: 'scaffold-implementation' });
    expect(prompt).toContain('artifacts/scaffold-plan.txt');
    expect(prompt).toContain('reports/scaffold-implementation-report.txt');
  });

  it('requires files changed, commands run, deviations, blockers, and risks', () => {
    const prompt = renderScaffoldImplementationPrompt({ ...makeCtx(), stage: 'scaffold-implementation' });
    for (const term of ['files changed', 'commands run', 'deviations', 'blockers', 'risks']) {
      expect(prompt.toLowerCase()).toContain(term);
    }
  });

  it('does not claim verification success without command evidence', () => {
    const prompt = renderScaffoldImplementationPrompt({ ...makeCtx(), stage: 'scaffold-implementation' });
    expect(prompt).toMatch(/do not claim verification success without command evidence/);
  });
});

describe('scaffold stage prompts wired through the greenfield stage router', () => {
  function fakeMeta(): RunMetadata {
    return {
      runId: 'test-run',
      mode: 'greenfield',
      request: 'Create a sample TypeScript CLI app',
      projectRoot: '/repo',
      runFolder: '/repo/.my-dev-kit-orchestrator/runs/test-run',
      createdAt: new Date().toISOString(),
      currentStage: 'scaffold-plan',
      stages: getWorkflow('greenfield').stages,
      status: 'in_progress',
    };
  }

  it('generateStagePrompt("scaffold-plan") delegates to renderScaffoldPlanPrompt', () => {
    const prompt = generateStagePrompt(fakeMeta(), 'scaffold-plan');
    expect(prompt).toContain('artifacts/scaffold-plan.txt');
  });

  it('generateStagePrompt("scaffold-implementation") delegates to renderScaffoldImplementationPrompt', () => {
    const prompt = generateStagePrompt(fakeMeta(), 'scaffold-implementation');
    expect(prompt).toContain('reports/scaffold-implementation-report.txt');
  });
});
