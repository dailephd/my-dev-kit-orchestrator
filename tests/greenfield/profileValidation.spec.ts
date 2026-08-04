import { GreenfieldProfile } from '../../src/greenfield/profiles/profileTypes';
import { TYPESCRIPT_CLI_PROFILE } from '../../src/greenfield/profiles/typescriptCliProfile';
import { NEXTJS_APP_PROFILE } from '../../src/greenfield/profiles/nextjsAppProfile';
import { ANDROID_COMPOSE_PROFILE } from '../../src/greenfield/profiles/androidComposeProfile';
import { validateGreenfieldProfile } from '../../src/greenfield/profiles/validateGreenfieldProfile';
import { validateGreenfieldProfileRegistry } from '../../src/greenfield/profiles/validateGreenfieldProfileRegistry';
import {
  validateSupportedGreenfieldProfileRegistry,
  SUPPORTED_PROFILES,
  PROFILE_ALIASES,
} from '../../src/greenfield/profiles/resolveGreenfieldProfile';
import { GreenfieldProfileAliasEntry } from '../../src/greenfield/profiles/profileValidationTypes';

// TST-001, TST-002, TST-003: each current profile passes local validation
// with zero issues and unchanged public fields.
describe('validateGreenfieldProfile - current profiles (TST-001..003)', () => {
  it('TST-001: typescript-cli is valid with no issues and unchanged fields', () => {
    const before = JSON.parse(JSON.stringify(TYPESCRIPT_CLI_PROFILE));
    const result = validateGreenfieldProfile(TYPESCRIPT_CLI_PROFILE);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(TYPESCRIPT_CLI_PROFILE).toEqual(before);
  });

  it('TST-002: nextjs-app is valid with no issues', () => {
    const before = JSON.parse(JSON.stringify(NEXTJS_APP_PROFILE));
    const result = validateGreenfieldProfile(NEXTJS_APP_PROFILE);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(NEXTJS_APP_PROFILE).toEqual(before);
  });

  it('TST-003: android-compose is valid, empty setupCommands accepted, optional device command preserved', () => {
    const before = JSON.parse(JSON.stringify(ANDROID_COMPOSE_PROFILE));
    const result = validateGreenfieldProfile(ANDROID_COMPOSE_PROFILE);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(ANDROID_COMPOSE_PROFILE.setupCommands).toEqual([]);
    const instrumented = ANDROID_COMPOSE_PROFILE.validationCommands.find((c) =>
      c.command.includes('connectedAndroidTest'),
    );
    expect(instrumented?.required).toBe(false);
    expect(ANDROID_COMPOSE_PROFILE).toEqual(before);
  });

  it('the complete built-in registry passes registry validation with an empty issue array', () => {
    const result = validateSupportedGreenfieldProfileRegistry();
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });
});

function validProfileFixture(overrides: Partial<GreenfieldProfile> = {}): GreenfieldProfile {
  return {
    id: 'typescript-cli',
    displayName: 'TypeScript CLI',
    category: 'cli',
    supportedProjectKind: 'command-line tool',
    stackAssumptions: ['TypeScript'],
    templateTargets: ['package.json'],
    documentationExpectations: ['README.md usage section'],
    testExpectations: ['unit tests'],
    validationExpectations: ['typecheck'],
    scaffoldPlanningHints: ['single package'],
    unsupportedConditions: ['requires a UI'],
    notesForBootstrapBundle: 'Minimal layout.',
    setupCommands: [{ command: 'npm install', purpose: 'Install dependencies.', required: true }],
    validationCommands: [{ command: 'npm test', purpose: 'Run tests.', required: true }],
    allowedDocumentationTerminology: [],
    ...overrides,
  };
}

// TST-004: profile missing a required field -> GF_PROFILE_MISSING_FIELD, no throw.
describe('validateGreenfieldProfile - missing required field (TST-004)', () => {
  it('flags a missing required text field with GF_PROFILE_MISSING_FIELD and does not throw', () => {
    const malformed = validProfileFixture() as Partial<GreenfieldProfile>;
    delete malformed.displayName;

    expect(() => validateGreenfieldProfile(malformed as GreenfieldProfile)).not.toThrow();
    const result = validateGreenfieldProfile(malformed as GreenfieldProfile);

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'GF_PROFILE_MISSING_FIELD',
        severity: 'error',
        affectedContract: 'displayName',
      }),
    );
  });

  it('flags a missing required array field with GF_PROFILE_MISSING_FIELD', () => {
    const malformed = validProfileFixture() as Partial<GreenfieldProfile>;
    delete malformed.validationCommands;

    const result = validateGreenfieldProfile(malformed as GreenfieldProfile);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_PROFILE_MISSING_FIELD', affectedContract: 'validationCommands' }),
    );
  });
});

// TST-005: blank required text/list element -> GF_PROFILE_EMPTY_FIELD.
describe('validateGreenfieldProfile - blank required field (TST-005)', () => {
  it('flags a blank required text field with GF_PROFILE_EMPTY_FIELD', () => {
    const malformed = validProfileFixture({ category: '   ' });
    const result = validateGreenfieldProfile(malformed);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_PROFILE_EMPTY_FIELD', affectedContract: 'category' }),
    );
  });

  it('flags an empty required list with GF_PROFILE_EMPTY_FIELD', () => {
    const malformed = validProfileFixture({ stackAssumptions: [] });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_PROFILE_EMPTY_FIELD', affectedContract: 'stackAssumptions' }),
    );
  });

  it('flags a blank element inside a required list with GF_PROFILE_EMPTY_FIELD', () => {
    const malformed = validProfileFixture({ stackAssumptions: ['TypeScript', '   '] });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_PROFILE_EMPTY_FIELD', affectedContract: 'stackAssumptions[1]' }),
    );
  });

  it('does not throw for an entirely malformed input object', () => {
    expect(() => validateGreenfieldProfile({} as GreenfieldProfile)).not.toThrow();
    const result = validateGreenfieldProfile({} as GreenfieldProfile);
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.every((issue) => issue.severity === 'error' || issue.severity === 'warning')).toBe(true);
  });
});

// TST-013: unknown extension field -> GF_PROFILE_UNSUPPORTED_FIELD.
describe('validateGreenfieldProfile - unsupported extension field (TST-013)', () => {
  it('flags an unknown top-level field as a warning-level GF_PROFILE_UNSUPPORTED_FIELD', () => {
    const withExtra = { ...validProfileFixture(), extraUnknownField: 'nope' } as unknown as GreenfieldProfile;
    const result = validateGreenfieldProfile(withExtra);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'GF_PROFILE_UNSUPPORTED_FIELD',
        severity: 'warning',
        affectedContract: 'extraUnknownField',
      }),
    );
    // A warning-only profile (no error-severity issues) is still valid.
    expect(result.valid).toBe(true);
  });
});

// TST-006: duplicate profile IDs -> GF_REGISTRY_DUPLICATE_ID, deterministic order, every participant reported.
describe('validateGreenfieldProfileRegistry - duplicate profile ids (TST-006)', () => {
  it('flags both entries sharing one id with GF_REGISTRY_DUPLICATE_ID', () => {
    const first = validProfileFixture({ id: 'typescript-cli', displayName: 'First' });
    const second = validProfileFixture({ id: 'typescript-cli', displayName: 'Second' });

    const result = validateGreenfieldProfileRegistry([first, second], []);
    const duplicateIssues = result.issues.filter((issue) => issue.code === 'GF_REGISTRY_DUPLICATE_ID');
    expect(duplicateIssues).toHaveLength(2);
    expect(result.valid).toBe(false);
  });

  it('produces the same ordered issues regardless of registry input order', () => {
    const first = validProfileFixture({ id: 'typescript-cli', displayName: 'First' });
    const second = validProfileFixture({ id: 'typescript-cli', displayName: 'Second' });

    const forward = validateGreenfieldProfileRegistry([first, second], []);
    const reversed = validateGreenfieldProfileRegistry([second, first], []);
    const forwardCodes = forward.issues.map((i) => `${i.code}|${i.profileId}|${i.evidenceKey}`).sort();
    const reversedCodes = reversed.issues.map((i) => `${i.code}|${i.profileId}|${i.evidenceKey}`).sort();
    expect(forwardCodes).toEqual(reversedCodes);
  });
});

// TST-007: duplicate normalized alias -> GF_ALIAS_DUPLICATE.
describe('validateGreenfieldProfileRegistry - duplicate alias (TST-007)', () => {
  it('flags a normalized alias declared more than once with GF_ALIAS_DUPLICATE', () => {
    const profile = validProfileFixture({ id: 'typescript-cli' });
    const aliases: GreenfieldProfileAliasEntry[] = [
      { alias: 'cli', profileId: 'typescript-cli' },
      { alias: 'CLI', profileId: 'typescript-cli' },
    ];

    const result = validateGreenfieldProfileRegistry([profile], aliases);
    const duplicateIssues = result.issues.filter((issue) => issue.code === 'GF_ALIAS_DUPLICATE');
    expect(duplicateIssues).toHaveLength(2);
    expect(result.valid).toBe(false);
  });
});

// TST-008: alias collides with another profile ID/alias -> GF_ALIAS_COLLISION, no silent routing.
describe('validateGreenfieldProfileRegistry - alias collision (TST-008)', () => {
  it('flags an alias that collides with an existing profile id, on both sides', () => {
    const typescriptCli = validProfileFixture({ id: 'typescript-cli' });
    const nextjsApp = validProfileFixture({ id: 'nextjs-app', displayName: 'Next.js App' });
    const aliases: GreenfieldProfileAliasEntry[] = [{ alias: 'nextjs-app', profileId: 'typescript-cli' }];

    const result = validateGreenfieldProfileRegistry([typescriptCli, nextjsApp], aliases);
    const collisionIssues = result.issues.filter((issue) => issue.code === 'GF_ALIAS_COLLISION');

    // Both the colliding alias entry and the profile whose id it shadows are reported.
    expect(collisionIssues).toContainEqual(
      expect.objectContaining({ profileId: 'typescript-cli', affectedContract: 'registry.alias' }),
    );
    expect(collisionIssues).toContainEqual(
      expect.objectContaining({ profileId: 'nextjs-app', affectedContract: 'registry.id' }),
    );
    expect(result.valid).toBe(false);
  });

  it('does not silently select a winner: registry input order does not change which profiles are flagged', () => {
    const typescriptCli = validProfileFixture({ id: 'typescript-cli' });
    const nextjsApp = validProfileFixture({ id: 'nextjs-app', displayName: 'Next.js App' });
    const aliases: GreenfieldProfileAliasEntry[] = [{ alias: 'nextjs-app', profileId: 'typescript-cli' }];

    const forward = validateGreenfieldProfileRegistry([typescriptCli, nextjsApp], aliases);
    const reversed = validateGreenfieldProfileRegistry([nextjsApp, typescriptCli], aliases);
    const forwardIds = forward.issues.filter((i) => i.code === 'GF_ALIAS_COLLISION').map((i) => i.profileId).sort();
    const reversedIds = reversed.issues.filter((i) => i.code === 'GF_ALIAS_COLLISION').map((i) => i.profileId).sort();
    expect(forwardIds).toEqual(reversedIds);
  });
});

describe('validateGreenfieldProfileRegistry - non-mutation and determinism', () => {
  it('does not mutate the entries or aliases arrays it validates', () => {
    const profile = validProfileFixture();
    const aliases: GreenfieldProfileAliasEntry[] = [{ alias: 'cli', profileId: 'typescript-cli' }];
    const profileBefore = JSON.parse(JSON.stringify(profile));
    const aliasesBefore = JSON.parse(JSON.stringify(aliases));

    validateGreenfieldProfileRegistry([profile], aliases);

    expect(profile).toEqual(profileBefore);
    expect(aliases).toEqual(aliasesBefore);
  });

  it('is deterministic for the same registry input', () => {
    const profile = validProfileFixture();
    const first = validateGreenfieldProfileRegistry([profile], []);
    const second = validateGreenfieldProfileRegistry([profile], []);
    expect(first).toEqual(second);
  });

  it('never throws for expected malformed registry input', () => {
    expect(() => validateGreenfieldProfileRegistry([{} as GreenfieldProfile], [])).not.toThrow();
  });
});

describe('validateSupportedGreenfieldProfileRegistry - built-in registry boundary', () => {
  it('reflects the current SUPPORTED_PROFILES/PROFILE_ALIASES exports without duplication', () => {
    expect(Object.keys(SUPPORTED_PROFILES).sort()).toEqual(['android-compose', 'nextjs-app', 'typescript-cli']);
    expect(PROFILE_ALIASES.android).toBe('android-compose');
    const result = validateSupportedGreenfieldProfileRegistry();
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });
});
