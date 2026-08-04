import { normalizeProjectBrief } from '../../src/greenfield/brief/normalizeProjectBrief';
import { resolveGreenfieldProfile } from '../../src/greenfield/profiles/resolveGreenfieldProfile';
import { buildGreenfieldBootstrapBundle } from '../../src/greenfield/bootstrap/buildBootstrapBundle';
import { buildScaffoldPlan } from '../../src/greenfield/scaffold/buildScaffoldPlan';
import { validateGreenfieldScaffoldPlan } from '../../src/greenfield/scaffold/validateGreenfieldScaffoldPlan';
import { GreenfieldScaffoldPlan } from '../../src/greenfield/scaffold/scaffoldPlanTypes';
import { TYPESCRIPT_CLI_PROFILE } from '../../src/greenfield/profiles/typescriptCliProfile';
import { NEXTJS_APP_PROFILE } from '../../src/greenfield/profiles/nextjsAppProfile';
import { ANDROID_COMPOSE_PROFILE } from '../../src/greenfield/profiles/androidComposeProfile';
import { GreenfieldProfile } from '../../src/greenfield/profiles/profileTypes';

function buildRealPlanFor(rawIdea: string, preferredProfile: string): GreenfieldScaffoldPlan {
  const normalizedBrief = normalizeProjectBrief({ rawIdea, preferredProfile } as any).normalized;
  const selection = resolveGreenfieldProfile(normalizedBrief);
  const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);
  return buildScaffoldPlan(bundle);
}

// TST-014, TST-015, TST-016: valid current plans for each built-in profile.
describe('validateGreenfieldScaffoldPlan - valid current plans (TST-014..016)', () => {
  it('TST-014: a real typescript-cli plan is valid with no issues', () => {
    const plan = buildRealPlanFor('A CLI tool for syncing notes.', 'typescript-cli');
    const before = JSON.parse(JSON.stringify(plan));
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, plan);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(plan).toEqual(before);
  });

  it('TST-015: a real nextjs-app plan is valid with no issues', () => {
    const plan = buildRealPlanFor('A web dashboard for analytics.', 'nextjs-app');
    const result = validateGreenfieldScaffoldPlan(NEXTJS_APP_PROFILE, plan);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('TST-016: a real android-compose plan is valid with Gradle commands and optional instrumentation command', () => {
    const plan = buildRealPlanFor('An Android app for tracking habits.', 'android-compose');
    const result = validateGreenfieldScaffoldPlan(ANDROID_COMPOSE_PROFILE, plan);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(plan.setupCommands).toEqual([]);
    const instrumented = plan.validationCommands.find((c) => c.command.includes('connectedAndroidTest'));
    expect(instrumented?.required).toBe(false);
  });

  it('does not execute any command and does not touch the filesystem', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    expect(() => validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, plan)).not.toThrow();
  });

  it('is deterministic for the same plan', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    const first = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, plan);
    const second = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, plan);
    expect(first).toEqual(second);
  });
});

// TST-017, TST-018: missing/omitted targets.
describe('validateGreenfieldScaffoldPlan - required and optional targets (TST-017, TST-018)', () => {
  it('TST-017: flags a missing required exact target', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    const tampered: GreenfieldScaffoldPlan = {
      ...plan,
      plannedFileGroups: plan.plannedFileGroups.map((g) => ({
        ...g,
        filePaths: g.filePaths.filter((p) => p !== 'README.md'),
      })),
    };
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, tampered);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_TARGET_REQUIRED_MISSING' }));
  });

  it('flags a missing required bounded-pattern target', () => {
    const profileWithPattern: GreenfieldProfile = {
      ...TYPESCRIPT_CLI_PROFILE,
      targetExpectations: [
        {
          id: 'source-file',
          category: 'source',
          matcher: { kind: 'bounded-pattern', value: 'src/*' },
          required: true,
          purpose: 'At least one direct source file.',
          evidenceKind: 'file',
        },
      ],
    };
    const emptyPlan: GreenfieldScaffoldPlan = {
      profileId: 'typescript-cli',
      plannedFileGroups: [{ name: 'source', description: 'x', filePaths: [] }],
      firstRunnableBehavior: { description: 'x' },
      setupCommands: [],
      validationCommands: [],
      testExpectations: [],
      documentationExpectations: [],
      unresolvedDecisions: [],
      nonGoals: [],
      unsupportedClaims: [],
    };
    const result = validateGreenfieldScaffoldPlan(profileWithPattern, emptyPlan);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_TARGET_REQUIRED_MISSING' }));
  });

  it('TST-018: an optional target omitted from the plan does not produce an error', () => {
    const profileWithOptional: GreenfieldProfile = {
      ...TYPESCRIPT_CLI_PROFILE,
      targetExpectations: [
        ...TYPESCRIPT_CLI_PROFILE.targetExpectations,
        {
          id: 'optional-config',
          category: 'configuration',
          matcher: { kind: 'exact', value: '.eslintrc.json' },
          required: false,
          purpose: 'Optional lint configuration.',
          evidenceKind: 'file',
        },
      ],
    };
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    const result = validateGreenfieldScaffoldPlan(profileWithOptional, plan);
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.affectedContract.includes('optional-config'))).toEqual([]);
  });
});

// TST-023: profile mismatch.
describe('validateGreenfieldScaffoldPlan - profile identity mismatch (TST-023)', () => {
  it('flags a plan declaring a different profile id than the selected profile', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    const tampered: GreenfieldScaffoldPlan = { ...plan, profileId: 'nextjs-app' };
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, tampered);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_PLAN_PROFILE_MISMATCH', expected: 'typescript-cli', actual: 'nextjs-app' }),
    );
  });

  it('flags a plan with no declared profile id', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    const tampered: GreenfieldScaffoldPlan = { ...plan, profileId: undefined };
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, tampered);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_PLAN_PROFILE_MISMATCH' }));
  });

  it('does not silently accept an unsupported profile id or perform fuzzy matching', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    const tampered: GreenfieldScaffoldPlan = { ...plan, profileId: 'typescript-cli-ish' as any };
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, tampered);
    expect(result.valid).toBe(false);
  });
});

// TST-019: unsupported cross-profile targets.
describe('validateGreenfieldScaffoldPlan - unsupported and extra targets (TST-019)', () => {
  it('flags a plan target that belongs only to another known profile', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    const tampered: GreenfieldScaffoldPlan = {
      ...plan,
      plannedFileGroups: [
        ...plan.plannedFileGroups,
        { name: 'source', description: 'x', filePaths: ['app/src/main/java/MainActivity.kt'] },
      ],
    };
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, tampered);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_TARGET_UNSUPPORTED', reason: expect.stringContaining('android-compose') }),
    );
  });

  it('does not falsely reject a shared target (README.md/package.json appear in multiple profiles)', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, plan);
    expect(result.issues.filter((i) => i.code === 'GF_TARGET_UNSUPPORTED')).toEqual([]);
  });

  it('accepts a harmless extra target not claimed by any known profile as supplemental (not rejected)', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    const tampered: GreenfieldScaffoldPlan = {
      ...plan,
      plannedFileGroups: [...plan.plannedFileGroups, { name: 'extra', description: 'x', filePaths: ['LICENSE'] }],
    };
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, tampered);
    expect(result.issues.filter((i) => i.code === 'GF_TARGET_UNSUPPORTED')).toEqual([]);
  });
});

// TST-020, TST-021, TST-022: command conformance.
describe('validateGreenfieldScaffoldPlan - command conformance (TST-020..022)', () => {
  it('TST-020: flags a missing required setup command', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    const tampered: GreenfieldScaffoldPlan = { ...plan, setupCommands: [] };
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, tampered);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_PLAN_COMMAND_MISSING', affectedContract: 'setupCommands' }),
    );
  });

  it('a profile with no setup commands (android-compose) remains valid with an empty plan setupCommands', () => {
    const plan = buildRealPlanFor('An Android app.', 'android-compose');
    const result = validateGreenfieldScaffoldPlan(ANDROID_COMPOSE_PROFILE, plan);
    expect(result.issues.filter((i) => i.affectedContract === 'setupCommands')).toEqual([]);
  });

  it('TST-021: flags a missing required verification command', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    const tampered: GreenfieldScaffoldPlan = {
      ...plan,
      validationCommands: plan.validationCommands.filter((c) => c.command !== 'npm test'),
    };
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, tampered);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_PLAN_COMMAND_MISSING', expected: 'npm test' }),
    );
  });

  it('TST-022: an omitted optional verification command remains valid', () => {
    const plan = buildRealPlanFor('An Android app.', 'android-compose');
    const tampered: GreenfieldScaffoldPlan = {
      ...plan,
      validationCommands: plan.validationCommands.filter((c) => !c.command.includes('connectedAndroidTest')),
    };
    const result = validateGreenfieldScaffoldPlan(ANDROID_COMPOSE_PROFILE, tampered);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('flags a required profile command represented as optional in the plan', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    const tampered: GreenfieldScaffoldPlan = {
      ...plan,
      validationCommands: plan.validationCommands.map((c) =>
        c.command === 'npm test' ? { ...c, required: false, environmentNotes: 'n/a' } : c,
      ),
    };
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, tampered);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_PLAN_CONTRADICTORY_CLAIM' }));
  });

  it('flags an optional profile command represented as required in the plan', () => {
    const plan = buildRealPlanFor('An Android app.', 'android-compose');
    const tampered: GreenfieldScaffoldPlan = {
      ...plan,
      validationCommands: plan.validationCommands.map((c) =>
        c.command.includes('connectedAndroidTest') ? { ...c, required: true, environmentNotes: undefined } : c,
      ),
    };
    const result = validateGreenfieldScaffoldPlan(ANDROID_COMPOSE_PROFILE, tampered);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_PLAN_CONTRADICTORY_CLAIM' }));
  });

  it('flags the same command declared in both setup and verification sections with conflicting required values', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    const tampered: GreenfieldScaffoldPlan = {
      ...plan,
      validationCommands: [...plan.validationCommands, { command: 'npm install', purpose: 'x', required: false, environmentNotes: 'n/a' }],
    };
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, tampered);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_PLAN_CONTRADICTORY_CLAIM', affectedContract: 'setupCommands,validationCommands' }),
    );
  });

  it('does not execute any command while validating', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    expect(() => validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, plan)).not.toThrow();
  });
});

// TST-024: mutually contradictory completion/non-goal claim.
describe('validateGreenfieldScaffoldPlan - contradictory completion/non-goal claims (TST-024)', () => {
  it('flags the same claim appearing in both nonGoals and testExpectations', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    const tampered: GreenfieldScaffoldPlan = {
      ...plan,
      nonGoals: ['offline sync support'],
      testExpectations: [...plan.testExpectations, 'offline sync support'],
    };
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, tampered);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_PLAN_CONTRADICTORY_CLAIM', affectedContract: 'nonGoals' }));
  });

  it('does not flag distinct non-goals and expectations', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    const tampered: GreenfieldScaffoldPlan = { ...plan, nonGoals: ['no mobile app'] };
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, tampered);
    expect(result.issues.filter((i) => i.code === 'GF_PLAN_CONTRADICTORY_CLAIM')).toEqual([]);
  });
});

// TST-025: traversal and absolute plan target variants.
describe('validateGreenfieldScaffoldPlan - unsafe plan target paths (TST-025)', () => {
  it('flags an absolute plan target', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    const tampered: GreenfieldScaffoldPlan = {
      ...plan,
      plannedFileGroups: [...plan.plannedFileGroups, { name: 'bad', description: 'x', filePaths: ['/etc/passwd'] }],
    };
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, tampered);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_PATH_ABSOLUTE' }));
  });

  it('flags a traversal plan target', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    const tampered: GreenfieldScaffoldPlan = {
      ...plan,
      plannedFileGroups: [...plan.plannedFileGroups, { name: 'bad', description: 'x', filePaths: ['../secrets.txt'] }],
    };
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, tampered);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_PATH_TRAVERSAL' }));
  });
});

describe('validateGreenfieldScaffoldPlan - duplicate plan targets', () => {
  it('flags the same normalized target declared twice', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    const tampered: GreenfieldScaffoldPlan = {
      ...plan,
      plannedFileGroups: [...plan.plannedFileGroups, { name: 'dup', description: 'x', filePaths: ['package.json'] }],
    };
    const result = validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, tampered);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_TARGET_DUPLICATE' }));
  });
});

describe('validateGreenfieldScaffoldPlan - non-mutation and non-throwing', () => {
  it('does not mutate the profile or the plan', () => {
    const plan = buildRealPlanFor('A CLI tool.', 'typescript-cli');
    const profileBefore = JSON.parse(JSON.stringify(TYPESCRIPT_CLI_PROFILE));
    const planBefore = JSON.parse(JSON.stringify(plan));
    validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, plan);
    expect(TYPESCRIPT_CLI_PROFILE).toEqual(profileBefore);
    expect(plan).toEqual(planBefore);
  });

  it('never throws for a thoroughly malformed plan', () => {
    const malformedPlan = {
      profileId: 'typescript-cli',
      plannedFileGroups: [],
      firstRunnableBehavior: { description: 'x' },
      setupCommands: [],
      validationCommands: [],
      testExpectations: [],
      documentationExpectations: [],
      unresolvedDecisions: [],
      nonGoals: [],
      unsupportedClaims: [],
    } as GreenfieldScaffoldPlan;
    expect(() => validateGreenfieldScaffoldPlan(TYPESCRIPT_CLI_PROFILE, malformedPlan)).not.toThrow();
  });
});
