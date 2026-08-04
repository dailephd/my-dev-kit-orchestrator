import { GreenfieldProfile, GreenfieldProfileCommand } from '../../src/greenfield/profiles/profileTypes';
import { validateGreenfieldProfile } from '../../src/greenfield/profiles/validateGreenfieldProfile';
import { TYPESCRIPT_CLI_PROFILE } from '../../src/greenfield/profiles/typescriptCliProfile';
import { NEXTJS_APP_PROFILE } from '../../src/greenfield/profiles/nextjsAppProfile';
import { ANDROID_COMPOSE_PROFILE } from '../../src/greenfield/profiles/androidComposeProfile';

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

// Batch 2 command-contract regression: current built-in profiles remain
// valid with the new command-level checks in place, and unchanged.
describe('validateGreenfieldProfile - current profile command contracts remain valid', () => {
  it('typescript-cli command contract is valid and unchanged', () => {
    const before = JSON.parse(JSON.stringify(TYPESCRIPT_CLI_PROFILE));
    const result = validateGreenfieldProfile(TYPESCRIPT_CLI_PROFILE);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(TYPESCRIPT_CLI_PROFILE).toEqual(before);
  });

  it('nextjs-app command contract is valid and unchanged', () => {
    const result = validateGreenfieldProfile(NEXTJS_APP_PROFILE);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('android-compose command contract is valid: empty setupCommands, optional connectedAndroidTest preserved', () => {
    const result = validateGreenfieldProfile(ANDROID_COMPOSE_PROFILE);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(ANDROID_COMPOSE_PROFILE.setupCommands).toEqual([]);
    const instrumented = ANDROID_COMPOSE_PROFILE.validationCommands.find((c) =>
      c.command.includes('connectedAndroidTest'),
    );
    expect(instrumented?.required).toBe(false);
    expect(instrumented?.environmentNotes).toMatch(/device|emulator/i);
  });
});

// TST-009: command missing command or purpose -> GF_COMMAND_MALFORMED, no throw.
describe('validateGreenfieldProfile - malformed command fields (TST-009)', () => {
  it('flags a command entry with a blank command field', () => {
    const malformed = validProfileFixture({
      validationCommands: [{ command: '   ', purpose: 'Run tests.', required: true }],
    });
    expect(() => validateGreenfieldProfile(malformed)).not.toThrow();
    const result = validateGreenfieldProfile(malformed);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_MALFORMED', affectedContract: 'validationCommands[0].command' }),
    );
  });

  it('flags a command entry with a blank purpose field', () => {
    const malformed = validProfileFixture({
      validationCommands: [{ command: 'npm test', purpose: '', required: true }],
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_MALFORMED', affectedContract: 'validationCommands[0].purpose' }),
    );
  });

  it('flags a command entry missing both command and purpose', () => {
    const malformed = validProfileFixture({
      validationCommands: [{ required: true } as unknown as GreenfieldProfileCommand],
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_MALFORMED', affectedContract: 'validationCommands[0].command' }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_COMMAND_MALFORMED', affectedContract: 'validationCommands[0].purpose' }),
    );
  });

  it('flags an unsupported command-entry field as a warning', () => {
    const malformed = validProfileFixture({
      validationCommands: [
        { command: 'npm test', purpose: 'Run tests.', required: true, extraField: 'nope' } as unknown as GreenfieldProfileCommand,
      ],
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'GF_PROFILE_UNSUPPORTED_FIELD', severity: 'warning' }),
    );
  });

  it('does not mutate the profile it validates', () => {
    const malformed = validProfileFixture({
      validationCommands: [{ command: '', purpose: '', required: true }],
    });
    const before = JSON.parse(JSON.stringify(malformed));
    validateGreenfieldProfile(malformed);
    expect(malformed).toEqual(before);
  });
});

// TST-011: invalid/nonboolean required classification, or an optional
// command missing environmentNotes -> GF_COMMAND_CLASSIFICATION_INVALID.
describe('validateGreenfieldProfile - command classification (TST-011)', () => {
  it('flags a non-boolean required field', () => {
    const malformed = validProfileFixture({
      validationCommands: [{ command: 'npm test', purpose: 'Run tests.', required: 'yes' as unknown as boolean }],
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'GF_COMMAND_CLASSIFICATION_INVALID',
        affectedContract: 'validationCommands[0].required',
      }),
    );
  });

  it('flags an optional command with no environmentNotes explaining its prerequisite', () => {
    const malformed = validProfileFixture({
      validationCommands: [{ command: 'npm test', purpose: 'Run tests.', required: false }],
    });
    const result = validateGreenfieldProfile(malformed);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'GF_COMMAND_CLASSIFICATION_INVALID',
        affectedContract: 'validationCommands[0].environmentNotes',
      }),
    );
  });

  it('accepts an optional command with a non-blank environmentNotes (matches android-compose)', () => {
    const valid = validProfileFixture({
      validationCommands: [
        { command: 'npm test', purpose: 'Run tests.', required: true },
        {
          command: 'npm run e2e',
          purpose: 'Run end-to-end tests.',
          required: false,
          environmentNotes: 'Requires a running local server.',
        },
      ],
    });
    const result = validateGreenfieldProfile(valid);
    expect(result.issues.filter((i) => i.code === 'GF_COMMAND_CLASSIFICATION_INVALID')).toEqual([]);
  });
});

// TST-010: duplicate command entries -> exactly one GF_COMMAND_DUPLICATE with a stable evidence key.
describe('validateGreenfieldProfile - duplicate commands (TST-010)', () => {
  it('flags a duplicate command within one array with exactly one issue', () => {
    const malformed = validProfileFixture({
      validationCommands: [
        { command: 'npm test', purpose: 'Run tests.', required: true },
        { command: 'npm test', purpose: 'Run tests.', required: true },
      ],
    });
    const result = validateGreenfieldProfile(malformed);
    const duplicateIssues = result.issues.filter((i) => i.code === 'GF_COMMAND_DUPLICATE');
    expect(duplicateIssues).toHaveLength(1);
    expect(duplicateIssues[0].evidenceKey).toBe('npm test');
    expect(duplicateIssues[0].severity).toBe('warning');
  });

  it('flags a duplicate command spanning setup and validation arrays', () => {
    const malformed = validProfileFixture({
      setupCommands: [{ command: 'npm install', purpose: 'Install dependencies.', required: true }],
      validationCommands: [
        { command: 'npm install', purpose: 'Install dependencies.', required: true },
        { command: 'npm test', purpose: 'Run tests.', required: true },
      ],
    });
    const result = validateGreenfieldProfile(malformed);
    const duplicateIssues = result.issues.filter((i) => i.code === 'GF_COMMAND_DUPLICATE');
    expect(duplicateIssues).toHaveLength(1);
    expect(duplicateIssues[0].reason).toMatch(/setupCommands\[0\]/);
    expect(duplicateIssues[0].reason).toMatch(/validationCommands\[0\]/);
  });

  it('flags a conflicting duplicate (same command text, different purpose/required) as an error', () => {
    const malformed = validProfileFixture({
      validationCommands: [
        { command: 'npm test', purpose: 'Run tests.', required: true },
        { command: 'npm test', purpose: 'Run a different thing.', required: false, environmentNotes: 'n/a' },
      ],
    });
    const result = validateGreenfieldProfile(malformed);
    const duplicateIssues = result.issues.filter((i) => i.code === 'GF_COMMAND_DUPLICATE');
    expect(duplicateIssues).toHaveLength(1);
    expect(duplicateIssues[0].severity).toBe('error');
    expect(result.valid).toBe(false);
  });

  it('does not flag distinct commands as duplicates', () => {
    const result = validateGreenfieldProfile(validProfileFixture());
    expect(result.issues.filter((i) => i.code === 'GF_COMMAND_DUPLICATE')).toEqual([]);
  });
});

// TST-009/010/011 regression protection: expected malformed command inputs never throw.
describe('validateGreenfieldProfile - non-throwing behavior for malformed commands', () => {
  it('never throws for a completely malformed command array', () => {
    const malformed = validProfileFixture({
      validationCommands: [null, undefined, 'not-an-object', 42] as unknown as GreenfieldProfileCommand[],
    });
    expect(() => validateGreenfieldProfile(malformed)).not.toThrow();
    const result = validateGreenfieldProfile(malformed);
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
