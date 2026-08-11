import { GREENFIELD_CANONICAL_DOCUMENTS } from '../../src/greenfield/bootstrap/projectDocBootstrapTypes';
import { GREENFIELD_PROJECT_INSTRUCTION_PATHS } from '../../src/greenfield/bootstrap/projectInstructions/projectInstructionTypes';
import { FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY } from '../../src/greenfield/fullstack/fullstackCapabilityTypes';
import { ANDROID_COMPOSE_PROFILE } from '../../src/greenfield/profiles/androidComposeProfile';
import { NEXTJS_APP_PROFILE } from '../../src/greenfield/profiles/nextjsAppProfile';
import { SUPPORTED_PROFILES } from '../../src/greenfield/profiles/resolveGreenfieldProfile';
import { normalizeTargetPath } from '../../src/greenfield/profiles/targetPathSafety';
import { TYPESCRIPT_CLI_PROFILE } from '../../src/greenfield/profiles/typescriptCliProfile';
import { PYTHON_CLI_PROFILE } from '../../src/greenfield/profiles/pythonCliProfile';
import type { GreenfieldProfile, GreenfieldTargetExpectation } from '../../src/greenfield/profiles/profileTypes';
import { normalizeProjectBrief } from '../../src/greenfield/brief/normalizeProjectBrief';
import { resolveGreenfieldProfile } from '../../src/greenfield/profiles/resolveGreenfieldProfile';
import { buildGreenfieldBootstrapBundle } from '../../src/greenfield/bootstrap/buildBootstrapBundle';
import { buildScaffoldPlan } from '../../src/greenfield/scaffold/buildScaffoldPlan';
import {
  COMMON_GREENFIELD_TARGET_EXPECTATIONS,
  composeEffectiveGreenfieldTargetExpectations,
  exactGreenfieldTargetPaths,
} from '../../src/greenfield/scaffold/effectiveTargetExpectations';
import { validateGreenfieldScaffoldPlan } from '../../src/greenfield/scaffold/validateGreenfieldScaffoldPlan';

const CURRENT_PROFILES = [TYPESCRIPT_CLI_PROFILE, NEXTJS_APP_PROFILE, ANDROID_COMPOSE_PROFILE, PYTHON_CLI_PROFILE] as const;

function exactPaths(expectations: readonly GreenfieldTargetExpectation[]): string[] {
  return expectations
    .filter((expectation) => expectation.matcher.kind === 'exact')
    .map((expectation) => expectation.matcher.value);
}

function buildPlan(profile: GreenfieldProfile) {
  const normalized = normalizeProjectBrief({
    rawIdea: `A ${profile.displayName} sample project.`,
    preferredProfile: profile.id,
  }).normalized;
  return buildScaffoldPlan(buildGreenfieldBootstrapBundle(normalized, resolveGreenfieldProfile(normalized)));
}

describe('common greenfield target composition (v1.3.3 Batch 2)', () => {
  it('TST-001: owns exactly the four required, exact, unique, path-safe instruction targets', () => {
    expect(exactGreenfieldTargetPaths(COMMON_GREENFIELD_TARGET_EXPECTATIONS)).toEqual(
      GREENFIELD_PROJECT_INSTRUCTION_PATHS,
    );
    expect(COMMON_GREENFIELD_TARGET_EXPECTATIONS).toHaveLength(4);
    expect(new Set(COMMON_GREENFIELD_TARGET_EXPECTATIONS.map((entry) => entry.matcher.value)).size).toBe(4);
    for (const expectation of COMMON_GREENFIELD_TARGET_EXPECTATIONS) {
      expect(expectation.matcher.kind).toBe('exact');
      expect(expectation.required).toBe(true);
      expect(expectation.evidenceKind).toBe('file');
      expect(normalizeTargetPath(expectation.matcher.value).ok).toBe(true);
    }
  });

  it.each([
    ['TST-002', TYPESCRIPT_CLI_PROFILE],
    ['TST-003', NEXTJS_APP_PROFILE],
    ['TST-004', ANDROID_COMPOSE_PROFILE],
    ['TST-B3-011', PYTHON_CLI_PROFILE],
  ] as const)('%s: composes common plus only the selected profile targets', (_id, profile) => {
    const actual = exactGreenfieldTargetPaths(composeEffectiveGreenfieldTargetExpectations(profile));
    expect(actual).toEqual([...GREENFIELD_PROJECT_INSTRUCTION_PATHS, ...exactPaths(profile.targetExpectations)]);
    expect(new Set(actual).size).toBe(actual.length);
  });

  it('TST-005: composes common + nextjs-app + existing full-stack targets without duplicates', () => {
    const actual = exactGreenfieldTargetPaths(
      composeEffectiveGreenfieldTargetExpectations(
        NEXTJS_APP_PROFILE,
        FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY,
      ),
    );
    expect(actual).toEqual([
      ...GREENFIELD_PROJECT_INSTRUCTION_PATHS,
      ...exactPaths(NEXTJS_APP_PROFILE.targetExpectations),
      ...exactPaths(FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY.targetExpectations),
    ]);
    expect(new Set(actual).size).toBe(actual.length);
  });

  it.each(CURRENT_PROFILES)('TST-006: a $id scaffold plan includes every common target exactly once', (profile) => {
    const paths = buildPlan(profile).plannedFileGroups.flatMap((group) => group.filePaths);
    for (const commonPath of GREENFIELD_PROJECT_INSTRUCTION_PATHS) {
      expect(paths.filter((path) => path === commonPath)).toHaveLength(1);
    }
  });

  it('TST-007/TST-008: validation requires common targets without cross-profile false positives', () => {
    const plan = buildPlan(TYPESCRIPT_CLI_PROFILE);
    expect(validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, plan)).toEqual({ valid: true, issues: [] });

    const missingAgentInstructions = {
      ...plan,
      plannedFileGroups: plan.plannedFileGroups.map((group) => ({
        ...group,
        filePaths: group.filePaths.filter((path) => path !== 'agents.txt'),
      })),
    };
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, missingAgentInstructions);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_TARGET_REQUIRED_MISSING', evidenceKey: 'common-agents-instructions' }),
    );
    expect(result.issues.filter((issue) => issue.code === 'GF_TARGET_UNSUPPORTED')).toEqual([]);
  });

  it('TST-012/TST-013: keeps public documents at 15 and registers exactly four starter profiles', () => {
    expect(GREENFIELD_CANONICAL_DOCUMENTS).toHaveLength(15);
    expect(Object.keys(SUPPORTED_PROFILES).sort()).toEqual([
      'android-compose',
      'nextjs-app',
      'python-cli',
      'typescript-cli',
    ]);
  });
});
