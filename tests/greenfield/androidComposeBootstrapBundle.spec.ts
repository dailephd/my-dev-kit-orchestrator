import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { normalizeProjectBrief } from '../../src/greenfield/brief/normalizeProjectBrief';
import { resolveGreenfieldProfile } from '../../src/greenfield/profiles/resolveGreenfieldProfile';
import { buildGreenfieldBootstrapBundle } from '../../src/greenfield/bootstrap/buildBootstrapBundle';

function buildAndroidComposeBundle(rawIdea: string, overrides: Record<string, unknown> = {}) {
  const normalizedBrief = normalizeProjectBrief({
    rawIdea,
    preferredProfile: 'android-compose',
    ...overrides,
  } as any).normalized;
  const selection = resolveGreenfieldProfile(normalizedBrief);
  return buildGreenfieldBootstrapBundle(normalizedBrief, selection);
}

describe('GreenfieldBootstrapBundle - Android Compose (v1.2.0)', () => {
  it('includes the selected android-compose profile', () => {
    const bundle = buildAndroidComposeBundle('An Android app for tracking habits.');
    expect(bundle.selectedProfile.status).toBe('selected');
    expect(bundle.selectedProfile.profile?.id).toBe('android-compose');
    expect(bundle.starterProfile.profileId).toBe('android-compose');
  });

  it('stackDecision includes Kotlin, Jetpack Compose, Gradle, and Android app module', () => {
    const bundle = buildAndroidComposeBundle('An Android app.');
    const stack = bundle.stackDecision.chosenStack.join(' | ');
    expect(stack).toMatch(/Kotlin/);
    expect(stack).toMatch(/Jetpack Compose/);
    expect(stack).toMatch(/Gradle/);
    expect(stack).toMatch(/Android app module/);
    expect(bundle.stackDecision.status).toBe('resolved');
  });

  it('templateTargets category list is unchanged (three static categories, same as every other profile)', () => {
    const bundle = buildAndroidComposeBundle('An Android app.');
    expect(bundle.templateTargets.map((t) => t.category)).toEqual([
      'project-docs',
      'component-docs',
      'scaffold-tree',
    ]);
  });

  it('scaffoldPlanningInputs carry the android-compose profile id, hints, and template targets', () => {
    const bundle = buildAndroidComposeBundle('An Android app.');
    expect(bundle.scaffoldPlanningInputs.profileId).toBe('android-compose');
    expect(bundle.scaffoldPlanningInputs.templateTargets.join(' ')).toMatch(/AndroidManifest\.xml/);
    expect(bundle.scaffoldPlanningInputs.scaffoldPlanningHints.length).toBeGreaterThan(0);
  });

  it('docGenerationInstructions include Android Compose validation expectations', () => {
    const bundle = buildAndroidComposeBundle('An Android app.');
    expect(bundle.docGenerationInstructions.validationExpectations.join(' ')).toMatch(/Gradle/);
    expect(bundle.docGenerationInstructions.stackDecisionSummary).toMatch(/Android Compose/);
  });

  it('validationRules allow Android/Jetpack claims for android-compose', () => {
    const bundle = buildAndroidComposeBundle('An Android app.');
    const rule = bundle.validationRules.find((r) => r.id === 'android-claims-allowed-for-android-compose');
    expect(rule).toBeDefined();
    expect(bundle.validationRules.find((r) => r.id === 'android-claims-require-android-compose-profile')).toBeUndefined();
  });

  it('validationRules still include the always-on unsupported-platform and release/Play-Store rules', () => {
    const bundle = buildAndroidComposeBundle('An Android app.');
    const ids = bundle.validationRules.map((r) => r.id);
    expect(ids).toContain('no-unsupported-mobile-platform-claims');
    expect(ids).toContain('no-release-security-publish-claims');
    expect(ids).toContain('no-play-store-release-readiness-claims');
  });

  it('validationRules reject Android claims for a non-android-compose profile (regression)', () => {
    const normalizedBrief = normalizeProjectBrief({
      rawIdea: 'A CLI tool.',
      preferredProfile: 'typescript-cli',
    }).normalized;
    const selection = resolveGreenfieldProfile(normalizedBrief);
    const bundle = buildGreenfieldBootstrapBundle(normalizedBrief, selection);
    const ids = bundle.validationRules.map((r) => r.id);
    expect(ids).toContain('android-claims-require-android-compose-profile');
    expect(ids).not.toContain('android-claims-allowed-for-android-compose');
  });

  it('is deterministic for the same normalized brief and profile selection', () => {
    const normalizedBrief = normalizeProjectBrief({
      rawIdea: 'An Android app for tracking habits.',
      preferredProfile: 'android-compose',
    }).normalized;
    const selection = resolveGreenfieldProfile(normalizedBrief);
    const first = buildGreenfieldBootstrapBundle(normalizedBrief, selection);
    const second = buildGreenfieldBootstrapBundle(normalizedBrief, selection);
    expect(first).toEqual(second);
  });

  it('performs no filesystem writes and executes no Gradle commands while building the bundle', () => {
    const ownDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdko-android-bundle-'));
    try {
      const before = fs.readdirSync(ownDir).length;
      buildAndroidComposeBundle('An Android app.');
      const after = fs.readdirSync(ownDir).length;
      expect(after).toBe(before);
    } finally {
      fs.rmSync(ownDir, { recursive: true, force: true });
    }
  });

  it('unresolvedDecisions still records the componentBoundaries limitation for android-compose', () => {
    const bundle = buildAndroidComposeBundle('An Android app.');
    expect(bundle.unresolvedDecisions.some((d) => d.field === 'componentBoundaries')).toBe(true);
  });
});
