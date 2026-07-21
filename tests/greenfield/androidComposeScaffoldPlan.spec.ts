import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { normalizeProjectBrief } from '../../src/greenfield/brief/normalizeProjectBrief';
import { resolveGreenfieldProfile } from '../../src/greenfield/profiles/resolveGreenfieldProfile';
import { buildGreenfieldBootstrapBundle } from '../../src/greenfield/bootstrap/buildBootstrapBundle';
import { buildScaffoldPlan } from '../../src/greenfield/scaffold/buildScaffoldPlan';

function buildAndroidComposePlan(rawIdea: string, overrides: Record<string, unknown> = {}) {
  const normalizedBrief = normalizeProjectBrief({
    rawIdea,
    preferredProfile: 'android-compose',
    ...overrides,
  } as any).normalized;
  const selection = resolveGreenfieldProfile(normalizedBrief);
  const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);
  return buildScaffoldPlan(bundle);
}

describe('buildScaffoldPlan - Android Compose (v1.2.0)', () => {
  it('uses setupCommands directly from the profile ([] for android-compose)', () => {
    const plan = buildAndroidComposePlan('An Android app.');
    expect(plan.setupCommands).toEqual([]);
  });

  it('does not invent an npm install step when setupCommands is empty', () => {
    const plan = buildAndroidComposePlan('An Android app.');
    expect(plan.setupCommands.some((c) => c.command.includes('npm'))).toBe(false);
  });

  it('uses validationCommands directly from the profile (Gradle-based)', () => {
    const plan = buildAndroidComposePlan('An Android app.');
    const commands = plan.validationCommands.map((c) => c.command);
    expect(commands).toEqual(['./gradlew build', './gradlew testDebugUnitTest', './gradlew connectedAndroidTest']);
    expect(commands.every((c) => !c.includes('npm'))).toBe(true);
  });

  it('marks connectedAndroidTest as optional and device/emulator-dependent', () => {
    const plan = buildAndroidComposePlan('An Android app.');
    const instrumented = plan.validationCommands.find((c) => c.command.includes('connectedAndroidTest'));
    expect(instrumented?.required).toBe(false);
    expect(instrumented?.environmentNotes).toMatch(/device|emulator/i);
    const buildCmd = plan.validationCommands.find((c) => c.command === './gradlew build');
    expect(buildCmd?.required).toBe(true);
  });

  it('planned file groups include Gradle config files and Android source files', () => {
    const plan = buildAndroidComposePlan('An Android app.');
    const configGroup = plan.plannedFileGroups.find((g) => g.name === 'configuration');
    const sourceGroup = plan.plannedFileGroups.find((g) => g.name === 'source');
    expect(configGroup?.filePaths).toEqual(expect.arrayContaining(['settings.gradle.kts', 'build.gradle.kts']));
    expect(sourceGroup?.filePaths.some((p) => p.includes('AndroidManifest.xml'))).toBe(true);
    expect(sourceGroup?.filePaths.some((p) => p.includes('MainActivity.kt'))).toBe(true);
  });

  it('detects a Kotlin entry point (broadened entry-point regex)', () => {
    const plan = buildAndroidComposePlan('An Android app.');
    expect(plan.firstRunnableBehavior.entryPoint).toMatch(/\.kt$/);
  });

  it('does not run Gradle, Android SDK, or Kotlin compiler commands while building the plan', () => {
    const ownDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-android-scaffold-'));
    try {
      const before = fs.readdirSync(ownDir).length;
      buildAndroidComposePlan('An Android app.');
      const after = fs.readdirSync(ownDir).length;
      expect(after).toBe(before);
    } finally {
      fs.rmSync(ownDir, { recursive: true, force: true });
    }
  });

  it('is deterministic', () => {
    const normalizedBrief = normalizeProjectBrief({
      rawIdea: 'An Android app for tracking habits.',
      preferredProfile: 'android-compose',
    }).normalized;
    const selection = resolveGreenfieldProfile(normalizedBrief);
    const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);
    expect(buildScaffoldPlan(bundle)).toEqual(buildScaffoldPlan(bundle));
  });
});

describe('buildScaffoldPlan - existing profile regressions (v1.2.0)', () => {
  function buildPlanFor(preferredProfile: string) {
    const normalizedBrief = normalizeProjectBrief({
      rawIdea: 'A tool.',
      preferredProfile,
    }).normalized;
    const selection = resolveGreenfieldProfile(normalizedBrief);
    const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);
    return buildScaffoldPlan(bundle);
  }

  it('TypeScript CLI scaffold plan keeps npm-based setup/validation commands', () => {
    const plan = buildPlanFor('typescript-cli');
    expect(plan.setupCommands).toEqual([
      { command: 'npm install', purpose: 'Install dependencies.', required: true },
    ]);
    expect(plan.validationCommands.map((c) => c.command)).toEqual([
      'npm run typecheck',
      'npm run build',
      'npm test',
    ]);
    expect(plan.validationCommands.every((c) => c.required)).toBe(true);
  });

  it('Next.js scaffold plan keeps npm-based setup/validation commands', () => {
    const plan = buildPlanFor('nextjs-app');
    expect(plan.setupCommands).toEqual([
      { command: 'npm install', purpose: 'Install dependencies.', required: true },
    ]);
    expect(plan.validationCommands.map((c) => c.command)).toEqual([
      'npm run typecheck',
      'npm run build',
      'npm test',
    ]);
  });

  it('TypeScript CLI entry point detection still works (.ts/.tsx, not accidentally broadened to unrelated files)', () => {
    const plan = buildPlanFor('typescript-cli');
    expect(plan.firstRunnableBehavior.entryPoint).toMatch(/\.(ts|tsx)$/);
  });
});
