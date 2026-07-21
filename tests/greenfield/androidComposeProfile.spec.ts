import { ANDROID_COMPOSE_PROFILE } from '../../src/greenfield/profiles/androidComposeProfile';
import { resolveGreenfieldProfile } from '../../src/greenfield/profiles/resolveGreenfieldProfile';
import { NormalizedGreenfieldBrief } from '../../src/greenfield/brief/briefTypes';

function baseNormalizedBrief(overrides: Partial<NormalizedGreenfieldBrief> = {}): NormalizedGreenfieldBrief {
  return {
    rawIdea: 'A tool for tracking tasks across a small team.',
    constraints: [],
    nonGoals: [],
    preferredStack: [],
    documentationPreferences: [],
    testingExpectations: [],
    unresolved: [],
    ...overrides,
  };
}

describe('ANDROID_COMPOSE_PROFILE', () => {
  it('exists and has id "android-compose"', () => {
    expect(ANDROID_COMPOSE_PROFILE).toBeDefined();
    expect(ANDROID_COMPOSE_PROFILE.id).toBe('android-compose');
  });

  it('has all required GreenfieldProfile fields present', () => {
    expect(ANDROID_COMPOSE_PROFILE.displayName).toEqual(expect.any(String));
    expect(ANDROID_COMPOSE_PROFILE.category).toEqual(expect.any(String));
    expect(ANDROID_COMPOSE_PROFILE.supportedProjectKind).toEqual(expect.any(String));
    expect(Array.isArray(ANDROID_COMPOSE_PROFILE.stackAssumptions)).toBe(true);
    expect(Array.isArray(ANDROID_COMPOSE_PROFILE.templateTargets)).toBe(true);
    expect(Array.isArray(ANDROID_COMPOSE_PROFILE.documentationExpectations)).toBe(true);
    expect(Array.isArray(ANDROID_COMPOSE_PROFILE.testExpectations)).toBe(true);
    expect(Array.isArray(ANDROID_COMPOSE_PROFILE.validationExpectations)).toBe(true);
    expect(Array.isArray(ANDROID_COMPOSE_PROFILE.scaffoldPlanningHints)).toBe(true);
    expect(Array.isArray(ANDROID_COMPOSE_PROFILE.unsupportedConditions)).toBe(true);
    expect(ANDROID_COMPOSE_PROFILE.notesForBootstrapBundle).toEqual(expect.any(String));
  });

  it('declares setupCommands (present, even if empty) and validationCommands (non-empty)', () => {
    expect(Array.isArray(ANDROID_COMPOSE_PROFILE.setupCommands)).toBe(true);
    expect(Array.isArray(ANDROID_COMPOSE_PROFILE.validationCommands)).toBe(true);
    expect(ANDROID_COMPOSE_PROFILE.validationCommands.length).toBeGreaterThan(0);
  });

  it('setupCommands is empty: the Gradle wrapper needs no separate install step', () => {
    expect(ANDROID_COMPOSE_PROFILE.setupCommands).toEqual([]);
  });

  it('validationCommands are Gradle-based, not npm-based', () => {
    const commandStrings = ANDROID_COMPOSE_PROFILE.validationCommands.map((c) => c.command);
    for (const command of commandStrings) {
      expect(command).toMatch(/^\.\/gradlew/);
      expect(command).not.toMatch(/npm/);
    }
  });

  it('marks the connected-device instrumentation test command as not required', () => {
    const instrumented = ANDROID_COMPOSE_PROFILE.validationCommands.find((c) =>
      c.command.includes('connectedAndroidTest'),
    );
    expect(instrumented).toBeDefined();
    expect(instrumented?.required).toBe(false);
    expect(instrumented?.environmentNotes).toMatch(/device|emulator/i);
  });

  it('stack assumptions include Kotlin, Jetpack Compose, Gradle, and Android app module', () => {
    const stack = ANDROID_COMPOSE_PROFILE.stackAssumptions.join(' | ');
    expect(stack).toMatch(/Kotlin/);
    expect(stack).toMatch(/Jetpack Compose/);
    expect(stack).toMatch(/Gradle/);
    expect(stack).toMatch(/Android app module/);
  });

  it('template targets include Gradle files, AndroidManifest, MainActivity, and test locations', () => {
    const targets = ANDROID_COMPOSE_PROFILE.templateTargets.join(' | ');
    expect(targets).toMatch(/settings\.gradle\.kts/);
    expect(targets).toMatch(/build\.gradle\.kts/);
    expect(targets).toMatch(/AndroidManifest\.xml/);
    expect(targets).toMatch(/MainActivity\.kt/);
    expect(targets).toMatch(/src\/test\//);
    expect(targets).toMatch(/src\/androidTest\//);
  });

  it('documentation expectations include Android SDK/environment notes', () => {
    const docs = ANDROID_COMPOSE_PROFILE.documentationExpectations.join(' | ');
    expect(docs).toMatch(/Android SDK/i);
    expect(docs).toMatch(/environment/i);
  });

  it('testing expectations include Gradle/Android test guidance', () => {
    const tests = ANDROID_COMPOSE_PROFILE.testExpectations.join(' | ');
    expect(tests).toMatch(/unit test/i);
    expect(tests).toMatch(/instrumentation test/i);
    expect(tests).toMatch(/Gradle/i);
  });

  it('unsupported conditions include missing SDK/Gradle and iOS/Flutter/React Native', () => {
    const conditions = ANDROID_COMPOSE_PROFILE.unsupportedConditions.join(' | ');
    expect(conditions).toMatch(/Android SDK/i);
    expect(conditions).toMatch(/Gradle/i);
    expect(conditions).toMatch(/iOS/i);
    expect(conditions).toMatch(/Flutter/i);
    expect(conditions).toMatch(/React Native/i);
  });

  it('does not claim the orchestrator runs Gradle itself', () => {
    const allText = JSON.stringify(ANDROID_COMPOSE_PROFILE).toLowerCase();
    expect(allText).not.toMatch(/orchestrator (runs|executes|invokes) gradle/);
    expect(ANDROID_COMPOSE_PROFILE.notesForBootstrapBundle.toLowerCase()).toMatch(
      /does not (build android apps itself|invoke gradle)/,
    );
  });

  it('does not claim Play Store or release readiness', () => {
    const allText = JSON.stringify(ANDROID_COMPOSE_PROFILE).toLowerCase();
    expect(allText).not.toMatch(/play store|app release|release ready|production[- ]ready|published?/);
  });

  it('does not claim iOS, Flutter, or React Native support', () => {
    const allText = JSON.stringify(ANDROID_COMPOSE_PROFILE).toLowerCase();
    // These terms may appear only inside unsupportedConditions (already asserted above);
    // the profile must never claim to *support* them.
    expect(allText).not.toMatch(/supports (ios|flutter|react native)/);
  });
});

describe('Android Compose profile resolution end-to-end', () => {
  it('resolves to ANDROID_COMPOSE_PROFILE exactly when explicitly requested', () => {
    const selection = resolveGreenfieldProfile(baseNormalizedBrief({ preferredProfile: 'android-compose' }));
    expect(selection.status).toBe('selected');
    expect(selection.profile).toEqual(ANDROID_COMPOSE_PROFILE);
  });

  it('is deterministic', () => {
    const brief = baseNormalizedBrief({ preferredProfile: 'android-compose' });
    expect(resolveGreenfieldProfile(brief)).toEqual(resolveGreenfieldProfile(brief));
  });
});
