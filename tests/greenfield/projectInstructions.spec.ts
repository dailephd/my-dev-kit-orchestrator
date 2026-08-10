import type { GreenfieldProjectBrief } from '../../src/greenfield/brief/briefTypes';
import type { GreenfieldProfileSelection } from '../../src/greenfield/profiles/profileTypes';
import { normalizeProjectBrief } from '../../src/greenfield/brief/normalizeProjectBrief';
import { resolveGreenfieldProfile, SUPPORTED_PROFILES } from '../../src/greenfield/profiles/resolveGreenfieldProfile';
import { buildGreenfieldBootstrapBundle } from '../../src/greenfield/bootstrap/buildBootstrapBundle';
import { bootstrapProjectDocs } from '../../src/greenfield/bootstrap/bootstrapProjectDocs';
import { GREENFIELD_CANONICAL_DOCUMENTS } from '../../src/greenfield/bootstrap/projectDocBootstrapTypes';
import { buildScaffoldPlan } from '../../src/greenfield/scaffold/buildScaffoldPlan';
import {
  buildGreenfieldProjectInstructionBundle,
  buildGreenfieldProjectInstructionModel,
} from '../../src/greenfield/bootstrap/projectInstructions/buildProjectInstructionBundle';
import {
  GREENFIELD_AGENTS_ADAPTER_CONTENT,
  GREENFIELD_CLAUDE_ADAPTER_CONTENT,
  GREENFIELD_PROJECT_INSTRUCTION_PATHS,
  type GreenfieldProjectInstructionBundle,
} from '../../src/greenfield/bootstrap/projectInstructions/projectInstructionTypes';
import { validateGreenfieldProjectInstructionBundle } from '../../src/greenfield/bootstrap/projectInstructions/validateProjectInstructionBundle';

type BriefOverrides = Omit<GreenfieldProjectBrief, 'rawIdea'>;

function buildBundleFor(
  rawIdea: string,
  overrides: BriefOverrides = {},
  selectionOverride?: GreenfieldProfileSelection,
) {
  const normalized = normalizeProjectBrief({ rawIdea, ...overrides }).normalized;
  const selection = selectionOverride ?? resolveGreenfieldProfile(normalized);
  return buildGreenfieldBootstrapBundle(normalized, selection);
}

function generatedFor(rawIdea: string, overrides: BriefOverrides = {}) {
  return buildGreenfieldProjectInstructionBundle(buildBundleFor(rawIdea, overrides));
}

function contentAt(result: GreenfieldProjectInstructionBundle, path: string): string {
  const target = result.targets.find((entry) => entry.path === path);
  if (!target) throw new Error(`Missing generated target: ${path}`);
  return target.content;
}

function lowerCaseManuals(result: GreenfieldProjectInstructionBundle): string {
  return `${contentAt(result, 'agents.txt')}\n${contentAt(result, 'claude.txt')}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function expectIssue(value: unknown, code: string): void {
  expect(validateGreenfieldProjectInstructionBundle(value).issues).toEqual(
    expect.arrayContaining([expect.objectContaining({ code })]),
  );
}

describe('greenfield project-instruction bootstrap (v1.3.3 Batch 1)', () => {
  it('TST-001: generates exactly the four approved targets in deterministic order', () => {
    const result = generatedFor('A CLI tool for managing repository notes.', {
      preferredProfile: 'typescript-cli',
    });

    expect(result.targets.map((target) => target.path)).toEqual(GREENFIELD_PROJECT_INSTRUCTION_PATHS);
    expect(new Set(result.targets.map((target) => target.path)).size).toBe(4);
    expect(result.targets).toHaveLength(4);
  });

  it('TST-002: constructs one deterministic model and byte-equivalent projections without input mutation', () => {
    const bundle = buildBundleFor('A CLI tool for managing repository notes.', {
      projectName: 'Repo Notes',
      productGoal: 'Keep repository notes organized.',
      usersOrAudience: 'Developers',
      coreWorkflow: 'Create, list, and archive notes.',
      constraints: ['Remain local-first.'],
      nonGoals: ['No hosted service.'],
      preferredProfile: 'typescript-cli',
    });
    const before = clone(bundle);

    const first = buildGreenfieldProjectInstructionBundle(bundle);
    const second = buildGreenfieldProjectInstructionBundle(clone(bundle));

    expect(first).toEqual(second);
    expect(first.targets.map((target) => target.content)).toEqual(
      second.targets.map((target) => target.content),
    );
    expect(bundle).toEqual(before);
    expect(first.model).toEqual(buildGreenfieldProjectInstructionModel(bundle));
    expect(contentAt(first, 'agents.txt')).toContain('Repo Notes');
    expect(contentAt(first, 'claude.txt')).toContain('Repo Notes');
  });

  it('TST-003: keeps both uppercase adapters exact, small, and deterministic', () => {
    const result = generatedFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const agentsAdapter = contentAt(result, 'AGENTS.md');
    const claudeAdapter = contentAt(result, 'CLAUDE.md');

    expect(agentsAdapter).toBe(GREENFIELD_AGENTS_ADAPTER_CONTENT);
    expect(claudeAdapter).toBe(GREENFIELD_CLAUDE_ADAPTER_CONTENT);
    expect(agentsAdapter).toBe(
      '# Coding Agents project instructions\n\nRead and follow:\n\n@claude.txt\n@agents.txt\n',
    );
    expect(claudeAdapter).toBe(
      '# Claude Code project instructions\n\nRead and follow:\n\n@claude.txt\n@agents.txt\n',
    );
    expect(agentsAdapter.split('\n')).toHaveLength(7);
    expect(claudeAdapter.split('\n')).toHaveLength(7);
    expect(agentsAdapter).not.toContain('## Setup guidance');
    expect(claudeAdapter).not.toContain('## Setup guidance');
  });

  it('TST-004: represents TypeScript CLI project and profile facts as guidance', () => {
    const bundle = buildBundleFor('A CLI tool for synchronizing dotfiles.', {
      projectName: 'Dotfile Sync',
      productGoal: 'Synchronize declared dotfiles.',
      coreWorkflow: 'Select a manifest and synchronize files.',
      nonGoals: ['No graphical desktop interface.'],
      testingExpectations: ['Cover synchronization conflicts.'],
      preferredProfile: 'typescript-cli',
    });
    const result = buildGreenfieldProjectInstructionBundle(bundle);
    const text = lowerCaseManuals(result);
    const profile = bundle.selectedProfile.profile!;

    expect(text).toMatch(/TypeScript/i);
    expect(text).toMatch(/Node\.js/i);
    expect(text).toContain('Dotfile Sync');
    expect(text).toContain('No graphical desktop interface.');
    for (const command of [...profile.setupCommands, ...profile.validationCommands]) {
      expect(text).toContain(command.command);
    }
    expect(text).not.toMatch(/Jetpack Compose|Android emulator|Next\.js application/i);
    expect(text).not.toMatch(/\b(?:the orchestrator|my-dev-kit-orchestrator) (?:ran|executed|passed)\b/i);
  });

  it('TST-005: represents ordinary Next.js profile facts without full-stack infrastructure fabrication', () => {
    const bundle = buildBundleFor('A web dashboard for team analytics.', {
      preferredProfile: 'nextjs-app',
    });
    const result = buildGreenfieldProjectInstructionBundle(bundle);
    const text = lowerCaseManuals(result);

    expect(text).toMatch(/Next\.js/i);
    expect(text).toMatch(/React/i);
    for (const command of [
      ...bundle.selectedProfile.profile!.setupCommands,
      ...bundle.selectedProfile.profile!.validationCommands,
    ]) {
      expect(text).toContain(command.command);
    }
    expect(text).not.toMatch(/Jetpack Compose|Kotlin|PostgreSQL|Prisma|Docker/i);
  });

  it('TST-006: preserves Android Compose empty setup and optional device guidance honestly', () => {
    const bundle = buildBundleFor('An Android app for tracking field inspections.', {
      preferredProfile: 'android-compose',
    });
    const result = buildGreenfieldProjectInstructionBundle(bundle);
    const text = lowerCaseManuals(result);
    const profile = bundle.selectedProfile.profile!;

    expect(profile.setupCommands).toEqual([]);
    expect(result.model.profile.setupCommands).toEqual([]);
    expect(text).toMatch(/Kotlin/i);
    expect(text).toMatch(/Jetpack Compose/i);
    expect(text).toMatch(/Gradle/i);
    expect(text).toContain('No commands are declared for this category; do not invent a default command.');
    for (const command of profile.validationCommands) {
      expect(text).toContain(command.command);
      expect(text).toContain(command.required ? '(required)' : '(optional)');
      if (command.environmentNotes) expect(text).toContain(command.environmentNotes);
    }
    expect(text).not.toMatch(/npm install|orchestrator runs Gradle|provides an Android environment/i);
  });

  it.each([
    {
      label: 'unsupported',
      selection: undefined,
      overrides: { preferredProfile: 'rust-cli' },
    },
    {
      label: 'unresolved',
      selection: {
        status: 'unresolved',
        reason: 'The request does not identify a supported starter profile.',
        stackDecisionNotes: ['Select a supported profile explicitly.'],
      } satisfies GreenfieldProfileSelection,
      overrides: {},
    },
  ])('TST-007: keeps $label profile selection honest', ({ selection, overrides }) => {
    const normalized = normalizeProjectBrief({
      rawIdea: 'A project whose starter remains undecided.',
      ...overrides,
    }).normalized;
    const actualSelection = selection ?? resolveGreenfieldProfile(normalized);
    const bundle = buildGreenfieldBootstrapBundle(normalized, actualSelection);
    const result = buildGreenfieldProjectInstructionBundle(bundle);
    const text = lowerCaseManuals(result);

    expect(actualSelection.status).not.toBe('selected');
    expect(result.targets).toHaveLength(4);
    expect(result.model.profile.status).toBe(actualSelection.status);
    expect(result.model.profile.reason).toBe(actualSelection.reason);
    expect(result.model.profile.profileId).toBeUndefined();
    expect(result.model.profile.stackAssumptions).toEqual([]);
    expect(result.model.profile.setupCommands).toEqual([]);
    expect(result.model.profile.validationCommands).toEqual([]);
    expect(text).toContain(actualSelection.reason);
    expect(text).toContain('No profile-specific stack or command guidance is assumed.');
    expect(text).not.toMatch(/npm install|npm run build|\.\/gradlew/i);
  });

  it('TST-008: renders useful bounded uncertainty for a sparse project brief', () => {
    const result = generatedFor('A project idea that intentionally leaves optional facts open.');
    const validation = validateGreenfieldProjectInstructionBundle(result);
    const text = lowerCaseManuals(result);

    expect(result.model.projectName).toBeUndefined();
    expect(result.model.productGoal).toBeUndefined();
    expect(result.model.coreWorkflow).toBeUndefined();
    expect(text).toContain('Not provided; resolve this uncertainty before making assumptions.');
    expect(text).not.toContain('undefined');
    expect(validation).toEqual({ valid: true, issues: [] });
  });

  it('TST-009: represents the existing selected full-stack capability additively and deterministically', () => {
    const bundle = buildBundleFor('A full-stack web application for inventory.', {
      preferredProfile: 'nextjs-app',
      projectType: 'fullstack-web',
      webFramework: 'nextjs',
    });
    const first = buildGreenfieldProjectInstructionBundle(bundle);
    const second = buildGreenfieldProjectInstructionBundle(clone(bundle));
    const text = lowerCaseManuals(first);
    const capability = bundle.fullstackCapability.capability!;

    expect(bundle.fullstackCapability.status).toBe('selected');
    expect(first).toEqual(second);
    expect(first.model.capability.projectType).toBe(capability.projectType);
    expect(first.model.capability.webFramework).toBe(capability.webFramework);
    expect(text).toContain(capability.projectType);
    expect(text).toContain(capability.webFramework);
    for (const command of [...capability.setupCommands, ...capability.validationCommands]) {
      expect(text).toContain(command.command);
    }
    expect(bundle.selectedProfile.profile?.id).toBe('nextjs-app');
  });

  it('TST-010: accepts a valid result and rejects every bounded inventory/content defect', () => {
    const valid = generatedFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    expect(validateGreenfieldProjectInstructionBundle(valid)).toEqual({ valid: true, issues: [] });
    expectIssue(null, 'GF_AGENT_INSTRUCTIONS_INVALID_RESULT');

    const missing = clone(valid);
    missing.targets = missing.targets.slice(1);
    expectIssue(missing, 'GF_AGENT_INSTRUCTIONS_MISSING_TARGET');

    const duplicate = clone(valid);
    duplicate.targets = [...duplicate.targets, clone(duplicate.targets[0])];
    expectIssue(duplicate, 'GF_AGENT_INSTRUCTIONS_DUPLICATE_TARGET');

    const unexpected = clone(valid) as unknown as { model: unknown; targets: Array<{ path: string; content: string }> };
    unexpected.targets.push({ path: 'EXTRA.md', content: 'unexpected' });
    expectIssue(unexpected, 'GF_AGENT_INSTRUCTIONS_UNEXPECTED_TARGET');

    const reordered = clone(valid);
    reordered.targets = [reordered.targets[1], reordered.targets[0], ...reordered.targets.slice(2)];
    expectIssue(reordered, 'GF_AGENT_INSTRUCTIONS_TARGET_ORDER');

    const blank = clone(valid);
    blank.targets = blank.targets.map((target, index) =>
      index === 0 ? { ...target, content: '   ' } : target,
    );
    expectIssue(blank, 'GF_AGENT_INSTRUCTIONS_BLANK_CONTENT');

    const adapter = clone(valid);
    adapter.targets = adapter.targets.map((target, index) =>
      index === 2 ? { ...target, content: '# Expanded manual\n' } : target,
    );
    expectIssue(adapter, 'GF_AGENT_INSTRUCTIONS_ADAPTER_MISMATCH');

    const handoff = clone(valid);
    handoff.targets = handoff.targets.map((target, index) =>
      index === 1
        ? { ...target, content: target.content.replace(/agents\.txt/gi, 'the detailed manual') }
        : target,
    );
    expectIssue(handoff, 'GF_AGENT_INSTRUCTIONS_CLAUDE_HANDOFF_MISSING');
  });

  it('TST-011: denies autonomous execution claims and validator rejects an affirmative assertion', () => {
    for (const profile of ['typescript-cli', 'nextjs-app', 'android-compose'] as const) {
      const result = generatedFor(`A project using ${profile}.`, { preferredProfile: profile });
      const text = lowerCaseManuals(result);
      expect(text).toMatch(/does not execute setup or validation commands/i);
      expect(text).toMatch(/guidance, never evidence|not orchestrator execution evidence/i);
      expect(text).not.toMatch(
        /\b(?:my-dev-kit-orchestrator|the orchestrator) (?:ran|executed|completed|passed|validated|built|tested|published)\b/i,
      );
    }

    const mutation = generatedFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    mutation.targets = mutation.targets.map((target, index) =>
      index === 0
        ? { ...target, content: `${target.content}\nThe orchestrator executed and passed validation.\n` }
        : target,
    );
    expectIssue(mutation, 'GF_AGENT_INSTRUCTIONS_AUTONOMOUS_EXECUTION_CLAIM');
  });

  it('TST-010/TST-007: rejects selected-profile facts attached to unresolved model state', () => {
    const unresolvedSelection: GreenfieldProfileSelection = {
      status: 'unresolved',
      reason: 'Profile remains unresolved.',
      stackDecisionNotes: [],
    };
    const bundle = buildBundleFor('An unresolved project.', {}, unresolvedSelection);
    const result = buildGreenfieldProjectInstructionBundle(bundle);
    const mutation = clone(result) as unknown as {
      model: { profile: Record<string, unknown>; selectedStack: string[] };
      targets: unknown[];
    };
    mutation.model.profile.profileId = 'fabricated-profile';
    mutation.model.profile.setupCommands = [{ command: 'fabricated', purpose: 'fabricated', required: true }];
    mutation.model.selectedStack = ['fabricated stack'];

    expectIssue(mutation, 'GF_AGENT_INSTRUCTIONS_PROFILE_STATE_MISMATCH');
  });

  it('TST-012: leaves canonical documents, profile registration, and scaffold targets unchanged', () => {
    const bundle = buildBundleFor('A CLI tool.', { preferredProfile: 'typescript-cli' });
    const canonicalPaths = GREENFIELD_CANONICAL_DOCUMENTS.map((document) => document.path);
    const bootstrappedDocs = bootstrapProjectDocs(bundle).canonicalDocuments!;
    const scaffoldPaths = buildScaffoldPlan(bundle).plannedFileGroups.flatMap((group) => group.filePaths);

    expect(GREENFIELD_CANONICAL_DOCUMENTS).toHaveLength(15);
    expect(bootstrappedDocs).toHaveLength(15);
    expect(Object.values(SUPPORTED_PROFILES)).toHaveLength(3);
    expect(Object.values(SUPPORTED_PROFILES).map((profile) => profile.id)).toEqual([
      'typescript-cli',
      'nextjs-app',
      'android-compose',
    ]);
    for (const path of GREENFIELD_PROJECT_INSTRUCTION_PATHS) {
      expect(canonicalPaths).not.toContain(path);
      expect(bootstrappedDocs.map((document) => document.path)).not.toContain(path);
      expect(scaffoldPaths).not.toContain(path);
    }
  });
});
