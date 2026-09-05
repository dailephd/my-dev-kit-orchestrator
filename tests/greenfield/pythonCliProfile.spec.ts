import { normalizeProjectBrief } from '../../src/greenfield/brief/normalizeProjectBrief';
import { buildGreenfieldBootstrapBundle } from '../../src/greenfield/bootstrap/buildBootstrapBundle';
import { bootstrapProjectDocs } from '../../src/greenfield/bootstrap/bootstrapProjectDocs';
import { GREENFIELD_CANONICAL_DOCUMENTS } from '../../src/greenfield/bootstrap/projectDocBootstrapTypes';
import { buildGreenfieldProjectInstructionBundle } from '../../src/greenfield/bootstrap/projectInstructions/buildProjectInstructionBundle';
import { GREENFIELD_PROJECT_INSTRUCTION_PATHS } from '../../src/greenfield/bootstrap/projectInstructions/projectInstructionTypes';
import { validateBootstrapDocs } from '../../src/greenfield/bootstrap/validateBootstrapDocs';
import { STAGE_INSTRUCTION_CONTENT } from '../../src/instructions/stageInstructionContent';
import { ANDROID_COMPOSE_PROFILE } from '../../src/greenfield/profiles/androidComposeProfile';
import { NEXTJS_APP_PROFILE } from '../../src/greenfield/profiles/nextjsAppProfile';
import { PYTHON_CLI_PROFILE } from '../../src/greenfield/profiles/pythonCliProfile';
import {
  PROFILE_ALIASES,
  resolveGreenfieldProfile,
  SUPPORTED_PROFILES,
  validateSupportedGreenfieldProfileRegistry,
} from '../../src/greenfield/profiles/resolveGreenfieldProfile';
import { TYPESCRIPT_CLI_PROFILE } from '../../src/greenfield/profiles/typescriptCliProfile';
import { validateGreenfieldProfile } from '../../src/greenfield/profiles/validateGreenfieldProfile';
import { buildScaffoldPlan } from '../../src/greenfield/scaffold/buildScaffoldPlan';
import {
  composeEffectiveGreenfieldTargetExpectations,
  exactGreenfieldTargetPaths,
} from '../../src/greenfield/scaffold/effectiveTargetExpectations';
import { validateGreenfieldScaffoldPlan } from '../../src/greenfield/scaffold/validateGreenfieldScaffoldPlan';

function normalized(overrides: Record<string, unknown> = {}) {
  return normalizeProjectBrief({ rawIdea: 'A small project.', ...overrides } as any).normalized;
}

function bundleFor(overrides: Record<string, unknown> = {}) {
  const brief = normalized(overrides);
  return buildGreenfieldBootstrapBundle(brief, resolveGreenfieldProfile(brief));
}

function profilePaths(): string[] {
  return PYTHON_CLI_PROFILE.targetExpectations.map((target) => target.matcher.value);
}

describe('python-cli greenfield starter profile (v1.3.3 Batch 3)', () => {
  it('TST-001/TST-002: validates and registers exactly one fourth Python CLI profile', () => {
    expect(validateGreenfieldProfile(PYTHON_CLI_PROFILE)).toEqual({ valid: true, issues: [] });
    expect(validateSupportedGreenfieldProfileRegistry()).toEqual({ valid: true, issues: [] });
    expect(Object.keys(SUPPORTED_PROFILES)).toEqual([
      'typescript-cli',
      'nextjs-app',
      'android-compose',
      'python-cli',
    ]);
    expect(PROFILE_ALIASES.python).toBe('python-cli');
    expect(PYTHON_CLI_PROFILE.allowedDocumentationTerminology).toEqual(['python']);
    expect(PYTHON_CLI_PROFILE.compatibleProjectTypes).toEqual([]);
    expect(PYTHON_CLI_PROFILE.compatibleWebFrameworks).toEqual([]);
    expect(profilePaths()).toEqual(['pyproject.toml', 'src/main.py', 'tests/test_main.py', 'README.md']);
    expect(PYTHON_CLI_PROFILE.targetExpectations.every((target) => target.matcher.kind === 'exact')).toBe(true);
  });

  it('TST-003/TST-004: resolves the exact profile ID and bounded python alias, but not fuzzy values', () => {
    expect(resolveGreenfieldProfile(normalized({ preferredProfile: 'python-cli' })).profile).toBe(PYTHON_CLI_PROFILE);
    expect(resolveGreenfieldProfile(normalized({ preferredProfile: 'python' })).profile).toBe(PYTHON_CLI_PROFILE);
    for (const preferredProfile of ['pythn', 'py', 'pythonish']) {
      const result = resolveGreenfieldProfile(normalized({ preferredProfile }));
      expect(result.status).toBe('unsupported');
      expect(result.profile).toBeUndefined();
    }
  });

  it('TST-005/TST-006/TST-007: infers only explicit Python plus CLI intent', () => {
    const cli = resolveGreenfieldProfile(normalized({ preferredStack: ['Python', 'command-line application'] }));
    expect(cli.status).toBe('selected');
    expect(cli.profile).toBe(PYTHON_CLI_PROFILE);

    const bare = resolveGreenfieldProfile(normalized({ preferredStack: ['Python'] }));
    expect(bare.status).toBe('unresolved');
    expect(bare.profile).toBeUndefined();
    expect(bare.reason).toMatch(/does not establish command-line intent/i);

    for (const brief of [
      { preferredStack: ['Python'], platformTarget: 'web' },
      { preferredStack: ['Python', 'API server'] },
      { preferredStack: ['Python'], projectType: 'fullstack-web', webFramework: 'nextjs' },
    ]) {
      const mismatch = resolveGreenfieldProfile(normalized(brief));
      expect(mismatch.status).toBe('unsupported');
      expect(mismatch.profile).toBeUndefined();
      expect(mismatch.reason).toMatch(/python.*web|only supported Python profile/i);
    }
  });

  it('TST-008/TST-009/TST-010: preserves TypeScript fallback, Next.js resolution, and mobile ambiguity', () => {
    expect(resolveGreenfieldProfile(normalized()).profile).toBe(TYPESCRIPT_CLI_PROFILE);
    expect(resolveGreenfieldProfile(normalized({ platformTarget: 'web' })).profile).toBe(NEXTJS_APP_PROFILE);
    const mobile = resolveGreenfieldProfile(normalized({ platformTarget: 'mobile' }));
    expect(mobile.status).toBe('unresolved');
    expect(mobile.profile).toBeUndefined();
    expect(resolveGreenfieldProfile(normalized({ preferredProfile: 'android' })).profile).toBe(
      ANDROID_COMPOSE_PROFILE,
    );
  });

  it('TST-011/TST-012/TST-013: composes and validates common plus Python targets with metadata-driven entry point', () => {
    const effectivePaths = exactGreenfieldTargetPaths(composeEffectiveGreenfieldTargetExpectations(PYTHON_CLI_PROFILE));
    expect(effectivePaths).toEqual([...GREENFIELD_PROJECT_INSTRUCTION_PATHS, ...profilePaths()]);
    expect(effectivePaths).toHaveLength(8);
    expect(new Set(effectivePaths).size).toBe(8);

    const plan = buildScaffoldPlan(bundleFor({ preferredProfile: 'python-cli' }));
    const plannedPaths = plan.plannedFileGroups.flatMap((group) => group.filePaths);
    expect(plannedPaths).toEqual(expect.arrayContaining(effectivePaths));
    expect(plannedPaths).toHaveLength(effectivePaths.length);
    expect(new Set(plannedPaths).size).toBe(effectivePaths.length);
    expect(plan.setupCommands.map((command) => command.command)).toEqual(['python -m pip install -e ".[dev]"']);
    expect(plan.validationCommands.map((command) => command.command)).toEqual([
      'python -m compileall src',
      'python -m pytest',
      'python src/main.py --help',
    ]);
    expect(plan.firstRunnableBehavior.entryPoint).toBe('src/main.py');
    expect(validateGreenfieldScaffoldPlan(PYTHON_CLI_PROFILE, plan)).toEqual({ valid: true, issues: [] });
  });

  it('TST-014: preserves metadata-owned entry points for all existing profiles', () => {
    const expected = new Map([
      [TYPESCRIPT_CLI_PROFILE.id, 'src/cli.ts'],
      [NEXTJS_APP_PROFILE.id, 'app/layout.tsx'],
      [ANDROID_COMPOSE_PROFILE.id, 'app/src/main/java/MainActivity.kt'],
    ]);
    for (const profile of [TYPESCRIPT_CLI_PROFILE, NEXTJS_APP_PROFILE, ANDROID_COMPOSE_PROFILE]) {
      expect(buildScaffoldPlan(bundleFor({ preferredProfile: profile.id })).firstRunnableBehavior.entryPoint).toBe(
        expected.get(profile.id),
      );
    }
  });

  it('TST-015: feeds Python profile facts into the shared project-instruction generator', () => {
    const generated = buildGreenfieldProjectInstructionBundle(bundleFor({ preferredProfile: 'python-cli' }));
    const manuals = generated.targets
      .filter((target) => target.path === 'agents.txt' || target.path === 'claude.txt')
      .map((target) => target.content)
      .join('\n');
    expect(manuals).toMatch(/Python CLI/);
    expect(manuals).toContain('python -m pip install -e ".[dev]"');
    expect(manuals).toContain('python -m compileall src');
    expect(manuals).toContain('python -m pytest');
    expect(manuals).toContain('python src/main.py --help');
    expect(manuals).toMatch(/does not execute setup or validation commands/i);
  });

  it('TST-016/TST-017/TST-018: makes Python terminology profile-owned without regressing existing tags', () => {
    const pythonDocs = bootstrapProjectDocs(bundleFor({ preferredProfile: 'python-cli' }));
    expect(validateBootstrapDocs(pythonDocs, 'python-cli').valid).toBe(true);
    expect(validateBootstrapDocs(pythonDocs, 'typescript-cli').issues).toContainEqual(
      expect.objectContaining({ kind: 'python-stack-claim' }),
    );
    expect(validateBootstrapDocs(bootstrapProjectDocs(bundleFor({ preferredProfile: 'nextjs-app' })), 'nextjs-app').valid).toBe(
      true,
    );
    expect(
      validateBootstrapDocs(bootstrapProjectDocs(bundleFor({ preferredProfile: 'android-compose' })), 'android-compose')
        .valid,
    ).toBe(true);
  });

  it('TST-019: rejects Python CLI combined with the existing Next.js full-stack capability dimensions', () => {
    const bundle = bundleFor({
      preferredProfile: 'python-cli',
      projectType: 'fullstack-web',
      webFramework: 'nextjs',
    });
    expect(bundle.selectedProfile.status).toBe('unsupported');
    expect(bundle.selectedProfile.profile).toBeUndefined();
    expect(bundle.fullstackCapability.status).not.toBe('selected');
    expect(bundle.fullstackCapability.capability).toBeUndefined();
  });

  it('TST-020: rejects Python-owned targets under another profile without misclassifying common targets', () => {
    const pythonPlan = buildScaffoldPlan(bundleFor({ preferredProfile: 'python-cli' }));
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, pythonPlan);
    const unsupported = result.issues.filter((issue) => issue.code === 'GF_TARGET_UNSUPPORTED');
    expect(JSON.stringify(unsupported)).toMatch(/pyproject\.toml|src\/main\.py/);
    expect(JSON.stringify(unsupported)).not.toMatch(/agents\.txt|claude\.txt|AGENTS\.md|CLAUDE\.md/);
  });

  it('TST-021/TST-022: uses registry-owned starter guidance and preserves the 15 public documents', () => {
    const starterProfile = STAGE_INSTRUCTION_CONTENT['stage.greenfield.starter-profile'];
    // v1.4.1: taskInstructions no longer names the internal
    // SUPPORTED_PROFILES registry source (not visible to an installed
    // package's coding agent); it now points at the profile IDs the
    // rendered prompt lists directly. The registry-owned validation
    // requirement text is unaffected.
    expect(starterProfile.taskInstructions).toMatch(/supported starter profile IDs listed below/);
    expect(starterProfile.validationRequirements.join('\n')).toMatch(/canonical SUPPORTED_PROFILES registry/);
    expect(`${starterProfile.taskInstructions}\n${starterProfile.validationRequirements.join('\n')}`).not.toMatch(
      /typescript-cli, nextjs-app, android-compose(?:, python-cli)?/,
    );
    expect(GREENFIELD_CANONICAL_DOCUMENTS).toHaveLength(15);
  });
});
