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
import { GreenfieldTargetExpectation } from '../../src/greenfield/profiles/profileTypes';

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
    targetExpectations: [
      {
        id: 'package-manifest',
        category: 'configuration',
        matcher: { kind: 'exact', value: 'package.json' },
        required: true,
        purpose: 'Package manifest.',
        evidenceKind: 'file',
      },
    ],
    ...overrides,
  };
}

// TST-012: malformed target expectation -> GF_TARGET_EXPECTATION_INVALID or
// GF_PATH_INVALID_PATTERN, no throw.
describe('validateGreenfieldProfile - malformed target expectation (TST-012)', () => {
  it('flags a target expectation missing required fields', () => {
    const malformed = validProfileFixture({
      targetExpectations: [{} as unknown as GreenfieldTargetExpectation],
    });
    expect(() => validateGreenfieldProfile(malformed)).not.toThrow();
    const result = validateGreenfieldProfile(malformed);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_TARGET_EXPECTATION_INVALID', affectedContract: 'targetExpectations[0].id' }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_TARGET_EXPECTATION_INVALID', affectedContract: 'targetExpectations[0].category' }),
    );
  });

  it('flags an invalid matcher.kind', () => {
    const malformed = validProfileFixture({
      targetExpectations: [
        {
          id: 'bad',
          category: 'source',
          matcher: { kind: 'glob' as unknown as 'exact', value: 'src/*' },
          required: true,
          purpose: 'test',
          evidenceKind: 'file',
        },
      ],
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_TARGET_EXPECTATION_INVALID', affectedContract: 'targetExpectations[0].matcher.kind' }),
    );
  });

  it('flags a non-boolean "required" value', () => {
    const malformed = validProfileFixture({
      targetExpectations: [
        {
          id: 'bad',
          category: 'source',
          matcher: { kind: 'exact', value: 'src/index.ts' },
          required: 'yes' as unknown as boolean,
          purpose: 'test',
          evidenceKind: 'file',
        },
      ],
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_TARGET_EXPECTATION_INVALID', affectedContract: 'targetExpectations[0].required' }),
    );
  });

  it('flags an unsupported evidenceKind', () => {
    const malformed = validProfileFixture({
      targetExpectations: [
        {
          id: 'bad',
          category: 'source',
          matcher: { kind: 'exact', value: 'src/index.ts' },
          required: true,
          purpose: 'test',
          evidenceKind: 'directory' as unknown as 'file',
        },
      ],
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_TARGET_EXPECTATION_INVALID', affectedContract: 'targetExpectations[0].evidenceKind' }),
    );
  });

  it('flags an absolute path in an exact matcher with GF_PATH_ABSOLUTE', () => {
    const malformed = validProfileFixture({
      targetExpectations: [
        {
          id: 'bad',
          category: 'source',
          matcher: { kind: 'exact', value: '/etc/passwd' },
          required: true,
          purpose: 'test',
          evidenceKind: 'file',
        },
      ],
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_PATH_ABSOLUTE' }));
  });

  it('flags a traversal path in an exact matcher with GF_PATH_TRAVERSAL', () => {
    const malformed = validProfileFixture({
      targetExpectations: [
        {
          id: 'bad',
          category: 'source',
          matcher: { kind: 'exact', value: '../secrets.txt' },
          required: true,
          purpose: 'test',
          evidenceKind: 'file',
        },
      ],
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_PATH_TRAVERSAL' }));
  });

  it('flags invalid bounded-pattern syntax with GF_PATH_INVALID_PATTERN', () => {
    const malformed = validProfileFixture({
      targetExpectations: [
        {
          id: 'bad',
          category: 'source',
          matcher: { kind: 'bounded-pattern', value: 'src/**/foo/**/bar' },
          required: true,
          purpose: 'test',
          evidenceKind: 'file',
        },
      ],
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_PATH_INVALID_PATTERN' }));
  });

  it('accepts a valid bounded-pattern expectation', () => {
    const valid = validProfileFixture({
      targetExpectations: [
        {
          id: 'source-file',
          category: 'source',
          matcher: { kind: 'bounded-pattern', value: 'src/*' },
          required: false,
          purpose: 'Any direct source file.',
          evidenceKind: 'file',
        },
      ],
    });
    const result = validateGreenfieldProfile(valid);
    expect(result.issues).toEqual([]);
  });

  it('flags an unsupported target-expectation extension key', () => {
    const malformed = validProfileFixture({
      targetExpectations: [
        {
          id: 'bad',
          category: 'source',
          matcher: { kind: 'exact', value: 'src/index.ts' },
          required: true,
          purpose: 'test',
          evidenceKind: 'file',
          extension: { unapproved: 'value' },
        },
      ],
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_TARGET_EXPECTATION_INVALID', affectedContract: 'targetExpectations[0].extension' }),
    );
  });

  it('does not mutate the profile it validates', () => {
    const malformed = validProfileFixture({
      targetExpectations: [{} as unknown as GreenfieldTargetExpectation],
    });
    const before = JSON.parse(JSON.stringify(malformed));
    validateGreenfieldProfile(malformed);
    expect(malformed).toEqual(before);
  });
});

// PSE-008: duplicate and overlapping target expectations within one profile.
describe('validateGreenfieldProfile - duplicate and overlapping target expectations', () => {
  it('flags a duplicate exact target expectation', () => {
    const malformed = validProfileFixture({
      targetExpectations: [
        {
          id: 'a',
          category: 'source',
          matcher: { kind: 'exact', value: 'src/index.ts' },
          required: true,
          purpose: 'a',
          evidenceKind: 'file',
        },
        {
          id: 'b',
          category: 'source',
          matcher: { kind: 'exact', value: 'src/index.ts' },
          required: true,
          purpose: 'b',
          evidenceKind: 'file',
        },
      ],
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_TARGET_DUPLICATE' }));
  });

  it('flags overlap between an exact expectation and a bounded-pattern expectation that also matches it', () => {
    const malformed = validProfileFixture({
      targetExpectations: [
        {
          id: 'exact-one',
          category: 'source',
          matcher: { kind: 'exact', value: 'src/index.ts' },
          required: true,
          purpose: 'a',
          evidenceKind: 'file',
        },
        {
          id: 'pattern-one',
          category: 'source',
          matcher: { kind: 'bounded-pattern', value: 'src/*' },
          required: false,
          purpose: 'b',
          evidenceKind: 'file',
        },
      ],
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_TARGET_OVERLAP' }));
  });

  it('does not flag distinct, non-overlapping expectations', () => {
    const result = validateGreenfieldProfile(validProfileFixture());
    expect(result.issues.filter((i) => i.code === 'GF_TARGET_DUPLICATE' || i.code === 'GF_TARGET_OVERLAP')).toEqual([]);
  });
});

// v1.3.0 Batch 3 correction: bounded-pattern versus bounded-pattern overlap.
function twoPatternExpectations(
  valueA: string,
  valueB: string,
  overridesA: Record<string, unknown> = {},
  overridesB: Record<string, unknown> = {},
) {
  return [
    {
      id: 'pattern-a',
      category: 'source',
      matcher: { kind: 'bounded-pattern' as const, value: valueA },
      required: true,
      purpose: 'a',
      evidenceKind: 'file' as const,
      ...overridesA,
    },
    {
      id: 'pattern-b',
      category: 'source',
      matcher: { kind: 'bounded-pattern' as const, value: valueB },
      required: true,
      purpose: 'b',
      evidenceKind: 'file' as const,
      ...overridesB,
    },
  ];
}

describe('validateGreenfieldProfile - bounded-pattern versus bounded-pattern overlap', () => {
  it('flags two different "*" patterns that accept a common path', () => {
    const malformed = validProfileFixture({ targetExpectations: twoPatternExpectations('src/*/Main.kt', 'src/app/*') });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_TARGET_OVERLAP' }));
  });

  it('flags "*" versus "**" with a common accepted path', () => {
    const malformed = validProfileFixture({
      targetExpectations: twoPatternExpectations('src/*/Main.kt', 'src/**/Main.kt'),
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_TARGET_OVERLAP' }));
  });

  it('flags two different "**" patterns with a common accepted path', () => {
    const malformed = validProfileFixture({
      targetExpectations: twoPatternExpectations('src/**/Main.kt', 'src/**/*'),
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_TARGET_OVERLAP' }));
  });

  it('does not flag two bounded patterns with no common accepted path', () => {
    const malformed = validProfileFixture({
      targetExpectations: twoPatternExpectations('src/*/Main.kt', 'tests/*/Main.kt'),
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues.filter((i) => i.code === 'GF_TARGET_OVERLAP')).toEqual([]);
  });

  it('classifies identical normalized patterns as duplicate, not an additional overlap issue', () => {
    const malformed = validProfileFixture({
      targetExpectations: twoPatternExpectations('src/*/Main.kt', 'src/*/Main.kt'),
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_TARGET_DUPLICATE' }));
    expect(result.issues.filter((i) => i.code === 'GF_TARGET_OVERLAP')).toEqual([]);
  });

  it('classifies patterns differing only by separator form but normalizing identically as duplicate', () => {
    const malformed = validProfileFixture({
      targetExpectations: twoPatternExpectations('src\\*\\Main.kt', 'src/*/Main.kt'),
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_TARGET_DUPLICATE' }));
    expect(result.issues.filter((i) => i.code === 'GF_TARGET_OVERLAP')).toEqual([]);
  });

  it('detects overlap between a required and an optional pattern expectation', () => {
    const malformed = validProfileFixture({
      targetExpectations: twoPatternExpectations('src/*/Main.kt', 'src/app/*', { required: true }, { required: false }),
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_TARGET_OVERLAP' }));
  });

  it('produces the same overlap finding regardless of expectation pair order', () => {
    const forward = validateGreenfieldProfile(
      validProfileFixture({ targetExpectations: twoPatternExpectations('src/*/Main.kt', 'src/app/*') }),
    );
    const reversed = validateGreenfieldProfile(
      validProfileFixture({ targetExpectations: twoPatternExpectations('src/app/*', 'src/*/Main.kt') }),
    );
    const forwardOverlap = forward.issues.filter((i) => i.code === 'GF_TARGET_OVERLAP').map((i) => i.evidenceKey).sort();
    const reversedOverlap = reversed.issues.filter((i) => i.code === 'GF_TARGET_OVERLAP').map((i) => i.evidenceKey).sort();
    expect(forwardOverlap).toEqual(reversedOverlap);
  });

  it('produces the same overlap finding (by code and normalized-value pair) regardless of the expectation array order', () => {
    // affectedContract embeds each expectation's array index
    // (targetExpectations[N]), so it legitimately differs when the array is
    // reordered -- the same established convention as Batch 1's registry
    // duplicate-id findings. What must stay stable is which codes fire and
    // which normalized values are involved.
    const expectationsForward = twoPatternExpectations('src/*/Main.kt', 'src/app/*');
    const expectationsReversed = [...expectationsForward].reverse();
    const forward = validateGreenfieldProfile(validProfileFixture({ targetExpectations: expectationsForward }));
    const reversed = validateGreenfieldProfile(validProfileFixture({ targetExpectations: expectationsReversed }));
    const project = (result: { issues: readonly { code: string; evidenceKey?: string }[] }) =>
      result.issues.map((i) => `${i.code}:${(i.evidenceKey ?? '').split('~').sort().join('~')}`).sort();
    expect(project(forward)).toEqual(project(reversed));
  });

  it('does not mutate the profile it validates', () => {
    const profile = validProfileFixture({ targetExpectations: twoPatternExpectations('src/*/Main.kt', 'src/app/*') });
    const before = JSON.parse(JSON.stringify(profile));
    validateGreenfieldProfile(profile);
    expect(profile).toEqual(before);
  });

  it('does not produce a misleading overlap finding when one pattern is invalid', () => {
    const malformed = validProfileFixture({
      targetExpectations: twoPatternExpectations('src/*/Main.kt', 'src/**/foo/**/bar'),
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_PATH_INVALID_PATTERN' }));
    expect(result.issues.filter((i) => i.code === 'GF_TARGET_OVERLAP')).toEqual([]);
  });

  it('preserves the existing exact-versus-pattern overlap behavior', () => {
    const malformed = validProfileFixture({
      targetExpectations: [
        {
          id: 'exact-one',
          category: 'source',
          matcher: { kind: 'exact', value: 'src/index.ts' },
          required: true,
          purpose: 'a',
          evidenceKind: 'file',
        },
        {
          id: 'pattern-one',
          category: 'source',
          matcher: { kind: 'bounded-pattern', value: 'src/*' },
          required: false,
          purpose: 'b',
          evidenceKind: 'file',
        },
      ],
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'GF_TARGET_OVERLAP' }));
  });
});

// Batch 2 correction: allowedDocumentationTerminology closed-vocabulary
// runtime validation. TypeScript's GreenfieldDocumentationTerminologyTag
// union protects the three built-in profile literals at compile time; these
// tests prove validateGreenfieldProfile() also rejects unsupported/duplicate
// values at runtime for externally constructed or malformed profile objects
// (e.g. deserialized from JSON, or a future contributor casting past the
// type system).
describe('validateGreenfieldProfile - documentation terminology vocabulary', () => {
  it('an empty terminology list is valid', () => {
    const result = validateGreenfieldProfile(validProfileFixture({ allowedDocumentationTerminology: [] }));
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('["android-jetpack"] is valid', () => {
    const result = validateGreenfieldProfile(
      validProfileFixture({ allowedDocumentationTerminology: ['android-jetpack'] }),
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('["nextjs-react"] is valid', () => {
    const result = validateGreenfieldProfile(
      validProfileFixture({ allowedDocumentationTerminology: ['nextjs-react'] }),
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rejects an unknown terminology value', () => {
    // Runtime-only fixture: the closed GreenfieldDocumentationTerminologyTag
    // union prevents constructing this directly without a cast; the cast
    // simulates an externally supplied or malformed profile object.
    const malformed = validProfileFixture({
      allowedDocumentationTerminology: ['flutter-dart'] as unknown as GreenfieldProfile['allowedDocumentationTerminology'],
    });
    expect(() => validateGreenfieldProfile(malformed)).not.toThrow();
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'GF_PROFILE_UNSUPPORTED_FIELD',
        affectedContract: 'allowedDocumentationTerminology',
        actual: 'flutter-dart',
      }),
    );
  });

  it('rejects a common typo of a supported value', () => {
    const malformed = validProfileFixture({
      allowedDocumentationTerminology: ['andriod-jetpack'] as unknown as GreenfieldProfile['allowedDocumentationTerminology'],
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_PROFILE_UNSUPPORTED_FIELD', actual: 'andriod-jetpack' }),
    );
  });

  it('rejects a duplicate terminology value deterministically', () => {
    const malformed = validProfileFixture({
      allowedDocumentationTerminology: ['android-jetpack', 'android-jetpack'],
    });
    const result = validateGreenfieldProfile(malformed);
    const duplicateIssues = result.issues.filter(
      (i) => i.code === 'GF_PROFILE_UNSUPPORTED_FIELD' && i.reason.includes('more than once'),
    );
    expect(duplicateIssues).toHaveLength(1);
  });

  it('does not mutate the profile it validates', () => {
    const malformed = validProfileFixture({
      allowedDocumentationTerminology: ['bogus-tag', 'bogus-tag'] as unknown as GreenfieldProfile['allowedDocumentationTerminology'],
    });
    const before = JSON.parse(JSON.stringify(malformed));
    validateGreenfieldProfile(malformed);
    expect(malformed).toEqual(before);
  });

  it('never throws for expected invalid terminology values', () => {
    const malformed = validProfileFixture({
      allowedDocumentationTerminology: ['', '  ', 'unknown'] as unknown as GreenfieldProfile['allowedDocumentationTerminology'],
    });
    expect(() => validateGreenfieldProfile(malformed)).not.toThrow();
  });

  it('all three built-in profiles remain valid under the closed vocabulary', () => {
    expect(validateGreenfieldProfile(TYPESCRIPT_CLI_PROFILE).valid).toBe(true);
    expect(validateGreenfieldProfile(NEXTJS_APP_PROFILE).valid).toBe(true);
    expect(validateGreenfieldProfile(ANDROID_COMPOSE_PROFILE).valid).toBe(true);
  });

  it('issue ordering remains deterministic for the same malformed input', () => {
    const malformed = validProfileFixture({
      allowedDocumentationTerminology: ['zeta-unknown', 'alpha-unknown'] as unknown as GreenfieldProfile['allowedDocumentationTerminology'],
    });
    const first = validateGreenfieldProfile(malformed);
    const second = validateGreenfieldProfile(malformed);
    expect(first).toEqual(second);
  });
});

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
